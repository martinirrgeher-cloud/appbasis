import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import { createPostgresDatabase as createPostgresProvisioningDatabase } from "@appbasis/database/postgres-provisioning";
import {
  EXERCISE_CATALOG_CAPABILITIES,
  ExerciseCatalogService,
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogPostgresClient,
} from "@appbasis/exercise-catalog";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  capabilityId,
  principalId,
  roleId,
} from "@appbasis/permissions";
import {
  provisionPostgresPermissions,
  type PermissionProvisioningPostgresClient,
} from "@appbasis/permissions/provisioning";

import { createExerciseCatalogMinimalApp } from "../worker/app";
import {
  EXERCISE_CATALOG_MINIMAL_DEFINITION,
  EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
} from "../worker/catalog-config";
import {
  createExerciseCatalogMinimalPostgresApplicationRuntime,
  createExerciseCatalogMinimalPostgresRuntime,
} from "../worker/postgres";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    "DATABASE_URL is required for exercise-catalog PostgreSQL E2E tests.",
  );
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_catalog_" + randomUUID().replaceAll("-", "").slice(0, 24);
const isolatedDatabaseUrl = databaseUrlForName(
  databaseUrl,
  isolatedDatabaseName,
);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;

const migrations = [
  new URL(
    "../../../packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
    import.meta.url,
  ),
  new URL(
    "../../../packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
    import.meta.url,
  ),
  new URL(
    "../../../packages/identity/drizzle/0002_appbasis_identity_provisioning_audit.sql",
    import.meta.url,
  ),
  new URL(
    "../../../packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
    import.meta.url,
  ),
  new URL(
    "../../../packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
    import.meta.url,
  ),
  new URL(
    "../../../packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
    import.meta.url,
  ),
  new URL(
    "../../../packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
    import.meta.url,
  ),
  new URL(
    "../../../modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
    import.meta.url,
  ),
  new URL(
    "../../../modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
    import.meta.url,
  ),
  new URL(
    "../../../modules/exercise-catalog/migrations/0002_appbasis_exercise_catalog_parity.sql",
    import.meta.url,
  ),
  new URL(
    "../../../modules/exercise-catalog/migrations/0003_appbasis_exercise_catalog_private_media_delete_state.sql",
    import.meta.url,
  ),
];

const currentIdentity = {
  identity: {
    identityId: "identity-catalog-postgres",
    username: "catalog.postgres",
    displayName: "Catalog PostgreSQL User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=catalog-postgres-token",
  access: "full" as const,
};

const deniedIdentity = {
  identity: {
    ...currentIdentity.identity,
    identityId: "identity-catalog-denied",
    username: "catalog.denied",
    displayName: "Catalog Denied User",
  },
  sessionToken: "appbasis.session=catalog-denied-token",
  access: "full" as const,
};

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    if (sessionToken === currentIdentity.sessionToken) return currentIdentity;
    if (sessionToken === deniedIdentity.sessionToken) return deniedIdentity;
    return null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

beforeAll(async () => {
  await administrativeConnection.client.unsafe(
    "CREATE DATABASE " + isolatedDatabaseName,
  );
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  for (const migration of migrations) {
    await applyMigration(migration);
  }
  await provisionPermissions();
});

beforeEach(async () => {
  await requiredIsolatedConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_exercise_catalog_private_media,
       appbasis_exercise_catalog_usage,
       appbasis_exercise_catalog_similarity,
       appbasis_exercise_catalog_video,
       appbasis_exercise_catalog_favorite,
       appbasis_exercise_catalog_audience,
       appbasis_exercise_catalog_parameter,
       appbasis_exercise_catalog_item`,
  );
});

afterAll(async () => {
  if (isolatedConnection !== null) {
    await isolatedConnection.client.end();
    isolatedConnection = null;
  }
  if (isolatedDatabaseCreated) {
    await administrativeConnection.client.unsafe(
      "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
    );
  }
  await administrativeConnection.client.end();
});

describe("exercise-catalog isolated PostgreSQL consumer", () => {
  it("composes the real identity runtime with the module-owned repository", async () => {
    const runtime =
      await createExerciseCatalogMinimalPostgresApplicationRuntime({
        connectionString: isolatedDatabaseUrl,
        baseURL: "https://catalog.example.test",
        secret: "catalog-runtime-test-secret-000000000000000",
      });
    try {
      await expect(
        runtime.identity.getCurrentIdentity(
          "appbasis.session=missing-session",
        ),
      ).resolves.toBeNull();

      const app = createExerciseCatalogMinimalApp({
        identity: runtime.identity,
        permissions: runtime.permissions,
        catalog: runtime.catalog,
        organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
      });
      const response = await app.request("/api/exercises", {
        headers: { cookie: "appbasis.session=missing-session" },
      });
      expect(response.status).toBe(401);
    } finally {
      await runtime.close();
    }
  });

  it("persists module data atomically and keeps app organization scope isolated", async () => {
    let exerciseId: string;
    const firstRuntime =
      createExerciseCatalogMinimalPostgresRuntime(isolatedDatabaseUrl);
    try {
      const app = createExerciseCatalogMinimalApp({
        identity,
        permissions: firstRuntime.permissions,
        catalog: firstRuntime.catalog,
        organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
        secureCookies: false,
      });

      const created = await app.request("/api/exercises", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Front squat",
          categoryKey: "strength",
          equipment: ["Barbell"],
          audienceIds: ["team-1"],
          parameters: [
            {
              key: "repetitions",
              label: "Repetitions",
              inputType: "number",
              defaultValue: "5",
              minValue: 1,
              maxValue: 20,
              stepValue: 1,
              isRequired: true,
            },
          ],
        }),
      });
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        exercise: { id: string };
      };
      exerciseId = createdBody.exercise.id;

      const favorite = await app.request(
        "/api/exercises/" + exerciseId + "/favorite",
        {
          method: "PUT",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({ favorite: true }),
        },
      );
      expect(favorite.status).toBe(200);

      await firstRuntime.catalog.create("other-org", {
        name: "Other organization item",
        categoryKey: "mobility",
        audienceIds: ["other-team"],
      });
    } finally {
      await firstRuntime.close();
    }

    const secondRuntime =
      createExerciseCatalogMinimalPostgresRuntime(isolatedDatabaseUrl);
    try {
      const app = createExerciseCatalogMinimalApp({
        identity,
        permissions: secondRuntime.permissions,
        catalog: secondRuntime.catalog,
        organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
        secureCookies: false,
      });
      const listed = await app.request("/api/exercises", {
        headers: { cookie: currentIdentity.sessionToken },
      });
      expect(listed.status).toBe(200);
      await expect(listed.json()).resolves.toMatchObject({
        exercises: [
          {
            isFavorite: true,
            item: {
              id: exerciseId,
              organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
              name: "Front squat",
              equipment: ["Barbell"],
              audienceIds: ["team-1"],
              parameters: [
                {
                  key: "repetitions",
                  defaultValue: "5",
                  isRequired: true,
                },
              ],
            },
          },
        ],
      });

      const updated = await app.request("/api/exercises/" + exerciseId, {
        method: "PUT",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ goal: "Build strength" }),
      });
      expect(updated.status).toBe(200);

      const deactivated = await app.request(
        "/api/exercises/" + exerciseId + "/deactivate",
        {
          method: "POST",
          headers: { cookie: currentIdentity.sessionToken },
        },
      );
      expect(deactivated.status).toBe(200);
      await expect(deactivated.json()).resolves.toMatchObject({
        exercise: {
          id: exerciseId,
          goal: "Build strength",
          isActive: false,
        },
      });
    } finally {
      await secondRuntime.close();
    }

    const tables = await requiredIsolatedConnection().client.unsafe(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename LIKE 'ulc_linz_exercise_%'`,
    );
    expect(tables).toEqual([]);
  });

  it("allows the same exercise id in different organizations", async () => {
    const connection = requiredIsolatedConnection();
    await connection.client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_item (
         id, organization_id, name, category_key
       )
       VALUES ($1, $2, $3, $4)`,
      ["tenant-local-id", "org-a", "Shared id", "strength"],
    );
    await connection.client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_item (
         id, organization_id, name, category_key
       )
       VALUES ($1, $2, $3, $4)`,
      ["tenant-local-id", "org-b", "Shared id", "strength"],
    );

    const rows = await connection.client.unsafe(
      `SELECT organization_id, id
       FROM appbasis_exercise_catalog_item
       WHERE id = $1
       ORDER BY organization_id ASC`,
      ["tenant-local-id"],
    );
    expect(rows).toMatchObject([
      { organization_id: "org-a", id: "tenant-local-id" },
      { organization_id: "org-b", id: "tenant-local-id" },
    ]);
  });

  it("reads item aggregates from one repeatable-read snapshot", async () => {
    const writerConnection =
      createPostgresProvisioningDatabase(isolatedDatabaseUrl);
    const readerConnection =
      createPostgresProvisioningDatabase(isolatedDatabaseUrl);
    try {
      const writerService = new ExerciseCatalogService({
        repository: new PostgresExerciseCatalogRepository(
          catalogClient(writerConnection.client),
        ),
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
        createId: () => "snapshot-exercise",
      });
      await writerService.create("snapshot-org", {
        name: "Snapshot exercise",
        categoryKey: "strength",
        goal: "Old goal",
        parameters: [
          {
            key: "repetitions",
            label: "Repetitions",
            inputType: "number",
            defaultValue: "5",
          },
        ],
      });

      const readerRepository = new PostgresExerciseCatalogRepository(
        catalogClient(readerConnection.client, async () => {
          await writerService.update("snapshot-org", "snapshot-exercise", {
            goal: "New goal",
            parameters: [
              {
                key: "repetitions",
                label: "Repetitions",
                inputType: "number",
                defaultValue: "9",
              },
            ],
          });
        }),
      );
      const readerService = new ExerciseCatalogService({
        repository: readerRepository,
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      });

      const snapshot = await readerService.findById(
        "snapshot-org",
        "snapshot-exercise",
      );
      expect(snapshot?.item).toMatchObject({
        goal: "Old goal",
        parameters: [{ key: "repetitions", defaultValue: "5" }],
      });

      const current = await writerService.findById(
        "snapshot-org",
        "snapshot-exercise",
      );
      expect(current?.item).toMatchObject({
        goal: "New goal",
        parameters: [{ key: "repetitions", defaultValue: "9" }],
      });
    } finally {
      await readerConnection.client.end();
      await writerConnection.client.end();
    }
  });

  it("reads items and favorites from the same repeatable-read snapshot", async () => {
    const writerConnection =
      createPostgresProvisioningDatabase(isolatedDatabaseUrl);
    const readerConnection =
      createPostgresProvisioningDatabase(isolatedDatabaseUrl);
    let nextId = 0;

    try {
      const writerService = new ExerciseCatalogService({
        repository: new PostgresExerciseCatalogRepository(
          catalogClient(writerConnection.client),
        ),
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
        createId: () => "favorite-snapshot-" + String(++nextId),
      });
      const first = await writerService.create("favorite-snapshot-org", {
        name: "Existing favorite",
        categoryKey: "strength",
      });
      await writerService.setFavorite(
        "favorite-snapshot-org",
        "favorite-snapshot-principal",
        first.id,
        true,
      );

      const readerRepository = new PostgresExerciseCatalogRepository(
        catalogClient(readerConnection.client, async () => {
          const second = await writerService.create(
            "favorite-snapshot-org",
            {
              name: "New concurrent favorite",
              categoryKey: "mobility",
            },
          );
          await writerService.setFavorite(
            "favorite-snapshot-org",
            "favorite-snapshot-principal",
            second.id,
            true,
          );
        }),
      );
      const readerService = new ExerciseCatalogService({
        repository: readerRepository,
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      });

      const snapshot = await readerService.list(
        "favorite-snapshot-org",
        "favorite-snapshot-principal",
      );
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]).toMatchObject({
        isFavorite: true,
        item: {
          id: first.id,
          name: "Existing favorite",
        },
      });

      const current = await writerService.list(
        "favorite-snapshot-org",
        "favorite-snapshot-principal",
      );
      expect(current).toHaveLength(2);
      expect(current.every((entry) => entry.isFavorite)).toBe(true);
      expect(current.map((entry) => entry.item.name).sort()).toEqual([
        "Existing favorite",
        "New concurrent favorite",
      ]);
    } finally {
      await readerConnection.client.end();
      await writerConnection.client.end();
    }
  });

  it("keeps concurrent partial updates from reactivating a deactivated item", async () => {
    const editorConnection =
      createPostgresProvisioningDatabase(isolatedDatabaseUrl);
    const deactivatorConnection =
      createPostgresProvisioningDatabase(isolatedDatabaseUrl);
    let releaseEditor!: () => void;
    let observeEditorRead!: () => void;
    let observeDeactivateAttempt!: () => void;
    const editorCanCommit = new Promise<void>((resolve) => {
      releaseEditor = resolve;
    });
    const editorReadObserved = new Promise<void>((resolve) => {
      observeEditorRead = resolve;
    });
    const deactivateAttemptObserved = new Promise<void>((resolve) => {
      observeDeactivateAttempt = resolve;
    });

    try {
      const baseService = new ExerciseCatalogService({
        repository: new PostgresExerciseCatalogRepository(
          catalogClient(deactivatorConnection.client),
        ),
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
        createId: () => "partial-race-exercise",
      });
      await baseService.create("partial-race-org", {
        name: "Partial race",
        categoryKey: "strength",
        goal: "Initial goal",
      });

      const editor = new ExerciseCatalogService({
        repository: new PostgresExerciseCatalogRepository(
          catalogClient(editorConnection.client, async () => {
            observeEditorRead();
            await editorCanCommit;
          }),
        ),
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      });
      const deactivator = new ExerciseCatalogService({
        repository: new PostgresExerciseCatalogRepository(
          catalogClient(
            deactivatorConnection.client,
            undefined,
            observeDeactivateAttempt,
          ),
        ),
        definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      });

      const edit = editor.update(
        "partial-race-org",
        "partial-race-exercise",
        { goal: "Concurrent goal" },
      );
      await editorReadObserved;

      const deactivate = deactivator.deactivate(
        "partial-race-org",
        "partial-race-exercise",
      );
      await expect(
        promiseWithin(deactivateAttemptObserved, 1_000),
      ).resolves.toBeUndefined();

      releaseEditor();
      await expect(edit).resolves.toMatchObject({
        goal: "Concurrent goal",
        isActive: true,
      });
      await expect(deactivate).resolves.toMatchObject({
        goal: "Concurrent goal",
        isActive: false,
      });

      await expect(
        baseService.findById(
          "partial-race-org",
          "partial-race-exercise",
        ),
      ).resolves.toMatchObject({
        item: {
          goal: "Concurrent goal",
          isActive: false,
        },
      });
    } finally {
      releaseEditor?.();
      await editorConnection.client.end();
      await deactivatorConnection.client.end();
    }
  });


  it("P02 scopes favorite ownership by both organization and principal on the actual database", async () => {
    const connection = requiredIsolatedConnection();
    const service = new ExerciseCatalogService({
      repository: new PostgresExerciseCatalogRepository(catalogClient(connection.client)),
      definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      createId: () => "p02-shared-exercise",
    });
    const inA = await service.create("p02-org-a", {
      name: "P02 exercise for first tenant", categoryKey: "strength",
    });
    const inB = await service.create("p02-org-b", {
      name: "P02 exercise for second tenant", categoryKey: "strength",
    });
    expect(inA.id).toBe(inB.id);

    expect(await service.setFavorite("p02-org-a", "principal-a", inA.id, true)).toBe(true);
    expect((await service.list("p02-org-a", "principal-a"))[0]?.isFavorite).toBe(true);
    expect((await service.list("p02-org-a", "principal-b"))[0]?.isFavorite).toBe(false);
    expect((await service.list("p02-org-b", "principal-a"))[0]?.isFavorite).toBe(false);

    expect(await service.setFavorite("p02-org-b", "principal-a", inB.id, true)).toBe(true);
    expect(await service.setFavorite("p02-org-a", "principal-a", inA.id, false)).toBe(true);
    expect((await service.list("p02-org-a", "principal-a"))[0]?.isFavorite).toBe(false);
    expect((await service.list("p02-org-b", "principal-a"))[0]?.isFavorite).toBe(true);

    const rows = await connection.client.unsafe(
      `SELECT organization_id, principal_id, exercise_id
       FROM appbasis_exercise_catalog_favorite
       WHERE exercise_id = $1 ORDER BY organization_id`,
      [inA.id],
    );
    expect(rows).toMatchObject([
      { organization_id: "p02-org-b", principal_id: "principal-a", exercise_id: inB.id },
    ]);
  });

  it("P02 keeps private-media deletion in a tenant-scoped request/confirmation sequence", async () => {
    const connection = requiredIsolatedConnection();
    const service = new ExerciseCatalogService({
      repository: new PostgresExerciseCatalogRepository(catalogClient(connection.client)),
      definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      createId: () => "p02-media-exercise",
    });
    const inA = await service.create("p02-media-org-a", {
      name: "Private media first tenant", categoryKey: "strength",
    });
    const inB = await service.create("p02-media-org-b", {
      name: "Private media second tenant", categoryKey: "strength",
    });
    for (const org of [inA.organizationId, inB.organizationId]) {
      await expect(service.registerPrivateMedia(org, inA.id, {
        id: "p02-shared-media-id",
        fileName: "private-training.png",
        storageKey: "private/p02-shared",
        contentType: "image/png",
        sizeBytes: 256,
      })).resolves.toMatchObject({ organizationId: org, exerciseId: inA.id });
    }

    expect(await service.completePrivateMediaDeletion("p02-media-org-a", inA.id, "p02-shared-media-id")).toBe(false);
    expect(await service.requestPrivateMediaDeletion("p02-media-org-a", "wrong-exercise", "p02-shared-media-id")).toBeUndefined();
    expect(await service.requestPrivateMediaDeletion("p02-media-org-a", inA.id, "p02-shared-media-id")).toMatchObject({
      organizationId: "p02-media-org-a", id: "p02-shared-media-id",
    });
    expect(await service.listPrivateMedia("p02-media-org-a", inA.id)).toEqual([]);
    expect(await service.listPrivateMedia("p02-media-org-b", inB.id)).toHaveLength(1);

    const requested = await connection.client.unsafe(
      `SELECT organization_id, storage_key, deletion_requested_at
       FROM appbasis_exercise_catalog_private_media
       WHERE organization_id = $1 AND id = $2`,
      ["p02-media-org-a", "p02-shared-media-id"],
    );
    expect(requested).toHaveLength(1);
    expect(requested[0]?.deletion_requested_at).not.toBeNull();
    // This metadata-only operation does NOT prove object-storage deletion.
    expect(requested[0]?.storage_key).toBe("private/p02-shared");

    expect(await service.completePrivateMediaDeletion("p02-media-org-a", "wrong-exercise", "p02-shared-media-id")).toBe(false);
    expect(await service.completePrivateMediaDeletion("p02-media-org-a", inA.id, "p02-shared-media-id")).toBe(true);
    expect(await service.completePrivateMediaDeletion("p02-media-org-a", inA.id, "p02-shared-media-id")).toBe(false);
    expect(await service.listPrivateMedia("p02-media-org-b", inB.id)).toHaveLength(1);
  });

  it("P02 scopes usage notes and source references to organization even with matching exercise IDs", async () => {
    const connection = requiredIsolatedConnection();
    const service = new ExerciseCatalogService({
      repository: new PostgresExerciseCatalogRepository(catalogClient(connection.client)),
      definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
      createId: () => "p02-usage-shared",
    });
    const inA = await service.create("p02-usage-org-a", {
      name: "Usage for first tenant", categoryKey: "strength",
    });
    // A same-named item in another tenant must not expose the first tenant's notes.
    const inB = await service.create("p02-usage-org-b", {
      name: "Usage for second tenant", categoryKey: "strength",
    });
    expect(inA.id).toBe(inB.id);
    const stored = await service.recordUsage("p02-usage-org-a", inA.id, {
      occurredAt: "2026-11-13T12:00:00.000Z",
      sourceKind: "manual",
      sourceRef: "private-athlete-ref",
      note: "private training detail",
    });
    expect(stored).toMatchObject({ organizationId: "p02-usage-org-a", exerciseId: inA.id });
    expect(await service.listUsage("p02-usage-org-a", inA.id)).toMatchObject([
      { sourceRef: "private-athlete-ref", note: "private training detail" },
    ]);
    expect(await service.listUsage("p02-usage-org-b", inB.id)).toEqual([]);
    expect(await service.listUsageSummaries("p02-usage-org-b")).toEqual([]);
  });

  it("denies an authenticated principal without module capabilities", async () => {
    const runtime =
      createExerciseCatalogMinimalPostgresRuntime(isolatedDatabaseUrl);
    try {
      const app = createExerciseCatalogMinimalApp({
        identity,
        permissions: runtime.permissions,
        catalog: runtime.catalog,
        organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
        secureCookies: false,
      });
      const denied = await app.request("/api/exercises", {
        headers: { cookie: deniedIdentity.sessionToken },
      });
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({
        error: { code: "PERMISSION_DENIED" },
      });
    } finally {
      await runtime.close();
    }
  });
});

function catalogClient(
  client: ReturnType<typeof createPostgresProvisioningDatabase>["client"],
  afterItemRead?: () => Promise<void>,
  beforeLockedItemRead?: () => void,
): ExerciseCatalogPostgresClient {
  let itemReadObserved = false;
  let lockedItemReadObserved = false;
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback({
          async unsafe(query, parameters) {
            const isItemRead =
              query.includes("SELECT id") &&
              query.includes("FROM appbasis_exercise_catalog_item");
            if (
              !lockedItemReadObserved &&
              beforeLockedItemRead !== undefined &&
              isItemRead &&
              query.includes("FOR UPDATE")
            ) {
              lockedItemReadObserved = true;
              beforeLockedItemRead();
            }
            const rows = await transaction.unsafe(query, parameters);
            if (
              !itemReadObserved &&
              afterItemRead !== undefined &&
              isItemRead
            ) {
              itemReadObserved = true;
              await afterItemRead();
            }
            return rows;
          },
        }),
      );
    },
  };
}

async function promiseWithin<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Expected concurrent database operation did not start.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function applyMigration(url: URL) {
  const migration = await readFile(url, "utf8");
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)) {
    await requiredIsolatedConnection().client.unsafe(statement);
  }
}

async function provisionPermissions() {
  const connection = createPostgresProvisioningDatabase(isolatedDatabaseUrl);
  const view = capabilityId(EXERCISE_CATALOG_CAPABILITIES.view);
  const edit = capabilityId(EXERCISE_CATALOG_CAPABILITIES.edit);
  const managerRole = roleId("exercise-catalog:manager");
  const bundle = {
    knownCapabilities: [view, edit],
    roles: [
      {
        roleId: managerRole,
        capabilities: [view, edit],
      },
    ],
    principalRoleAssignments: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [managerRole],
      },
    ],
  };

  try {
    await expect(
      provisionPostgresPermissions(
        provisioningClient(connection.client),
        bundle,
      ),
    ).resolves.toMatchObject({
      capabilitiesCreated: 2,
      rolesCreated: 1,
      roleCapabilitiesCreated: 2,
      principalsCreated: 1,
      principalRolesCreated: 1,
    });
    await expect(
      provisionPostgresPermissions(
        provisioningClient(connection.client),
        bundle,
      ),
    ).resolves.toMatchObject({
      capabilitiesCreated: 0,
      rolesCreated: 0,
      roleCapabilitiesCreated: 0,
      principalsCreated: 0,
      principalRolesCreated: 0,
    });
  } finally {
    await connection.client.end();
  }
}

function provisioningClient(
  client: ReturnType<typeof createPostgresProvisioningDatabase>["client"],
): PermissionProvisioningPostgresClient {
  return {
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  };
}

function databaseUrlForName(
  connectionString: string,
  databaseName: string,
): string {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated PostgreSQL test database is not ready.");
  }
  return isolatedConnection;
}

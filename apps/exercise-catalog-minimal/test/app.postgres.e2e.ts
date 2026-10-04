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
): ExerciseCatalogPostgresClient {
  let itemReadObserved = false;
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback({
          async unsafe(query, parameters) {
            const rows = await transaction.unsafe(query, parameters);
            if (
              !itemReadObserved &&
              afterItemRead !== undefined &&
              query.includes("SELECT id") &&
              query.includes("FROM appbasis_exercise_catalog_item")
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

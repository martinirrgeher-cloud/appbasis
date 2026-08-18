import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresIdentityDeletion } from "@appbasis/identity/postgres-deletion";
import { PostgresIdentityDeletionRetention } from "@appbasis/identity/postgres-deletion-retention";
import { createIdentityRuntime } from "@appbasis/identity/server";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  PostgresPrincipalLifecycleAdministration,
  principalId,
} from "@appbasis/permissions";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

import { deleteUlcLinzIdentityWithCanonicalAuthorization } from "../worker/lifecycle-service";
import {
  PostgresUlcLinzDeletionReconciliationSource,
  reconcileUlcLinzRestoredDatabase,
} from "../worker/restore-reconciliation";
import { runUlcLinzRetention } from "../worker/retention";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const databaseUrl = process.env.DATABASE_URL;
const baseURL = "http://localhost:3000";
const bootstrapUsername = "ulc.lifecycle.persistence.bootstrap";
const bootstrapPassword = "ULC-persistence-bootstrap-password-42";
const actorUsername = "ulc.lifecycle.persistence.admin";
const actorPassword = "ULC-persistence-actor-password-42";
const manualTargetUsername = "ulc.lifecycle.persistence.manual";
const manualTargetPassword = "ULC-persistence-manual-password-42";
const retentionTargetUsername = "ulc.lifecycle.persistence.retention";
const retentionTargetPassword = "ULC-persistence-retention-password-42";
const organizationId = "ulc-linz";
const fixedNow = new Date("2026-08-18T10:30:00.000Z");

type DatabaseManifest = {
  owners: readonly {
    id: string;
    migrations: readonly string[];
  }[];
};

type AppIdentity = Awaited<ReturnType<ReturnType<typeof createIdentityRuntime>["service"]["createInitialUser"]>>;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Linz lifecycle persistence PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Linz lifecycle persistence PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const sourceDatabaseName = `appbasis_ulc_cd_source_${suffix}`;
    const restoredDatabaseName = `appbasis_ulc_cd_restore_${suffix}`;
    const sourceDatabaseUrl = databaseUrlForName(databaseUrl, sourceDatabaseName);
    const restoredDatabaseUrl = databaseUrlForName(databaseUrl, restoredDatabaseName);
    let sourceCreated = false;
    let restoredCreated = false;

    afterAll(async () => {
      if (restoredCreated) {
        await administrativeConnection.client.unsafe(
          `DROP DATABASE ${restoredDatabaseName} WITH (FORCE)`,
        );
      }
      if (sourceCreated) {
        await administrativeConnection.client.unsafe(
          `DROP DATABASE ${sourceDatabaseName} WITH (FORCE)`,
        );
      }
      await administrativeConnection.client.end();
    });

    it("binds real ULC membership/scope persistence, retention and restore reconciliation fail-closed", async () => {
      await administrativeConnection.client.unsafe(`CREATE DATABASE ${sourceDatabaseName}`);
      sourceCreated = true;

      let source = createPostgresDatabase(sourceDatabaseUrl);
      await applyManifestMigrations(source.client);
      const seeded = await seedSourceSnapshot(source);
      await source.client.end();

      // PostgreSQL template cloning gives the test a real older database image.
      // The source is then changed by deletion while the restored copy remains
      // on the pre-delete state that a historical backup would contain.
      await administrativeConnection.client.unsafe(
        `CREATE DATABASE ${restoredDatabaseName} TEMPLATE ${sourceDatabaseName}`,
      );
      restoredCreated = true;

      source = createPostgresDatabase(sourceDatabaseUrl);
      const sourceRuntime = await createRuntime(source, bootstrapUsername, bootstrapPassword);
      const sourceScopes = new PostgresUlcLinzScopePersistence(source.client, () => fixedNow);
      const sourcePermissions = new PostgresPermissionStore(source.client);
      const sourceAccess = new PostgresPrincipalAccessAdministration(source.client);
      const sourcePrincipalLifecycle = new PostgresPrincipalLifecycleAdministration(source.client);
      const sourceIdentityDeletion = new PostgresIdentityDeletion(source.client, () => fixedNow);
      const sourceIdentityRetention = new PostgresIdentityDeletionRetention(
        source.client,
        () => fixedNow,
      );

      const actorSession = await sourceRuntime.service.signInWithUsername({
        username: actorUsername,
        password: actorPassword,
      });
      const actorCurrent = await sourceRuntime.service.getCurrentIdentity(
        actorSession.sessionToken,
      );
      if (actorCurrent === null) throw new Error("Expected authenticated ULC admin actor.");

      await expect(
        sourceScopes.resolveMembership({
          identityId: seeded.actor.identityId,
          organizationId,
        }),
      ).resolves.toEqual({
        organizationId,
        sourceRole: "admin",
        active: true,
      });
      await expect(
        sourceScopes.hasRelation({
          identityId: seeded.manualTarget.identityId,
          organizationId,
          subjectId: seeded.manualTarget.personId ?? "missing",
          relationType: "self",
        }),
      ).resolves.toBe(true);

      await expect(
        deleteUlcLinzIdentityWithCanonicalAuthorization(
          actorCurrent,
          {
            identity: sourceRuntime.service,
            identityDeletion: sourceIdentityDeletion,
            permissions: sourcePermissions,
            accessAdministration: sourceAccess,
            principalLifecycle: sourcePrincipalLifecycle,
            scopes: sourceScopes,
          },
          {
            organizationId: "other-organization",
            targetIdentityId: seeded.manualTarget.identityId,
          },
        ),
      ).rejects.toMatchObject({ code: "UNKNOWN_PERMISSION_STATE" });

      await expect(
        deleteUlcLinzIdentityWithCanonicalAuthorization(
          actorCurrent,
          {
            identity: sourceRuntime.service,
            identityDeletion: sourceIdentityDeletion,
            permissions: sourcePermissions,
            accessAdministration: sourceAccess,
            principalLifecycle: sourcePrincipalLifecycle,
            scopes: sourceScopes,
          },
          {
            organizationId,
            targetIdentityId: seeded.manualTarget.identityId,
          },
        ),
      ).resolves.toMatchObject({
        identityId: seeded.manualTarget.identityId,
        identityDeleted: true,
        permissionPrincipalDeleted: true,
      });

      const retentionResult = await runUlcLinzRetention({
        identity: sourceRuntime.service,
        identityDeletion: sourceIdentityDeletion,
        permissions: sourcePermissions,
        accessAdministration: sourceAccess,
        principalLifecycle: sourcePrincipalLifecycle,
        scopes: sourceScopes,
        identityDeletionRetention: sourceIdentityRetention,
      });
      expect(retentionResult.deletedIdentityIds).toEqual([
        seeded.retentionTarget.identityId,
      ]);
      expect(retentionResult.exceptionIdentityIds).toEqual([
        "fixture-retention-exception",
      ]);
      expect(retentionResult.purgedAppDeletionMarkers).toBe(0);
      expect(retentionResult.purgedIdentityDeletionTombstones).toBe(0);

      for (const deletedIdentityId of [
        seeded.manualTarget.identityId,
        seeded.retentionTarget.identityId,
      ]) {
        await expect(sourcePermissions.findPrincipal(principalId(deletedIdentityId))).resolves.toBeNull();
        await expect(sourceScopes.findLifecycleTarget(deletedIdentityId)).resolves.toBeNull();
        await expect(sourceScopes.findDeletionMarker(deletedIdentityId)).resolves.toMatchObject({
          identityId: deletedIdentityId,
          organizationId,
          sourceRole: "trainer",
        });
      }

      // Ambiguous-response replay remains safe after app membership cleanup:
      // the bounded deletion marker supplies the already-authorized target scope.
      await expect(
        deleteUlcLinzIdentityWithCanonicalAuthorization(
          actorCurrent,
          {
            identity: sourceRuntime.service,
            identityDeletion: sourceIdentityDeletion,
            permissions: sourcePermissions,
            accessAdministration: sourceAccess,
            principalLifecycle: sourcePrincipalLifecycle,
            scopes: sourceScopes,
          },
          {
            organizationId,
            targetIdentityId: seeded.manualTarget.identityId,
          },
        ),
      ).resolves.toMatchObject({
        identityId: seeded.manualTarget.identityId,
        identityDeleted: true,
        alreadyDeleted: true,
      });

      const retentionStates = await sourceScopes.evaluateRetention();
      expect(
        retentionStates.find(
          (state) => state.target.identityId === "fixture-retention-exception",
        ),
      ).toMatchObject({ status: "exception" });
      expect(
        retentionStates.find(
          (state) => state.target.identityId === "fixture-retention-boundary",
        ),
      ).toMatchObject({ status: "active" });

      const restored = createPostgresDatabase(restoredDatabaseUrl);
      const restoredRuntime = await createRuntime(
        restored,
        bootstrapUsername,
        bootstrapPassword,
      );
      const restoredScopes = new PostgresUlcLinzScopePersistence(
        restored.client,
        () => fixedNow,
      );
      const restoredPermissions = new PostgresPermissionStore(restored.client);
      const restoredIdentityDeletion = new PostgresIdentityDeletion(
        restored.client,
        () => fixedNow,
      );
      const restoredAccess = new PostgresPrincipalAccessAdministration(restored.client);
      const restoredPrincipalLifecycle = new PostgresPrincipalLifecycleAdministration(
        restored.client,
      );
      const reconciliationSource = new PostgresUlcLinzDeletionReconciliationSource(
        source.client,
        () => fixedNow,
      );

      const reconciliation = await reconcileUlcLinzRestoredDatabase(
        reconciliationSource,
        {
          identity: restoredRuntime.service,
          identityDeletion: restoredIdentityDeletion,
          permissions: restoredPermissions,
          accessAdministration: restoredAccess,
          principalLifecycle: restoredPrincipalLifecycle,
          scopes: restoredScopes,
        },
      );
      expect(reconciliation.requiredDeletionCount).toBe(2);
      expect(new Set(reconciliation.reconciledIdentityIds)).toEqual(
        new Set([
          seeded.manualTarget.identityId,
          seeded.retentionTarget.identityId,
        ]),
      );

      for (const deletedIdentityId of reconciliation.reconciledIdentityIds) {
        await expect(
          restoredRuntime.service.signInWithUsername({
            username:
              deletedIdentityId === seeded.manualTarget.identityId
                ? manualTargetUsername
                : retentionTargetUsername,
            password:
              deletedIdentityId === seeded.manualTarget.identityId
                ? manualTargetPassword
                : retentionTargetPassword,
          }),
        ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
        await expect(restoredPermissions.findPrincipal(principalId(deletedIdentityId))).resolves.toBeNull();
        await expect(restoredScopes.findLifecycleTarget(deletedIdentityId)).resolves.toBeNull();
      }

      // The marker is retained at the exact 35-day boundary and only removed
      // once it is strictly older than the confirmed maximum backup window.
      const exactBoundary = new Date(fixedNow.getTime() + 35 * 24 * 60 * 60 * 1000);
      const boundaryScopes = new PostgresUlcLinzScopePersistence(
        source.client,
        () => exactBoundary,
      );
      const boundaryIdentityRetention = new PostgresIdentityDeletionRetention(
        source.client,
        () => exactBoundary,
      );
      await expect(boundaryScopes.purgeExpiredDeletionMarkers()).resolves.toBe(0);
      await expect(
        boundaryIdentityRetention.purgeExpiredCompletedDeletions(),
      ).resolves.toBe(0);

      const pastBoundary = new Date(exactBoundary.getTime() + 1);
      const expiredScopes = new PostgresUlcLinzScopePersistence(
        source.client,
        () => pastBoundary,
      );
      const expiredIdentityRetention = new PostgresIdentityDeletionRetention(
        source.client,
        () => pastBoundary,
      );
      await expect(expiredScopes.purgeExpiredDeletionMarkers()).resolves.toBe(2);
      await expect(
        expiredIdentityRetention.purgeExpiredCompletedDeletions(),
      ).resolves.toBe(2);

      await restored.client.end();
      await source.client.end();
    });
  });
}

async function seedSourceSnapshot(connection: ReturnType<typeof createPostgresDatabase>) {
  const runtime = await createBootstrapRuntime(connection);
  const actor = await createAppIdentity(
    runtime,
    actorUsername,
    actorPassword,
    "ULC Lifecycle Persistence Admin",
  );
  const manualTarget = await createAppIdentity(
    runtime,
    manualTargetUsername,
    manualTargetPassword,
    "ULC Manual Delete Target",
  );
  const retentionTarget = await createAppIdentity(
    runtime,
    retentionTargetUsername,
    retentionTargetPassword,
    "ULC Retention Target",
  );
  if (
    actor.personId === null ||
    manualTarget.personId === null ||
    retentionTarget.personId === null
  ) {
    throw new Error("Expected linked ULC persons.");
  }

  await connection.client.unsafe(
    `UPDATE appbasis_identity_security_state
     SET must_change_password = false, password_changed_at = $2, updated_at = $2
     WHERE identity_id = $1`,
    [actor.identityId, fixedNow.toISOString()],
  );

  await seedPermissionPrincipal(connection.client, actor.identityId, "ulc-linz:admin");
  await seedPermissionPrincipal(
    connection.client,
    manualTarget.identityId,
    "ulc-linz:trainer",
    true,
  );
  await seedPermissionPrincipal(
    connection.client,
    retentionTarget.identityId,
    "ulc-linz:trainer",
    true,
  );

  await insertMembership(connection.client, {
    identityId: actor.identityId,
    subjectId: actor.personId,
    sourceRole: "admin",
    active: true,
    endedAt: null,
  });
  await insertMembership(connection.client, {
    identityId: manualTarget.identityId,
    subjectId: manualTarget.personId,
    sourceRole: "trainer",
    active: true,
    endedAt: null,
  });
  await insertMembership(connection.client, {
    identityId: retentionTarget.identityId,
    subjectId: retentionTarget.personId,
    sourceRole: "trainer",
    active: false,
    endedAt: "2025-07-18T10:30:00.000Z",
  });

  await connection.client.unsafe(
    `INSERT INTO ulc_linz_subject_scope (
       identity_id, organization_id, subject_id, relation_type
     ) VALUES
       ($1, $3, $2, 'self'),
       ($4, $3, $5, 'self'),
       ($1, $3, $5, 'managed')`,
    [
      manualTarget.identityId,
      manualTarget.personId,
      organizationId,
      retentionTarget.identityId,
      retentionTarget.personId,
    ],
  );

  await connection.client.unsafe(
    `INSERT INTO ulc_linz_membership (
       identity_id, organization_id, subject_id, source_role, active, ended_at,
       retention_exception_reason, retention_exception_actor, retention_review_at
     ) VALUES
       ('fixture-retention-exception', $1, 'fixture-subject-exception', 'parent', false,
        '2025-07-18T10:30:00.000Z', 'legal-hold', 'ulc-linz:admin-fixture', '2026-10-18T10:30:00.000Z'),
       ('fixture-retention-boundary', $1, 'fixture-subject-boundary', 'parent', false,
        '2025-08-18T10:30:00.000Z', NULL, NULL, NULL)`,
    [organizationId],
  );

  return { actor, manualTarget, retentionTarget };
}

async function createBootstrapRuntime(
  connection: ReturnType<typeof createPostgresDatabase>,
) {
  const auth = createBetterAuthRuntime({
    database: connection.database,
    baseURL,
    secret: "ulc-lifecycle-persistence-local-secret-at-least-32-characters",
  });
  await auth.api.createUser({
    body: {
      email: "ulc-lifecycle-persistence-bootstrap@identity.invalid",
      password: bootstrapPassword,
      name: "ULC Persistence Bootstrap",
      role: "admin",
      data: {
        username: bootstrapUsername,
        displayUsername: bootstrapUsername,
      },
    },
  });
  const administrativeSessionToken = await signInCookie(
    auth,
    bootstrapUsername,
    bootstrapPassword,
  );
  return createIdentityRuntime({
    auth,
    sql: connection.client,
    baseURL,
    administrativeSessionToken,
  });
}

async function createRuntime(
  connection: ReturnType<typeof createPostgresDatabase>,
  username: string,
  password: string,
) {
  const auth = createBetterAuthRuntime({
    database: connection.database,
    baseURL,
    secret: "ulc-lifecycle-persistence-local-secret-at-least-32-characters",
  });
  const administrativeSessionToken = await signInCookie(auth, username, password);
  return createIdentityRuntime({
    auth,
    sql: connection.client,
    baseURL,
    administrativeSessionToken,
  });
}

async function createAppIdentity(
  runtime: ReturnType<typeof createIdentityRuntime>,
  username: string,
  temporaryPassword: string,
  displayName: string,
): Promise<AppIdentity> {
  return runtime.service.createInitialUser({
    username,
    temporaryPassword,
    displayName,
    contactEmail: `${username}@example.invalid`,
  });
}

async function seedPermissionPrincipal(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  identityId: string,
  runtimeRoleId: "ulc-linz:admin" | "ulc-linz:trainer",
  withDirectAccess = false,
) {
  await client.unsafe(
    `INSERT INTO appbasis_permission_role (role_id)
     VALUES ($1)
     ON CONFLICT (role_id) DO NOTHING`,
    [runtimeRoleId],
  );
  if (withDirectAccess) {
    await client.unsafe(
      `INSERT INTO appbasis_permission_capability (capability_id)
       VALUES
         ('ulc-linz:module:kindertraining:view'),
         ('ulc-linz:module:kindertraining:edit')
       ON CONFLICT (capability_id) DO NOTHING`,
    );
  }
  await client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)`,
    [identityId],
  );
  await client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2)`,
    [identityId, runtimeRoleId],
  );
  if (withDirectAccess) {
    await client.unsafe(
      `INSERT INTO appbasis_permission_principal_grant (principal_id, capability_id)
       VALUES ($1, 'ulc-linz:module:kindertraining:view')`,
      [identityId],
    );
    await client.unsafe(
      `INSERT INTO appbasis_permission_principal_revoke (principal_id, capability_id)
       VALUES ($1, 'ulc-linz:module:kindertraining:edit')`,
      [identityId],
    );
  }
}

async function insertMembership(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  input: {
    identityId: string;
    subjectId: string;
    sourceRole: "admin" | "trainer" | "athlete" | "parent";
    active: boolean;
    endedAt: string | null;
  },
) {
  await client.unsafe(
    `INSERT INTO ulc_linz_membership (
       identity_id, organization_id, subject_id, source_role, active, ended_at
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.identityId,
      organizationId,
      input.subjectId,
      input.sourceRole,
      input.active,
      input.endedAt,
    ],
  );
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  expect(manifest.owners.map((owner) => owner.id)).toEqual([
    "identity",
    "permissions",
    "ulc-linz-lifecycle",
  ]);
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 7 || new Set(migrations).size !== migrations.length) {
    throw new Error("ULC lifecycle persistence E2E requires the exact 7-migration owner set.");
  }
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../../../${migration}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

async function signInCookie(
  auth: ReturnType<typeof createBetterAuthRuntime>,
  username: string,
  password: string,
) {
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!response.ok) throw new Error("Better Auth administrative sign-in failed.");
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) {
    throw new Error("Better Auth did not return an administrative session cookie.");
  }
  return cookie.split(";", 1)[0] ?? cookie;
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

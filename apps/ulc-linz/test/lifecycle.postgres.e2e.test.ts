import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresIdentityDeletion } from "@appbasis/identity/postgres-deletion";
import { createIdentityRuntime } from "@appbasis/identity/server";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  PostgresPrincipalLifecycleAdministration,
  principalId,
} from "@appbasis/permissions";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

import {
  deleteUlcLinzIdentity,
  type UlcLinzDeletionDependencies,
} from "../worker/lifecycle";

const databaseUrl = process.env.DATABASE_URL;
const baseURL = "http://localhost:3000";
const administrativeUsername = "ulc.lifecycle.admin";
const administrativePassword = "ULC-lifecycle-admin-password-42";
const targetUsername = "ulc.lifecycle.trainer";
const targetPassword = "ULC-lifecycle-target-password-42";
const deletionQuarantineReason =
  "ULC Linz identity deletion pre-delete access quarantine";

type DatabaseManifest = {
  owners: readonly {
    migrations: readonly string[];
  }[];
};

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Linz deletion lifecycle PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Linz deletion lifecycle PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const isolatedDatabaseName =
      "appbasis_ulc_delete_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
    let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
    let isolatedDatabaseCreated = false;

    beforeAll(async () => {
      await administrativeConnection.client.unsafe("CREATE DATABASE " + isolatedDatabaseName);
      isolatedDatabaseCreated = true;
      isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
      await applyManifestMigrations(requiredConnection().client);
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

    it("audits quarantine and physically deletes the current ULC permission and identity owners with safe replay", async () => {
      const connection = requiredConnection();
      const auth = createBetterAuthRuntime({
        database: connection.database,
        baseURL,
        secret: "ulc-lifecycle-local-test-secret-at-least-32-characters",
      });
      await auth.api.createUser({
        body: {
          email: "ulc-lifecycle-admin@identity.invalid",
          password: administrativePassword,
          name: "ULC Lifecycle Admin",
          role: "admin",
          data: {
            username: administrativeUsername,
            displayUsername: administrativeUsername,
          },
        },
      });
      const administrativeSessionToken = await signInCookie(
        auth,
        administrativeUsername,
        administrativePassword,
      );
      const identityRuntime = createIdentityRuntime({
        auth,
        sql: connection.client,
        baseURL,
        administrativeSessionToken,
      });
      const targetIdentity = await identityRuntime.service.createInitialUser({
        username: targetUsername,
        temporaryPassword: targetPassword,
        displayName: "ULC Lifecycle Trainer",
        contactEmail: "ulc.lifecycle.trainer@example.invalid",
      });
      const targetPersonId = targetIdentity.personId;
      if (targetPersonId === null) throw new Error("Expected a linked target person.");
      const targetSession = await identityRuntime.service.signInWithUsername({
        username: targetUsername,
        password: targetPassword,
      });

      await seedTrainerAccess(connection.client, targetIdentity.identityId);
      const permissionStore = new PostgresPermissionStore(connection.client);
      const accessAdministration = new PostgresPrincipalAccessAdministration(connection.client);
      const principalLifecycle = new PostgresPrincipalLifecycleAdministration(
        connection.client,
      );
      const identityDeletion = new PostgresIdentityDeletion(
        connection.client,
        () => new Date("2026-08-17T21:45:00.000Z"),
      );
      const actorPrincipalId = principalId("ulc-lifecycle-admin-principal");
      const dependencies: UlcLinzDeletionDependencies = {
        identity: identityRuntime.service,
        identityDeletion,
        permissions: permissionStore,
        accessAdministration,
        principalLifecycle,
        async authorizeLifecycleWrite({ targetIdentityId }) {
          expect(targetIdentityId).toBe(targetIdentity.identityId);
          return {
            actorPrincipalId,
            targetSourceRole: "trainer",
          };
        },
      };

      await expect(
        permissionStore.findPrincipal(principalId(targetIdentity.identityId)),
      ).resolves.toMatchObject({
        roleIds: ["ulc-linz:trainer"],
        grants: ["ulc-linz:module:kindertraining:view"],
        revokes: ["ulc-linz:module:kindertraining:edit"],
      });
      await expect(
        identityRuntime.service.getCurrentIdentity(targetSession.sessionToken),
      ).resolves.toMatchObject({
        identity: { identityId: targetIdentity.identityId, accountStatus: "active" },
      });

      await expect(
        deleteUlcLinzIdentity(dependencies, targetIdentity.identityId),
      ).resolves.toEqual({
        identityId: targetIdentity.identityId,
        permissionsChanged: true,
        permissionPrincipalDeleted: true,
        identityDeleted: true,
        alreadyDeleted: false,
      });

      await expect(
        permissionStore.findPrincipal(principalId(targetIdentity.identityId)),
      ).resolves.toBeNull();
      await expect(
        identityRuntime.service.getCurrentIdentity(targetSession.sessionToken),
      ).resolves.toBeNull();
      await expect(
        identityRuntime.service.signInWithUsername({
          username: targetUsername,
          password: targetPassword,
        }),
      ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
      await expect(identityDeletion.isDeletionCompleted(targetIdentity.identityId)).resolves.toBe(
        true,
      );

      const remaining = await connection.client.unsafe(
        `SELECT
           (SELECT count(*)::int FROM "user" WHERE id = $1) AS user_count,
           (SELECT count(*)::int FROM appbasis_identity_security_state WHERE identity_id = $1) AS state_count,
           (SELECT count(*)::int FROM appbasis_person WHERE id = $2) AS person_count,
           (SELECT count(*)::int FROM account WHERE user_id = $1) AS account_count,
           (SELECT count(*)::int FROM session WHERE user_id = $1) AS session_count`,
        [targetIdentity.identityId, targetPersonId],
      );
      expect(remaining[0]).toEqual({
        user_count: 0,
        state_count: 0,
        person_count: 0,
        account_count: 0,
        session_count: 0,
      });

      const auditRows = await connection.client.unsafe(
        `SELECT event_type, actor_principal_id, reason, target_type, target_id,
                previous_value, new_value
         FROM appbasis_permission_administration_audit
         WHERE target_id = $1
         ORDER BY created_at ASC, event_id ASC`,
        [targetIdentity.identityId],
      );
      expect(auditRows).toHaveLength(2);
      expect(auditRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: "principal.roles.replace",
            actor_principal_id: String(actorPrincipalId),
            reason: deletionQuarantineReason,
            target_type: "principal",
            target_id: targetIdentity.identityId,
          }),
          expect.objectContaining({
            event_type: "principal.permissions.replace",
            actor_principal_id: String(actorPrincipalId),
            reason: deletionQuarantineReason,
            target_type: "principal",
            target_id: targetIdentity.identityId,
          }),
        ]),
      );
      for (const row of auditRows) {
        expect(JSON.stringify(row)).not.toContain("ulc.lifecycle.trainer@example.invalid");
        expect(JSON.stringify(row)).not.toContain(targetPassword);
      }

      await expect(
        deleteUlcLinzIdentity(dependencies, targetIdentity.identityId),
      ).resolves.toEqual({
        identityId: targetIdentity.identityId,
        permissionsChanged: false,
        permissionPrincipalDeleted: false,
        identityDeleted: true,
        alreadyDeleted: true,
      });
      const auditCountAfterReplay = await connection.client.unsafe(
        `SELECT count(*)::int AS count
         FROM appbasis_permission_administration_audit
         WHERE target_id = $1`,
        [targetIdentity.identityId],
      );
      expect(auditCountAfterReplay[0]?.count).toBe(2);
    });

    function requiredConnection() {
      if (isolatedConnection === null) {
        throw new Error("The isolated ULC lifecycle PostgreSQL database is not ready.");
      }
      return isolatedConnection;
    }
  });
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 10 || new Set(migrations).size !== migrations.length) {
    throw new Error("ULC lifecycle E2E requires the exact manifest-owned migration set.");
  }
  for (const migration of migrations) {
    if (
      !migration.startsWith("packages/identity/") &&
      !migration.startsWith("packages/permissions/") &&
      migration !== "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql" &&
      migration !== "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql" &&
      migration !== "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql" &&
      migration !== "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql"
    ) {
      throw new Error("ULC lifecycle E2E encountered an unexpected migration owner.");
    }
    const sql = await readFile(new URL(`../../../${migration}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

async function seedTrainerAccess(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  identityId: string,
) {
  await client.unsafe(
    `INSERT INTO appbasis_permission_capability (capability_id)
     VALUES
       ('ulc-linz:module:kindertraining:view'),
       ('ulc-linz:module:kindertraining:edit')`,
  );
  await client.unsafe(
    `INSERT INTO appbasis_permission_role (role_id)
     VALUES ('ulc-linz:trainer')`,
  );
  await client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)`,
    [identityId],
  );
  await client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, 'ulc-linz:trainer')`,
    [identityId],
  );
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
  url.pathname = "/" + databaseName;
  return url.toString();
}

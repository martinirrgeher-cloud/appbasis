import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresPermissionStore,
  PostgresRoleAdministration,
  can,
  capabilityId,
  principalId,
  roleId,
  type RoleAdministrationAuditContext,
  type RoleAdministrationPostgresClient,
} from "../src";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for principal role safety PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_role_safety_" + randomUUID().replaceAll("-", "").slice(0, 20);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL("../migrations/0000_appbasis_permissions_foundation.sql", import.meta.url),
  new URL("../migrations/0001_appbasis_permission_role_lifecycle.sql", import.meta.url),
  new URL("../migrations/0002_appbasis_permission_administration_audit.sql", import.meta.url),
];

const usersManage = capabilityId("users:manage");
const roleAdmin = roleId("managed:role-admin");
const memberRole = roleId("managed:member");
const firstAdmin = principalId("principal-first-admin");
const secondAdmin = principalId("principal-second-admin");
const auditActor = principalId("principal-audit-actor");

beforeAll(async () => {
  await administrativeConnection.client.unsafe(
    "CREATE DATABASE " + isolatedDatabaseName,
  );
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  const connection = requiredIsolatedConnection();
  for (const migrationUrl of migrationUrls) {
    const migration = await readFile(migrationUrl, "utf8");
    await connection.client.unsafe(migration);
  }

  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_capability (capability_id)
     VALUES ($1)`,
    [usersManage],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role (
       role_id, display_name, state, kind
     )
     VALUES
       ($1, 'Role Admin', 'active', 'managed'),
       ($2, 'Member', 'active', 'managed')`,
    [roleAdmin, memberRole],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2)`,
    [roleAdmin, usersManage],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1), ($2)`,
    [firstAdmin, secondAdmin],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2), ($3, $4)`,
    [firstAdmin, roleAdmin, secondAdmin, memberRole],
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

describe("PostgresRoleAdministration principal role safety", () => {
  it("rejects stale complete replacements and preserves the final effective capability holder", async () => {
    const administration = roleAdministration();
    const permissions = new PostgresPermissionStore(requiredIsolatedConnection().client);

    await expect(
      administration.replacePrincipalRoles(
        secondAdmin,
        [roleAdmin],
        audit("Zweiten Administrator freischalten"),
        {
          expectedRoleIds: [memberRole],
          requiredRemainingCapability: usersManage,
        },
      ),
    ).resolves.toEqual([roleAdmin]);

    await expect(
      administration.replacePrincipalRoles(
        secondAdmin,
        [],
        audit("Veraltete Zuweisung ablehnen"),
        {
          expectedRoleIds: [memberRole],
          requiredRemainingCapability: usersManage,
        },
      ),
    ).rejects.toMatchObject({ code: "STALE_PRINCIPAL_ROLES" });
    await expect(permissions.findPrincipal(secondAdmin)).resolves.toMatchObject({
      roleIds: [roleAdmin],
    });

    await expect(
      administration.replacePrincipalRoles(
        firstAdmin,
        [memberRole],
        audit("Ersten Administrator zurückstufen"),
        {
          expectedRoleIds: [roleAdmin],
          requiredRemainingCapability: usersManage,
        },
      ),
    ).resolves.toEqual([memberRole]);
    await expect(
      can(permissions, { principalId: secondAdmin, capability: usersManage }),
    ).resolves.toBe(true);

    await expect(
      administration.replacePrincipalRoles(
        secondAdmin,
        [memberRole],
        audit("Letzten Administrator nicht entfernen"),
        {
          expectedRoleIds: [roleAdmin],
          requiredRemainingCapability: usersManage,
        },
      ),
    ).rejects.toMatchObject({ code: "LAST_CAPABILITY_HOLDER" });
    await expect(permissions.findPrincipal(secondAdmin)).resolves.toMatchObject({
      roleIds: [roleAdmin],
    });
    await expect(
      can(permissions, { principalId: secondAdmin, capability: usersManage }),
    ).resolves.toBe(true);
  });
});

function roleAdministration(): PostgresRoleAdministration {
  const connection = requiredIsolatedConnection();
  const client: RoleAdministrationPostgresClient = {
    unsafe(query, parameters) {
      return connection.client.unsafe(query, parameters);
    },
    async begin(callback) {
      return connection.client.begin(async (transaction) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  };
  return new PostgresRoleAdministration(client);
}

function audit(reason: string): RoleAdministrationAuditContext {
  return { actorPrincipalId: auditActor, reason };
}

function requiredIsolatedConnection(): ReturnType<typeof createPostgresDatabase> {
  if (isolatedConnection === null) {
    throw new Error("Isolated role safety database is not initialized.");
  }
  return isolatedConnection;
}

function databaseUrlForName(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresPermissionStore,
  can,
  capabilityId,
  principalId,
  roleId,
  type PermissionPostgresClient,
  type RoleAdministrationPostgresClient,
} from "../src";
import { PostgresPrincipalAccessAdministration } from "../src/principal-access-administration";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    "DATABASE_URL is required for principal access PostgreSQL E2E tests.",
  );
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_principal_access_" + randomUUID().replaceAll("-", "").slice(0, 18);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL(
    "../migrations/0000_appbasis_permissions_foundation.sql",
    import.meta.url,
  ),
  new URL(
    "../migrations/0001_appbasis_permission_role_lifecycle.sql",
    import.meta.url,
  ),
  new URL(
    "../migrations/0002_appbasis_permission_administration_audit.sql",
    import.meta.url,
  ),
  new URL(
    "../migrations/0003_appbasis_principal_permission_administration_audit.sql",
    import.meta.url,
  ),
];

const reportsRead = capabilityId("reports:read");
const reportsWrite = capabilityId("reports:write");
const unknownCapability = capabilityId("reports:unknown");
const readerRole = roleId("managed:reader");
const writerRole = roleId("managed:writer");
const targetPrincipal = principalId("principal-target");
const auditActor = principalId("principal-administrator");

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
     VALUES ($1), ($2)`,
    [reportsRead, reportsWrite],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role (
       role_id, display_name, state, kind
     ) VALUES
       ($1, 'Reader', 'active', 'managed'),
       ($2, 'Writer', 'active', 'managed')`,
    [readerRole, writerRole],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2), ($3, $4)`,
    [readerRole, reportsRead, writerRole, reportsWrite],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)`,
    [targetPrincipal],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2)`,
    [targetPrincipal, readerRole],
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

describe("PostgresPrincipalAccessAdministration", () => {
  it("replaces roles and direct overrides in one audited transaction", async () => {
    const administration = principalAccessAdministration();
    const permissionStore = new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    );

    await expect(
      administration.replacePrincipalAccess(
        targetPrincipal,
        [writerRole],
        { grants: [reportsRead], revokes: [] },
        { actorPrincipalId: auditActor, reason: "ULC Zugriff ersetzen" },
        {
          expectedRoleIds: [readerRole],
          expectedGrants: [],
          expectedRevokes: [],
        },
      ),
    ).resolves.toEqual({
      roleIds: [writerRole],
      grants: [reportsRead],
      revokes: [],
    });

    await expect(
      can(permissionStore, {
        principalId: targetPrincipal,
        capability: reportsRead,
      }),
    ).resolves.toBe(true);
    await expect(
      can(permissionStore, {
        principalId: targetPrincipal,
        capability: reportsWrite,
      }),
    ).resolves.toBe(true);

    const principal = await permissionStore.findPrincipal(targetPrincipal);
    expect(principal).toMatchObject({
      roleIds: [writerRole],
      grants: [reportsRead],
      revokes: [],
    });

    const auditRows = await targetAuditRows();
    expect(auditRows).toHaveLength(2);
    expect(auditRows.map((row) => row.event_type)).toEqual([
      "principal.roles.replace",
      "principal.permissions.replace",
    ]);
  });

  it("rolls back a demotion when it would remove the last required role holder", async () => {
    const administration = principalAccessAdministration();
    const beforeAuditRows = await targetAuditRows();

    await expect(
      administration.replacePrincipalAccess(
        targetPrincipal,
        [readerRole],
        { grants: [reportsRead], revokes: [] },
        { actorPrincipalId: auditActor, reason: "Letzte Writer-Rolle schützen" },
        {
          expectedRoleIds: [writerRole],
          expectedGrants: [reportsRead],
          expectedRevokes: [],
          requiredRemainingRoleIds: [writerRole],
        },
      ),
    ).rejects.toMatchObject({ code: "LAST_REQUIRED_ROLE_HOLDER" });

    const principal = await new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    ).findPrincipal(targetPrincipal);
    expect(principal).toMatchObject({
      roleIds: [writerRole],
      grants: [reportsRead],
      revokes: [],
    });
    expect(await targetAuditRows()).toEqual(beforeAuditRows);
  });

  it("rolls back the role change and both audit events when override replacement fails", async () => {
    const administration = principalAccessAdministration();
    const beforeAuditRows = await targetAuditRows();

    await expect(
      administration.replacePrincipalAccess(
        targetPrincipal,
        [readerRole],
        { grants: [unknownCapability], revokes: [] },
        { actorPrincipalId: auditActor, reason: "Ungültigen Zugriff ablehnen" },
        {
          expectedRoleIds: [writerRole],
          expectedGrants: [reportsRead],
          expectedRevokes: [],
        },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_CAPABILITY" });

    const principal = await new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    ).findPrincipal(targetPrincipal);
    expect(principal).toMatchObject({
      roleIds: [writerRole],
      grants: [reportsRead],
      revokes: [],
    });
    expect(await targetAuditRows()).toEqual(beforeAuditRows);
  });
});

function principalAccessAdministration() {
  return new PostgresPrincipalAccessAdministration(roleAdministrationClient());
}

function roleAdministrationClient(): RoleAdministrationPostgresClient {
  const client = requiredIsolatedConnection().client;
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback(permissionClient(transaction)),
      );
    },
  };
}

function permissionClient(client: {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}): PermissionPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  };
}

async function targetAuditRows() {
  return requiredIsolatedConnection().client.unsafe(
    `SELECT event_type, actor_principal_id, reason, target_type, target_id,
            previous_value, new_value
     FROM appbasis_permission_administration_audit
     WHERE target_id = $1
     ORDER BY event_id ASC`,
    [targetPrincipal],
  );
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated principal access database is not ready.");
  }
  return isolatedConnection;
}

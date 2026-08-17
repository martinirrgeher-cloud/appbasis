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
import {
  PostgresPrincipalPermissionAdministration,
  PrincipalPermissionAdministrationError,
} from "../src/principal-permission-administration";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for principal permission PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_principal_perm_" + randomUUID().replaceAll("-", "").slice(0, 18);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL("../migrations/0000_appbasis_permissions_foundation.sql", import.meta.url),
  new URL("../migrations/0001_appbasis_permission_role_lifecycle.sql", import.meta.url),
  new URL("../migrations/0002_appbasis_permission_administration_audit.sql", import.meta.url),
  new URL("../migrations/0003_appbasis_principal_permission_administration_audit.sql", import.meta.url),
];

const reportsRead = capabilityId("reports:read");
const reportsWrite = capabilityId("reports:write");
const roleRead = roleId("managed:reader");
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
     ) VALUES ($1, 'Reader', 'active', 'managed')`,
    [roleRead],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2)`,
    [roleRead, reportsRead],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)`,
    [targetPrincipal],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2)`,
    [targetPrincipal, roleRead],
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

describe("PostgresPrincipalPermissionAdministration", () => {
  it("replaces direct grants and revokes atomically and audits the exact before/after state", async () => {
    const administration = principalPermissionAdministration();
    const permissionStore = new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    );

    await expect(
      administration.replacePrincipalPermissions(
        targetPrincipal,
        { grants: [reportsWrite], revokes: [reportsRead] },
        { actorPrincipalId: auditActor, reason: "ULC Modulrechte ersetzen" },
        { expectedGrants: [], expectedRevokes: [] },
      ),
    ).resolves.toEqual({
      grants: [reportsWrite],
      revokes: [reportsRead],
    });

    await expect(
      can(permissionStore, { principalId: targetPrincipal, capability: reportsRead }),
    ).resolves.toBe(false);
    await expect(
      can(permissionStore, { principalId: targetPrincipal, capability: reportsWrite }),
    ).resolves.toBe(true);

    const auditRows = await requiredIsolatedConnection().client.unsafe(
      `SELECT event_type, actor_principal_id, reason, target_type, target_id,
              previous_value, new_value
       FROM appbasis_permission_administration_audit
       WHERE target_id = $1
       ORDER BY event_id ASC`,
      [targetPrincipal],
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      event_type: "principal.permissions.replace",
      actor_principal_id: auditActor,
      reason: "ULC Modulrechte ersetzen",
      target_type: "principal",
      target_id: targetPrincipal,
      previous_value: { grants: [], revokes: [] },
      new_value: { grants: [reportsWrite], revokes: [reportsRead] },
    });
  });

  it("fails closed on stale state, unknown capabilities and overlapping overrides", async () => {
    const administration = principalPermissionAdministration();

    await expect(
      administration.replacePrincipalPermissions(
        targetPrincipal,
        { grants: [reportsRead], revokes: [] },
        { actorPrincipalId: auditActor, reason: "Stale Update" },
        { expectedGrants: [], expectedRevokes: [] },
      ),
    ).rejects.toMatchObject({ code: "STALE_PRINCIPAL_PERMISSIONS" });

    await expect(
      administration.replacePrincipalPermissions(
        targetPrincipal,
        { grants: [capabilityId("unknown:capability")], revokes: [] },
        { actorPrincipalId: auditActor, reason: "Unknown Capability" },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_CAPABILITY" });

    await expect(
      administration.replacePrincipalPermissions(
        targetPrincipal,
        { grants: [reportsRead], revokes: [reportsRead] },
        { actorPrincipalId: auditActor, reason: "Overlap" },
      ),
    ).rejects.toBeInstanceOf(PrincipalPermissionAdministrationError);

    const principal = await new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    ).findPrincipal(targetPrincipal);
    expect(principal).toMatchObject({
      grants: [reportsWrite],
      revokes: [reportsRead],
    });
  });

  it("protects the last holder of explicitly required capabilities", async () => {
    const administration = principalPermissionAdministration();

    await expect(
      administration.replacePrincipalPermissions(
        targetPrincipal,
        { grants: [], revokes: [reportsRead, reportsWrite] },
        { actorPrincipalId: auditActor, reason: "Required capability entziehen" },
        { requiredRemainingCapabilities: [reportsWrite] },
      ),
    ).rejects.toMatchObject({ code: "LAST_CAPABILITY_HOLDER" });

    const principal = await new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    ).findPrincipal(targetPrincipal);
    expect(principal).toMatchObject({
      grants: [reportsWrite],
      revokes: [reportsRead],
    });
  });
});

function principalPermissionAdministration() {
  return new PostgresPrincipalPermissionAdministration(roleAdministrationClient());
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

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated principal permission database is not ready.");
  }
  return isolatedConnection;
}

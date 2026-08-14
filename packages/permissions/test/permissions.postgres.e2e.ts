import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";

import {
  PostgresPermissionStore,
  can,
  capabilityId,
  principalId,
  roleId,
} from "../src";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for permissions PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_permissions_" + randomUUID().replaceAll("-", "").slice(0, 24);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL("../migrations/0000_appbasis_permissions_foundation.sql", import.meta.url),
  new URL("../migrations/0001_appbasis_permission_role_lifecycle.sql", import.meta.url),
];

const reportsRead = capabilityId("reports:read");
const reportsWrite = capabilityId("reports:write");
const viewer = roleId("reports:viewer");
const rolePrincipal = principalId("principal-role");
const grantPrincipal = principalId("principal-grant");
const revokedPrincipal = principalId("principal-revoked");

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
    `INSERT INTO appbasis_permission_role (role_id)
     VALUES ($1)`,
    [viewer],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2)`,
    [viewer, reportsRead],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1), ($2), ($3)`,
    [rolePrincipal, grantPrincipal, revokedPrincipal],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2), ($3, $2)`,
    [rolePrincipal, viewer, revokedPrincipal],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_grant (principal_id, capability_id)
     VALUES ($1, $2)`,
    [grantPrincipal, reportsWrite],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_revoke (principal_id, capability_id)
     VALUES ($1, $2)`,
    [revokedPrincipal, reportsRead],
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

describe("PostgresPermissionStore", () => {
  it("loads known capabilities, active role bundles and principal assignments", async () => {
    const store = permissionStore();

    await expect(store.isKnownCapability(reportsRead)).resolves.toBe(true);
    await expect(
      store.isKnownCapability(capabilityId("reports:unknown")),
    ).resolves.toBe(false);
    await expect(store.findRole(viewer)).resolves.toEqual({
      roleId: viewer,
      capabilities: [reportsRead],
    });
    await expect(store.findPrincipal(rolePrincipal)).resolves.toEqual({
      principalId: rolePrincipal,
      roleIds: [viewer],
      grants: [],
      revokes: [],
    });
  });

  it("preserves deny-by-default, direct grants and revoke precedence", async () => {
    const store = permissionStore();

    await expect(
      can(store, { principalId: rolePrincipal, capability: reportsRead }),
    ).resolves.toBe(true);
    await expect(
      can(store, { principalId: rolePrincipal, capability: reportsWrite }),
    ).resolves.toBe(false);
    await expect(
      can(store, { principalId: grantPrincipal, capability: reportsWrite }),
    ).resolves.toBe(true);
    await expect(
      can(store, { principalId: revokedPrincipal, capability: reportsRead }),
    ).resolves.toBe(false);
    await expect(
      can(store, {
        principalId: principalId("principal-missing"),
        capability: reportsRead,
      }),
    ).resolves.toBe(false);
  });

  it("keeps inactive role assignments but removes their effective permissions", async () => {
    const connection = requiredIsolatedConnection();
    const store = permissionStore();

    await connection.client.unsafe(
      `UPDATE appbasis_permission_role
       SET state = 'inactive'
       WHERE role_id = $1`,
      [viewer],
    );

    await expect(store.findRole(viewer)).resolves.toBeNull();
    await expect(store.findPrincipal(rolePrincipal)).resolves.toMatchObject({
      roleIds: [viewer],
    });
    await expect(
      can(store, { principalId: rolePrincipal, capability: reportsRead }),
    ).resolves.toBe(false);

    await connection.client.unsafe(
      `UPDATE appbasis_permission_role
       SET state = 'active'
       WHERE role_id = $1`,
      [viewer],
    );
    await expect(
      can(store, { principalId: rolePrincipal, capability: reportsRead }),
    ).resolves.toBe(true);
  });
});

function permissionStore() {
  return new PostgresPermissionStore(requiredIsolatedConnection().client);
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated permissions PostgreSQL database is not ready.");
  }
  return isolatedConnection;
}

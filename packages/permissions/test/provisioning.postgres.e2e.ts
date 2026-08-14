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
} from "../src";
import {
  PermissionProvisioningStateError,
  provisionPostgresPermissions,
  type PermissionProvisioningBundle,
  type PermissionProvisioningPostgresClient,
} from "../src/provisioning";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for permissions provisioning PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_permission_provisioning_" +
  randomUUID().replaceAll("-", "").slice(0, 16);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL("../migrations/0000_appbasis_permissions_foundation.sql", import.meta.url),
  new URL("../migrations/0001_appbasis_permission_role_lifecycle.sql", import.meta.url),
];

const reportsRead = capabilityId("reports:read");
const reportsWrite = capabilityId("reports:write");
const reportsDelete = capabilityId("reports:delete");
const viewer = roleId("reports:viewer");
const editor = roleId("reports:editor");
const auditor = roleId("reports:auditor");
const viewerPrincipal = principalId("principal-viewer");
const editorPrincipal = principalId("principal-editor");
const rejectedPrincipal = principalId("principal-rejected");

const initialBundle: PermissionProvisioningBundle = {
  knownCapabilities: [reportsWrite, reportsRead],
  roles: [
    {
      roleId: editor,
      capabilities: [reportsWrite, reportsRead],
    },
    {
      roleId: viewer,
      capabilities: [reportsRead],
    },
  ],
  principalRoleAssignments: [
    {
      principalId: viewerPrincipal,
      roleIds: [viewer],
    },
    {
      principalId: editorPrincipal,
      roleIds: [editor],
    },
  ],
};

beforeAll(async () => {
  await administrativeConnection.client.unsafe(
    "CREATE DATABASE " + isolatedDatabaseName,
  );
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  for (const migrationUrl of migrationUrls) {
    const migration = await readFile(migrationUrl, "utf8");
    await requiredIsolatedConnection().client.unsafe(migration);
  }
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

describe("PostgreSQL permission provisioning", () => {
  it("creates the declared permission bootstrap state and preserves deny-by-default runtime decisions", async () => {
    await expect(
      provisionPostgresPermissions(provisioningClient(), initialBundle),
    ).resolves.toEqual({
      capabilitiesCreated: 2,
      rolesCreated: 2,
      roleCapabilitiesCreated: 3,
      principalsCreated: 2,
      principalRolesCreated: 2,
    });

    const store = permissionStore();
    await expect(
      can(store, { principalId: viewerPrincipal, capability: reportsRead }),
    ).resolves.toBe(true);
    await expect(
      can(store, { principalId: viewerPrincipal, capability: reportsWrite }),
    ).resolves.toBe(false);
    await expect(
      can(store, { principalId: editorPrincipal, capability: reportsWrite }),
    ).resolves.toBe(true);
    await expect(
      can(store, {
        principalId: principalId("principal-missing"),
        capability: reportsRead,
      }),
    ).resolves.toBe(false);
    await expect(
      can(store, { principalId: editorPrincipal, capability: reportsDelete }),
    ).resolves.toBe(false);
  });

  it("is idempotent when the exact provisioning bundle is replayed", async () => {
    await expect(
      provisionPostgresPermissions(provisioningClient(), initialBundle),
    ).resolves.toEqual({
      capabilitiesCreated: 0,
      rolesCreated: 0,
      roleCapabilitiesCreated: 0,
      principalsCreated: 0,
      principalRolesCreated: 0,
    });
  });

  it("replays identical role bundles independently of PostgreSQL collation ordering", async () => {
    const dashCapability = capabilityId("a-b");
    const underscoreCapability = capabilityId("a_b");
    const collationRole = roleId("collation:role");
    const collationBundle: PermissionProvisioningBundle = {
      knownCapabilities: [dashCapability, underscoreCapability],
      roles: [
        {
          roleId: collationRole,
          capabilities: [dashCapability, underscoreCapability],
        },
      ],
      principalRoleAssignments: [],
    };

    await expect(
      provisionPostgresPermissions(provisioningClient(), collationBundle),
    ).resolves.toEqual({
      capabilitiesCreated: 2,
      rolesCreated: 1,
      roleCapabilitiesCreated: 2,
      principalsCreated: 0,
      principalRolesCreated: 0,
    });

    await expect(
      provisionPostgresPermissions(provisioningClient(), collationBundle),
    ).resolves.toEqual({
      capabilitiesCreated: 0,
      rolesCreated: 0,
      roleCapabilitiesCreated: 0,
      principalsCreated: 0,
      principalRolesCreated: 0,
    });
  });

  it("preserves additional principal roles outside the initial bootstrap assignment", async () => {
    const connection = requiredIsolatedConnection();
    await connection.client.unsafe(
      `INSERT INTO appbasis_permission_role (role_id) VALUES ($1)`,
      [auditor],
    );
    await connection.client.unsafe(
      `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
       VALUES ($1, $2)`,
      [auditor, reportsRead],
    );
    await connection.client.unsafe(
      `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
       VALUES ($1, $2)`,
      [viewerPrincipal, auditor],
    );

    await expect(
      provisionPostgresPermissions(provisioningClient(), initialBundle),
    ).resolves.toEqual({
      capabilitiesCreated: 0,
      rolesCreated: 0,
      roleCapabilitiesCreated: 0,
      principalsCreated: 0,
      principalRolesCreated: 0,
    });

    await expect(permissionStore().findPrincipal(viewerPrincipal)).resolves.toEqual({
      principalId: viewerPrincipal,
      roleIds: [auditor, viewer],
      grants: [],
      revokes: [],
    });
  });

  it("rolls back the complete bundle when existing role state conflicts", async () => {
    const connection = requiredIsolatedConnection();
    await connection.client.unsafe(
      `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
       VALUES ($1, $2)`,
      [viewer, reportsWrite],
    );

    await expect(
      provisionPostgresPermissions(provisioningClient(), {
        knownCapabilities: [reportsRead, reportsWrite, reportsDelete],
        roles: [
          {
            roleId: viewer,
            capabilities: [reportsRead],
          },
          {
            roleId: editor,
            capabilities: [reportsRead, reportsWrite],
          },
        ],
        principalRoleAssignments: [
          {
            principalId: viewerPrincipal,
            roleIds: [viewer],
          },
          {
            principalId: editorPrincipal,
            roleIds: [editor],
          },
          {
            principalId: rejectedPrincipal,
            roleIds: [viewer],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PermissionProvisioningStateError);

    const store = permissionStore();
    await expect(store.isKnownCapability(reportsDelete)).resolves.toBe(false);
    await expect(store.findPrincipal(rejectedPrincipal)).resolves.toBeNull();
  });
});

function permissionStore() {
  return new PostgresPermissionStore(requiredIsolatedConnection().client);
}

function provisioningClient(): PermissionProvisioningPostgresClient {
  const client = requiredIsolatedConnection().client;
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

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated permission provisioning PostgreSQL database is not ready.");
  }
  return isolatedConnection;
}

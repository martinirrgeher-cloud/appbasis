import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresPermissionStore,
  PostgresRoleAdministration,
  RoleAdministrationError,
  can,
  capabilityId,
  principalId,
  roleId,
  type PermissionPostgresClient,
  type RoleAdministrationAuditContext,
  type RoleAdministrationPostgresClient,
} from "../src";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for role administration PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_role_admin_" + randomUUID().replaceAll("-", "").slice(0, 20);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL("../migrations/0000_appbasis_permissions_foundation.sql", import.meta.url),
  new URL("../migrations/0001_appbasis_permission_role_lifecycle.sql", import.meta.url),
  new URL("../migrations/0002_appbasis_permission_administration_audit.sql", import.meta.url),
];

const reportsRead = capabilityId("reports:read");
const reportsWrite = capabilityId("reports:write");
const systemAdmin = roleId("system:admin");
const managedEditor = roleId("managed:editor");
const editorPrincipal = principalId("principal-editor");
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
    `INSERT INTO appbasis_permission_role (role_id)
     VALUES ($1)`,
    [systemAdmin],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2)`,
    [systemAdmin, reportsRead],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)`,
    [editorPrincipal],
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

describe("PostgresRoleAdministration", () => {
  it("supports managed role lifecycle without introducing a second permission model", async () => {
    const administration = roleAdministration();
    const permissionStore = new PostgresPermissionStore(
      requiredIsolatedConnection().client,
    );

    await expect(administration.listKnownCapabilities()).resolves.toEqual([
      reportsRead,
      reportsWrite,
    ]);

    await expect(
      administration.createRole(
        {
          roleId: managedEditor,
          displayName: "Editor",
          description: "Darf Berichte bearbeiten.",
          capabilities: [reportsRead],
        },
        audit("Managed role anlegen"),
      ),
    ).resolves.toEqual({
      roleId: managedEditor,
      displayName: "Editor",
      description: "Darf Berichte bearbeiten.",
      state: "active",
      kind: "managed",
      assignedPrincipalCount: 0,
      capabilities: [reportsRead],
    });

    await expect(
      administration.replacePrincipalRoles(
        editorPrincipal,
        [managedEditor],
        audit("Rolle zuweisen"),
      ),
    ).resolves.toEqual([managedEditor]);
    await expect(
      can(permissionStore, {
        principalId: editorPrincipal,
        capability: reportsRead,
      }),
    ).resolves.toBe(true);

    await expect(
      administration.setRoleState(
        managedEditor,
        "inactive",
        audit("Rolle deaktivieren"),
      ),
    ).resolves.toMatchObject({
      state: "inactive",
      assignedPrincipalCount: 1,
    });
    await expect(
      permissionStore.findPrincipal(editorPrincipal),
    ).resolves.toMatchObject({ roleIds: [managedEditor] });
    await expect(
      can(permissionStore, {
        principalId: editorPrincipal,
        capability: reportsRead,
      }),
    ).resolves.toBe(false);

    await expect(
      administration.setRoleState(
        managedEditor,
        "active",
        audit("Rolle reaktivieren"),
      ),
    ).resolves.toMatchObject({ state: "active" });
    await expect(
      administration.updateRole(
        managedEditor,
        {
          displayName: "Bericht Editor",
          description: "Bearbeitet Berichte.",
          capabilities: [reportsWrite],
        },
        audit("Rolle aktualisieren"),
      ),
    ).resolves.toMatchObject({
      displayName: "Bericht Editor",
      description: "Bearbeitet Berichte.",
      capabilities: [reportsWrite],
    });
    await expect(
      can(permissionStore, {
        principalId: editorPrincipal,
        capability: reportsRead,
      }),
    ).resolves.toBe(false);
    await expect(
      can(permissionStore, {
        principalId: editorPrincipal,
        capability: reportsWrite,
      }),
    ).resolves.toBe(true);

    await expect(
      administration.deleteRole(managedEditor, audit("Aktive Rolle löschen")),
    ).rejects.toMatchObject({ code: "ROLE_ACTIVE" });
    await administration.setRoleState(
      managedEditor,
      "inactive",
      audit("Rolle final deaktivieren"),
    );
    await expect(
      administration.deleteRole(managedEditor, audit("Zugewiesene Rolle löschen")),
    ).rejects.toMatchObject({ code: "ROLE_IN_USE" });

    await administration.replacePrincipalRoles(
      editorPrincipal,
      [],
      audit("Rollenzuweisung entfernen"),
    );
    await expect(
      administration.deleteRole(managedEditor, audit("Managed Rolle löschen")),
    ).resolves.toBeUndefined();
    await expect(administration.findRole(managedEditor)).resolves.toBeNull();

    const auditRows = await requiredIsolatedConnection().client.unsafe(
      `SELECT
         event_type,
         actor_principal_id,
         reason,
         target_type,
         target_id,
         previous_value,
         new_value
       FROM appbasis_permission_administration_audit
       ORDER BY event_id ASC`,
    );
    expect(auditRows).toHaveLength(8);
    expect(auditRows.map((row) => row.event_type)).toEqual([
      "role.create",
      "principal.roles.replace",
      "role.state",
      "role.state",
      "role.update",
      "role.state",
      "principal.roles.replace",
      "role.delete",
    ]);
    expect(auditRows.every((row) => row.actor_principal_id === auditActor)).toBe(true);
    expect(auditRows.every((row) => typeof row.reason === "string" && row.reason.length > 0)).toBe(true);
    expect(auditRows[0]).toMatchObject({
      target_type: "role",
      target_id: managedEditor,
      previous_value: null,
    });
    expect(auditRows[0]?.new_value).toMatchObject({
      roleId: managedEditor,
      state: "active",
      kind: "managed",
    });
    expect(auditRows.at(-1)).toMatchObject({
      target_type: "role",
      target_id: managedEditor,
      new_value: null,
    });
  });

  it("protects system roles from managed lifecycle mutations", async () => {
    const administration = roleAdministration();

    await expect(
      administration.setRoleState(
        systemAdmin,
        "inactive",
        audit("Systemrolle deaktivieren"),
      ),
    ).rejects.toBeInstanceOf(RoleAdministrationError);
    await expect(
      administration.setRoleState(
        systemAdmin,
        "inactive",
        audit("Systemrolle deaktivieren"),
      ),
    ).rejects.toMatchObject({ code: "ROLE_PROTECTED" });
  });

  it("requires explicit audit actor and reason before any mutation", async () => {
    const administration = roleAdministration();
    await expect(
      administration.createRole(
        {
          roleId: roleId("managed:invalid-audit"),
          displayName: "Invalid Audit",
          capabilities: [reportsRead],
        },
        { actorPrincipalId: auditActor, reason: "" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_AUDIT_CONTEXT" });
    await expect(administration.findRole(roleId("managed:invalid-audit"))).resolves.toBeNull();
  });
});

function audit(reason: string): RoleAdministrationAuditContext {
  return { actorPrincipalId: auditActor, reason };
}

function roleAdministration() {
  return new PostgresRoleAdministration(roleAdministrationClient());
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
    throw new Error("The isolated role administration PostgreSQL database is not ready.");
  }
  return isolatedConnection;
}

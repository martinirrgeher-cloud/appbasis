import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  capabilityId,
  principalId,
  roleId,
  type PermissionPostgresClient,
  type RoleAdministrationPostgresClient,
} from "../src";
import { PostgresPrincipalPermissionAdministration } from "../src/principal-permission-administration";

// N01.8a: proves the principal-row lock prerequisite for a future ULC actor
// guard. This is NOT an end-to-end trainer/admin registration authorization test.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  throw new Error("DATABASE_URL is required for isolated PostgreSQL lock E2E.");
}

const base = createPostgresDatabase(databaseUrl);
const databaseName = "appbasis_n01_locks_" + randomUUID().replaceAll("-", "").slice(0, 14);
const url = new URL(databaseUrl);
url.pathname = "/" + databaseName;

let connectionA: ReturnType<typeof createPostgresDatabase> | null = null;
let connectionB: ReturnType<typeof createPostgresDatabase> | null = null;
let databaseCreated = false;

const capability = capabilityId("kindertraining:edit");
const trainerRole = roleId("n01:trainer");
const firstPrincipal = principalId("n01:registration-first");
const secondPrincipal = principalId("n01:revoke-first");
const auditor = principalId("n01:administrator");

const migrations = [
  "0000_appbasis_permissions_foundation.sql",
  "0001_appbasis_permission_role_lifecycle.sql",
  "0002_appbasis_permission_administration_audit.sql",
  "0003_appbasis_principal_permission_administration_audit.sql",
];

function requiredA() {
  if (connectionA === null) throw new Error("Isolated database A not initialized.");
  return connectionA.client;
}

function requiredB() {
  if (connectionB === null) throw new Error("Isolated database B not initialized.");
  return connectionB.client;
}

async function seedPrincipal(id: string) {
  await requiredA().unsafe(
    "INSERT INTO appbasis_permission_principal (principal_id) VALUES ($1)",
    [id],
  );
  await requiredA().unsafe(
    "INSERT INTO appbasis_permission_principal_role (principal_id, role_id) VALUES ($1, $2)",
    [id, trainerRole],
  );
}

async function effectiveRolePermission(
  client: PermissionPostgresClient,
  id: string,
): Promise<boolean> {
  const rows = await client.unsafe(
    "SELECT (" +
      "EXISTS (SELECT 1 FROM appbasis_permission_principal_role pr " +
      "JOIN appbasis_permission_role r ON r.role_id = pr.role_id " +
      "JOIN appbasis_permission_role_capability rc ON rc.role_id = r.role_id " +
      "WHERE pr.principal_id = $1 AND r.state = 'active' AND rc.capability_id = $2) " +
      "AND NOT EXISTS (SELECT 1 FROM appbasis_permission_principal_revoke " +
      "WHERE principal_id = $1 AND capability_id = $2)" +
    ") AS allowed",
    [id, capability],
  );
  return rows[0]?.allowed === true;
}

function administration() {
  const client = requiredB();
  const wrapper: RoleAdministrationPostgresClient = {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) => {
        // This timeout must apply to the same transaction that executes the
        // canonical FOR UPDATE in replacePrincipalPermissions.
        await transaction.unsafe("SET LOCAL lock_timeout = '750ms'");
        return callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        });
      });
    },
  };
  return new PostgresPrincipalPermissionAdministration(wrapper);
}

async function revokeFor(id: string) {
  return administration().replacePrincipalPermissions(
    principalId(id),
    { grants: [], revokes: [capability] },
    { actorPrincipalId: auditor, reason: "Isolated N01 lock regression" },
    { expectedGrants: [], expectedRevokes: [] },
  );
}

beforeAll(async () => {
  await base.client.unsafe("CREATE DATABASE " + databaseName);
  databaseCreated = true;
  connectionA = createPostgresDatabase(url.toString());
  connectionB = createPostgresDatabase(url.toString());
  for (const name of migrations) {
    const sql = await readFile(new URL("../migrations/" + name, import.meta.url), "utf8");
    await requiredA().unsafe(sql);
  }
  await requiredA().unsafe(
    "INSERT INTO appbasis_permission_capability (capability_id) VALUES ($1)",
    [capability],
  );
  await requiredA().unsafe(
    "INSERT INTO appbasis_permission_role (role_id, display_name, state, kind) " +
      "VALUES ($1, 'N01 Test Trainer', 'active', 'managed')",
    [trainerRole],
  );
  await requiredA().unsafe(
    "INSERT INTO appbasis_permission_role_capability (role_id, capability_id) VALUES ($1, $2)",
    [trainerRole, capability],
  );
  await seedPrincipal(firstPrincipal);
  await seedPrincipal(secondPrincipal);
}, 120_000);

afterAll(async () => {
  if (connectionA !== null) {
    await connectionA.client.end();
    connectionA = null;
  }
  if (connectionB !== null) {
    await connectionB.client.end();
    connectionB = null;
  }
  if (databaseCreated) {
    await base.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
  }
  await base.client.end();
}, 120_000);

describe("N01 principal permission lock ordering (isolated PostgreSQL)", () => {
  it("serializes canonical revoke behind a registration-side shared lock", async () => {
    let release!: () => void;
    let ready!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });

    const guardedRead = requiredA().begin(async (transaction) => {
      const isolation = await transaction.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");
      const rows = await transaction.unsafe(
        "SELECT principal_id FROM appbasis_permission_principal " +
          "WHERE principal_id = $1 FOR SHARE",
        [firstPrincipal],
      );
      expect(rows).toHaveLength(1);
      expect(await effectiveRolePermission(transaction, firstPrincipal)).toBe(true);
      ready();
      await released;
      return effectiveRolePermission(transaction, firstPrincipal);
    });

    try {
      // Also surface errors before the guard signals readiness; never hang on
      // a failed transaction setup.
      await Promise.race([
        locked,
        guardedRead.then(() => { throw new Error("Guard exited before acquiring lock."); }),
      ]);
      await expect(revokeFor(firstPrincipal)).rejects.toMatchObject({
        code: "55P03", // lock_not_available: same-transaction lock_timeout
      });
      const prematureAudits = await requiredB().unsafe(
        "SELECT event_id FROM appbasis_permission_administration_audit " +
          "WHERE target_id = $1",
        [firstPrincipal],
      );
      expect(prematureAudits).toHaveLength(0);
    } finally {
      release();
    }

    expect(await guardedRead).toBe(true);
    await expect(revokeFor(firstPrincipal)).resolves.toEqual({
      grants: [],
      revokes: [capability],
    });
    expect(await effectiveRolePermission(requiredA(), firstPrincipal)).toBe(false);

    const audit = await requiredA().unsafe(
      "SELECT event_type FROM appbasis_permission_administration_audit " +
        "WHERE target_id = $1",
      [firstPrincipal],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.event_type).toBe("principal.permissions.replace");
  }, 20_000);

  it("denies a fresh registration-side read when revoke committed first", async () => {
    await expect(revokeFor(secondPrincipal)).resolves.toEqual({
      grants: [],
      revokes: [capability],
    });
    const allowed = await requiredA().begin(async (transaction) => {
      const isolation = await transaction.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");
      const locked = await transaction.unsafe(
        "SELECT principal_id FROM appbasis_permission_principal " +
          "WHERE principal_id = $1 FOR SHARE",
        [secondPrincipal],
      );
      expect(locked).toHaveLength(1);
      return effectiveRolePermission(transaction, secondPrincipal);
    });
    expect(allowed).toBe(false);
  }, 20_000);
});

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PostgresPermissionStore,
  PostgresRoleAdministration,
  capabilityId,
  principalId,
  roleId,
  type RoleAdministrationPostgresClient,
} from "../src";

// N01.8b: role-row concurrency prerequisite, not a trainer/admin registration path.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  throw new Error("DATABASE_URL is required for N01 isolated PostgreSQL role-lock E2E.");
}

const admin = createPostgresDatabase(databaseUrl);
const isolatedName = "appbasis_n01_role_" + randomUUID().replaceAll("-", "").slice(0, 16);
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.pathname = "/" + isolatedName;

let databaseCreated = false;
let connectionA: ReturnType<typeof createPostgresDatabase> | null = null;
let connectionB: ReturnType<typeof createPostgresDatabase> | null = null;

const edit = capabilityId("kindertraining:edit");
const capabilityRole = roleId("n01:role-capability");
const stateRole = roleId("n01:role-state");
const capabilityPrincipal = principalId("n01:role-capability-actor");
const statePrincipal = principalId("n01:role-state-actor");
const auditActor = principalId("n01:auditor");

function a() {
  if (!connectionA) throw new Error("Isolated PostgreSQL connection A unavailable.");
  return connectionA.client;
}

function b() {
  if (!connectionB) throw new Error("Isolated PostgreSQL connection B unavailable.");
  return connectionB.client;
}

// Canonical role-administration methods acquire FOR UPDATE on the role row.
// The timeout must run inside that same administration transaction.
function roleAdministration() {
  const client = b();
  const wrapper: RoleAdministrationPostgresClient = {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) => {
        await transaction.unsafe("SET LOCAL lock_timeout = '750ms'");
        await transaction.unsafe("SET LOCAL statement_timeout = '5s'");
        return callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        });
      });
    },
  };
  return new PostgresRoleAdministration(wrapper);
}

async function createRoleAndPrincipal(role: string, principal: string) {
  await a().unsafe(
    `INSERT INTO appbasis_permission_role (role_id, display_name, state, kind)
     VALUES ($1, 'N01 Regression', 'active', 'managed')`,
    [role],
  );
  await a().unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2)`,
    [role, edit],
  );
  await a().unsafe(
    "INSERT INTO appbasis_permission_principal (principal_id) VALUES ($1)",
    [principal],
  );
  await a().unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2)`,
    [principal, role],
  );
}

beforeAll(async () => {
  await admin.client.unsafe("CREATE DATABASE " + isolatedName);
  databaseCreated = true;
  connectionA = createPostgresDatabase(isolatedUrl.toString());
  connectionB = createPostgresDatabase(isolatedUrl.toString());

  for (const name of [
    "0000_appbasis_permissions_foundation.sql",
    "0001_appbasis_permission_role_lifecycle.sql",
    "0002_appbasis_permission_administration_audit.sql",
  ]) {
    await a().unsafe(
      await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"),
    );
  }
  await a().unsafe(
    "INSERT INTO appbasis_permission_capability (capability_id) VALUES ($1)",
    [edit],
  );
  await createRoleAndPrincipal(capabilityRole, capabilityPrincipal);
  await createRoleAndPrincipal(stateRole, statePrincipal);
}, 120_000);

afterAll(async () => {
  if (connectionA) {
    await connectionA.client.end();
    connectionA = null;
  }
  if (connectionB) {
    await connectionB.client.end();
    connectionB = null;
  }
  if (databaseCreated) {
    await admin.client.unsafe("DROP DATABASE " + isolatedName + " WITH (FORCE)");
  }
  await admin.client.end();
}, 120_000);

describe("N01 global role revocation ordering (isolated PostgreSQL)", () => {
  it("blocks canonical capability removal until a role-locked authorization commits", async () => {
    let signalReady!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });

    const guarded = a().begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL statement_timeout = '5s'");
      const isolation = await transaction.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");

      const roles = await transaction.unsafe(
        "SELECT role_id FROM appbasis_permission_role WHERE role_id = $1 FOR SHARE",
        [capabilityRole],
      );
      expect(roles).toHaveLength(1);
      const permissions = new PostgresPermissionStore(transaction);
      expect(await permissions.evaluatePermission({
        principalId: capabilityPrincipal,
        capability: edit,
      })).toBe(true);
      signalReady();
      await released;
      return permissions.evaluatePermission({
        principalId: capabilityPrincipal,
        capability: edit,
      });
    });

    try {
      await Promise.race([
        ready,
        guarded.then(() => { throw new Error("Authorization completed before role lock was held."); }),
      ]);
      await expect(
        roleAdministration().updateRole(
          capabilityRole,
          {
            displayName: "N01 Regression",
            capabilities: [],
          },
          { actorPrincipalId: auditActor, reason: "N01 concurrent capability removal" },
        ),
      ).rejects.toMatchObject({ code: "55P03" });

      // A lock timeout must not leave a phantom role-change audit.
      const audit = await b().unsafe(
        "SELECT event_id FROM appbasis_permission_administration_audit WHERE target_id = $1",
        [capabilityRole],
      );
      expect(audit).toHaveLength(0);
    } finally {
      release();
    }

    expect(await guarded).toBe(true);
    await expect(
      roleAdministration().updateRole(
        capabilityRole,
        { displayName: "N01 Regression", capabilities: [] },
        { actorPrincipalId: auditActor, reason: "N01 capability removal after commit" },
      ),
    ).resolves.toMatchObject({ capabilities: [] });

    expect(await new PostgresPermissionStore(a()).evaluatePermission({
      principalId: capabilityPrincipal,
      capability: edit,
    })).toBe(false);

    const audit = await a().unsafe(
      "SELECT event_type FROM appbasis_permission_administration_audit WHERE target_id = $1",
      [capabilityRole],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.event_type).toBe("role.update");
  }, 20_000);

  it("denies a fresh role-locked authorization after canonical role deactivation", async () => {
    await expect(
      roleAdministration().setRoleState(
        stateRole,
        "inactive",
        { actorPrincipalId: auditActor, reason: "N01 role deactivated before authorization" },
      ),
    ).resolves.toMatchObject({ state: "inactive" });

    const allowed = await a().begin(async (transaction) => {
      const isolation = await transaction.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");
      const roles = await transaction.unsafe(
        "SELECT role_id FROM appbasis_permission_role WHERE role_id = $1 FOR SHARE",
        [stateRole],
      );
      expect(roles).toHaveLength(1);
      return new PostgresPermissionStore(transaction).evaluatePermission({
        principalId: statePrincipal,
        capability: edit,
      });
    });
    expect(allowed).toBe(false);
  }, 20_000);
});

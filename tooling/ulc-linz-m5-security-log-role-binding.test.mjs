import assert from "node:assert/strict";
import test from "node:test";

import { bindUlcLinzSecurityLogRoles } from "./ulc-linz-m5-security-log-role-binding.mjs";

const HOST = "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const urls = Object.freeze({
  ownerDatabaseUrl: databaseUrl("owner_login"),
  ingestDatabaseUrl: databaseUrl("ingest_login"),
  cleanupDatabaseUrl: databaseUrl("cleanup_login"),
  readDatabaseUrl: databaseUrl("read_login"),
});

const roleRows = Object.freeze([
  role("ulc_linz_security_event_ingest", false),
  role("ulc_linz_security_event_cleanup", false),
  role("ulc_linz_security_event_read", false),
  role("ingest_login", true),
  role("cleanup_login", true),
  role("read_login", true),
]);

test("bindUlcLinzSecurityLogRoles provisions only missing exact memberships in one reserved transaction", async () => {
  const statements = [];
  let beginCalls = 0;
  let memberships = [
    { parent: "ulc_linz_security_event_ingest", member: "ingest_login", admin_option: false },
  ];
  const result = await bindUlcLinzSecurityLogRoles(
    { ...urls, apply: true },
    {
      databaseFactory() {
        return fakeDatabase(
          async (sql) => {
            statements.push(sql);
            if (sql.includes("FROM pg_catalog.pg_roles")) return roleRows;
            if (sql.includes("FROM pg_catalog.pg_auth_members")) return memberships;
            if (sql.startsWith("GRANT ")) {
              throw new Error("GRANT must use the reserved transaction client.");
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
          async (callback) => {
            beginCalls += 1;
            const transaction = Object.assign(
              function reservedTransactionClient() {},
              {
                async unsafe(sql) {
                  statements.push(sql);
                  const match = /^GRANT "([^"]+)" TO "([^"]+)"$/.exec(sql);
                  assert.ok(match);
                  memberships = [
                    ...memberships,
                    { parent: match[1], member: match[2], admin_option: false },
                  ];
                  return [];
                },
              },
            );
            return callback(transaction);
          },
        );
      },
    },
  );
  assert.equal(result.membershipBindingsVerified, true);
  assert.equal(result.changedBindings, 2);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(beginCalls, 1);
  assert.equal(statements.filter((sql) => sql.startsWith("GRANT ")).length, 2);
  assert.equal(statements.some((sql) => sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK"), false);
});

test("bindUlcLinzSecurityLogRoles rejects unexpected or delegated memberships", async () => {
  for (const membership of [
    { parent: "unexpected_role", member: "ingest_login", admin_option: false },
    { parent: "ulc_linz_security_event_ingest", member: "ingest_login", admin_option: true },
  ]) {
    await assert.rejects(
      bindUlcLinzSecurityLogRoles(
        { ...urls, apply: true },
        {
          databaseFactory() {
            return fakeDatabase(async (sql) => {
              if (sql.includes("FROM pg_catalog.pg_roles")) return roleRows;
              if (sql.includes("FROM pg_catalog.pg_auth_members")) return [membership];
              throw new Error(`Unexpected SQL: ${sql}`);
            });
          },
        },
      ),
      /membership|delegation/i,
    );
  }
});

test("bindUlcLinzSecurityLogRoles rejects privileged login roles", async () => {
  const privileged = roleRows.map((entry) =>
    entry.rolname === "read_login" ? { ...entry, rolcreaterole: true } : entry,
  );
  await assert.rejects(
    bindUlcLinzSecurityLogRoles(
      { ...urls, apply: true },
      {
        databaseFactory() {
          return fakeDatabase(async (sql) => {
            if (sql.includes("FROM pg_catalog.pg_roles")) return privileged;
            if (sql.includes("FROM pg_catalog.pg_auth_members")) return [];
            throw new Error(`Unexpected SQL: ${sql}`);
          });
        },
      },
    ),
    /privileged/i,
  );
});

test("bindUlcLinzSecurityLogRoles fails closed when a reserved transaction cannot be opened", async () => {
  await assert.rejects(
    bindUlcLinzSecurityLogRoles(
      { ...urls, apply: true },
      {
        databaseFactory() {
          return fakeDatabase(async (sql) => {
            if (sql.includes("FROM pg_catalog.pg_roles")) return roleRows;
            if (sql.includes("FROM pg_catalog.pg_auth_members")) return [];
            throw new Error(`Unexpected SQL: ${sql}`);
          });
        },
      },
    ),
    /transaction API is unavailable/i,
  );
});

function databaseUrl(user) {
  return `postgresql://${user}:secret@${HOST}:5432/neondb?sslmode=require`;
}

function role(rolname, rolcanlogin) {
  return Object.freeze({
    rolname,
    rolcanlogin,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  });
}

function fakeDatabase(unsafe, begin = null) {
  return {
    client: {
      unsafe,
      ...(typeof begin === "function" ? { begin } : {}),
      async end() {},
    },
  };
}
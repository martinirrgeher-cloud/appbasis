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

test("bindUlcLinzSecurityLogRoles provisions missing and non-inheriting exact memberships in one reserved transaction", async () => {
  const statements = [];
  let beginCalls = 0;
  let memberships = [
    membership("ulc_linz_security_event_ingest", "ingest_login", true),
    membership("ulc_linz_security_event_read", "read_login", false),
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
                  const match = /^GRANT "([^"]+)" TO "([^"]+)" WITH INHERIT TRUE$/.exec(sql);
                  assert.ok(match);
                  memberships = [
                    ...memberships.filter((edge) => edge.member !== match[2]),
                    membership(match[1], match[2], true),
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
  for (const edge of [
    { ...membership("unexpected_role", "ingest_login", true) },
    { ...membership("ulc_linz_security_event_ingest", "ingest_login", true), admin_option: true },
  ]) {
    await assert.rejects(
      bindUlcLinzSecurityLogRoles(
        { ...urls, apply: true },
        {
          databaseFactory() {
            return fakeDatabase(async (sql) => {
              if (sql.includes("FROM pg_catalog.pg_roles")) return roleRows;
              if (sql.includes("FROM pg_catalog.pg_auth_members")) return [edge];
              throw new Error(`Unexpected SQL: ${sql}`);
            });
          },
        },
      ),
      /membership|delegation/i,
    );
  }
});

test("bindUlcLinzSecurityLogRoles rejects malformed membership inheritance evidence", async () => {
  await assert.rejects(
    bindUlcLinzSecurityLogRoles(
      { ...urls, apply: true },
      {
        databaseFactory() {
          return fakeDatabase(async (sql) => {
            if (sql.includes("FROM pg_catalog.pg_roles")) return roleRows;
            if (sql.includes("FROM pg_catalog.pg_auth_members")) {
              return [{ parent: "ulc_linz_security_event_read", member: "read_login", admin_option: false }];
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          });
        },
      },
    ),
    /inheritance/i,
  );
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

function membership(parent, member, inherit_option) {
  return Object.freeze({ parent, member, admin_option: false, inherit_option });
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

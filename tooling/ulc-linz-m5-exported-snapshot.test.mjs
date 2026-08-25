import assert from "node:assert/strict";
import test from "node:test";

import { holdUlcLinzM5ExportedSnapshot } from "./ulc-linz-m5-exported-snapshot.mjs";

const validBackupPrincipal = Object.freeze({
  role_name: "ulc_backup_reader",
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
  session_user_matches: true,
  owns_database: false,
  owns_public_schema: false,
  database_create: false,
  public_schema_usage: true,
  public_schema_create: false,
  membership_count: 0,
  admin_membership_count: 0,
  owned_relation_count: 0,
  owned_function_count: 0,
  unreadable_table_count: 0,
  writable_table_count: 0,
  writable_column_count: 0,
  writable_sequence_count: 0,
  executable_function_count: 0,
  grantable_acl_count: 0,
});

function databaseFactoryFor(snapshotId, queries, backupPrincipal = validBackupPrincipal) {
  return () => ({
    client: {
      async begin(callback) {
        return callback({
          async unsafe(query) {
            queries.push(query);
            if (query.includes("WITH current_role AS")) {
              return [structuredClone(backupPrincipal)];
            }
            if (query.includes("pg_export_snapshot")) {
              return [{ snapshot_id: snapshotId }];
            }
            return [];
          },
        });
      },
      async end() {},
    },
  });
}

test("holds one least-privileged read-only repeatable-read exported snapshot until the workflow releases it", async () => {
  const queries = [];
  const writes = [];
  let accessCalls = 0;
  let clock = 1_000;
  const snapshotId = "00000003-0000001B-1";

  const result = await holdUlcLinzM5ExportedSnapshot(
    {
      databaseUrl: "postgresql://backup:pw@origin.example/neondb",
      snapshotPath: "/tmp/source.snapshot",
      releasePath: "/tmp/source.snapshot.release",
    },
    {
      databaseFactory: databaseFactoryFor(snapshotId, queries),
      fileWrite: async (path, content, options) => {
        writes.push({ path, content, options });
      },
      fileAccess: async () => {
        accessCalls += 1;
        if (accessCalls === 1) {
          const error = new Error("missing");
          error.code = "ENOENT";
          throw error;
        }
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    },
  );

  assert.equal(result, snapshotId);
  assert.equal(queries.length, 3);
  assert.equal(queries[0], "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  assert.match(queries[1], /session_user_matches/);
  assert.match(queries[1], /owns_database/);
  assert.match(queries[1], /owns_public_schema/);
  assert.match(queries[1], /database_create/);
  assert.match(queries[1], /public_schema_usage/);
  assert.match(queries[1], /public_schema_create/);
  assert.match(queries[1], /membership_count/);
  assert.match(queries[1], /writable_column_count/);
  assert.match(queries[1], /grantable_acl_count/);
  assert.match(queries[1], /pg_catalog\.aclexplode/);
  assert.equal(queries[2], "SELECT pg_catalog.pg_export_snapshot() AS snapshot_id");
  assert.deepEqual(writes, [{
    path: "/tmp/source.snapshot",
    content: `${snapshotId}\n`,
    options: { encoding: "utf8", mode: 0o600, flag: "wx" },
  }]);
  assert.equal(accessCalls, 2);
});

test("fails closed when the production backup credential is not least-privileged read-only", async () => {
  for (const backupPrincipal of [
    { ...validBackupPrincipal, rolsuper: true },
    { ...validBackupPrincipal, rolcreatedb: true },
    { ...validBackupPrincipal, rolcreaterole: true },
    { ...validBackupPrincipal, rolreplication: true },
    { ...validBackupPrincipal, rolbypassrls: true },
    { ...validBackupPrincipal, session_user_matches: false },
    { ...validBackupPrincipal, owns_database: true },
    { ...validBackupPrincipal, owns_public_schema: true },
    { ...validBackupPrincipal, database_create: true },
    { ...validBackupPrincipal, public_schema_usage: false },
    { ...validBackupPrincipal, public_schema_create: true },
    { ...validBackupPrincipal, membership_count: 1 },
    { ...validBackupPrincipal, admin_membership_count: 1 },
    { ...validBackupPrincipal, owned_relation_count: 1 },
    { ...validBackupPrincipal, owned_function_count: 1 },
    { ...validBackupPrincipal, unreadable_table_count: 1 },
    { ...validBackupPrincipal, writable_table_count: 1 },
    { ...validBackupPrincipal, writable_column_count: 1 },
    { ...validBackupPrincipal, writable_sequence_count: 1 },
    { ...validBackupPrincipal, executable_function_count: 1 },
    { ...validBackupPrincipal, grantable_acl_count: 1 },
  ]) {
    await assert.rejects(
      () => holdUlcLinzM5ExportedSnapshot(
        {
          databaseUrl: "postgresql://backup:pw@origin.example/neondb",
          snapshotPath: "/tmp/source.snapshot",
          releasePath: "/tmp/source.snapshot.release",
        },
        {
          databaseFactory: databaseFactoryFor("00000003-0000001B-1", [], backupPrincipal),
          fileWrite: async () => {
            throw new Error("must not export with privileged backup principal");
          },
          fileAccess: async () => {},
        },
      ),
      /backup principal is not least-privileged read-only/,
    );
  }
});

test("rejects malformed provider snapshot IDs before exposing them to the workflow", async () => {
  await assert.rejects(
    () => holdUlcLinzM5ExportedSnapshot(
      {
        databaseUrl: "postgresql://backup:pw@origin.example/neondb",
        snapshotPath: "/tmp/source.snapshot",
        releasePath: "/tmp/source.snapshot.release",
      },
      {
        databaseFactory: databaseFactoryFor("bad-snapshot'; DROP TABLE x; --", []),
        fileWrite: async () => {
          throw new Error("must not write malformed snapshot");
        },
        fileAccess: async () => {},
      },
    ),
    /snapshot ID is invalid/,
  );
});

test("fails closed when the exported snapshot is never released", async () => {
  let clock = 10_000;
  await assert.rejects(
    () => holdUlcLinzM5ExportedSnapshot(
      {
        databaseUrl: "postgresql://backup:pw@origin.example/neondb",
        snapshotPath: "/tmp/source.snapshot",
        releasePath: "/tmp/source.snapshot.release",
      },
      {
        databaseFactory: databaseFactoryFor("00000003-0000001B-1", []),
        fileWrite: async () => {},
        fileAccess: async () => {
          const error = new Error("missing");
          error.code = "ENOENT";
          throw error;
        },
        now: () => clock,
        sleep: async () => {
          clock += 5 * 60 * 1000;
        },
      },
    ),
    /snapshot release timed out/,
  );
});

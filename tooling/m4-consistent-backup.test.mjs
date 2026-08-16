import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  captureM4ConsistentBackup,
  M4_POSTGRES_DUMP_IMAGE,
  runPostgresDumpWithSnapshot,
} from "./m4-consistent-backup.mjs";

const connectionString =
  "postgresql://backup-user:backup-secret@backup.example.test/appbasis_m3_preview?sslmode=require";

const fingerprintGroups = [
  "identity_users",
  "identity_accounts",
  "identity_sessions",
  "identity_verifications",
  "identity_persons",
  "identity_security_state",
  "identity_operations",
  "permission_capabilities",
  "permission_roles",
  "permission_role_capabilities",
  "permission_principals",
  "permission_principal_roles",
  "permission_principal_grants",
  "permission_principal_revokes",
  "permission_audit",
  "tasks",
];
const validFingerprint = Object.freeze(
  Object.fromEntries(
    fingerprintGroups.flatMap((group, index) => [
      [`${group}_count`, String(index + 1)],
      [`${group}_digest`, (index % 2 === 0 ? "a" : "b").repeat(32)],
    ]),
  ),
);

function makeDatabase() {
  const queries = [];
  const events = [];
  let ended = 0;
  const transaction = {
    async unsafe(query) {
      queries.push(query);
      if (query.includes("pg_export_snapshot")) {
        events.push("snapshot-exported");
        return [{ snapshot_id: "00000003-0000001B-1" }];
      }
      if (/^\s*SELECT\b/i.test(query)) {
        events.push("fingerprint-read");
        return [validFingerprint];
      }
      return [];
    },
  };
  return {
    queries,
    events,
    get ended() {
      return ended;
    },
    createDatabase(input) {
      assert.equal(input, connectionString);
      return {
        client: {
          async begin(options, callback) {
            assert.equal(options, "isolation level repeatable read read only");
            events.push("transaction-begin");
            const result = await callback(transaction);
            events.push("transaction-end");
            return result;
          },
          async end() {
            ended += 1;
          },
        },
      };
    },
  };
}

test("fingerprint and pg_dump share the exact exported repeatable-read snapshot", async () => {
  const database = makeDatabase();
  const schemaCalls = [];
  const dumpCalls = [];

  const result = await captureM4ConsistentBackup({
    connectionString,
    outputPath: "/tmp/appbasis-test-consistent-backup.pgdump",
    createDatabase: database.createDatabase,
    verifySchema: async (input) => schemaCalls.push(input),
    runDump: async (input) => {
      database.events.push("dump-started");
      dumpCalls.push(input);
    },
  });

  assert.deepEqual(result, validFingerprint);
  assert.equal(schemaCalls.length, 1);
  assert.equal(dumpCalls.length, 1);
  assert.equal(dumpCalls[0].connectionString, connectionString);
  assert.equal(dumpCalls[0].snapshotId, "00000003-0000001B-1");
  assert.equal(dumpCalls[0].outputPath, "/tmp/appbasis-test-consistent-backup.pgdump");
  assert.deepEqual(database.events, [
    "transaction-begin",
    "snapshot-exported",
    "fingerprint-read",
    "dump-started",
    "transaction-end",
  ]);
  assert.deepEqual(database.queries.slice(0, 2), [
    "SET LOCAL TIME ZONE 'UTC'",
    "SET LOCAL DateStyle TO 'ISO, YMD'",
  ]);
  assert.equal(database.ended, 1);
});

test("pins the PostgreSQL dump image to the approved immutable digest", async () => {
  assert.equal(
    M4_POSTGRES_DUMP_IMAGE,
    "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15",
  );

  const dir = await mkdtemp(join(tmpdir(), "appbasis-m4-image-pin-"));
  const outputPath = join(dir, "database.pgdump");
  let spawnedArgs;
  const spawnImpl = (_command, args) => {
    spawnedArgs = args;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0, null));
    return child;
  };

  await runPostgresDumpWithSnapshot({
    connectionString,
    snapshotId: "00000003-0000001B-1",
    outputPath,
    spawnImpl,
  });

  assert.equal(spawnedArgs[6], M4_POSTGRES_DUMP_IMAGE);
  assert.match(spawnedArgs[6], /@sha256:[0-9a-f]{64}$/);
});

test("fails closed before schema inspection for a non-dedicated database URL", async () => {
  let schemaChecked = false;
  let dumped = false;

  await assert.rejects(
    captureM4ConsistentBackup({
      connectionString:
        "postgresql://backup-user:backup-secret@backup.example.test/other_database?sslmode=require",
      outputPath: "/tmp/appbasis-test-wrong-database.pgdump",
      createDatabase: () => {
        throw new Error("must not connect");
      },
      verifySchema: async () => {
        schemaChecked = true;
      },
      runDump: async () => {
        dumped = true;
      },
    }),
    /dedicated m3-preview database/,
  );

  assert.equal(schemaChecked, false);
  assert.equal(dumped, false);
});

test("fails closed and never dumps when snapshot export is invalid", async () => {
  const database = makeDatabase();
  database.createDatabase = () => ({
    client: {
      async begin(_options, callback) {
        return callback({
          async unsafe(query) {
            if (query.includes("pg_export_snapshot")) return [{ snapshot_id: "bad snapshot" }];
            return [];
          },
        });
      },
      async end() {},
    },
  });
  let dumped = false;

  await assert.rejects(
    captureM4ConsistentBackup({
      connectionString,
      outputPath: "/tmp/appbasis-test-invalid-snapshot.pgdump",
      createDatabase: database.createDatabase,
      verifySchema: async () => {},
      runDump: async () => {
        dumped = true;
      },
    }),
    /consistent backup capture failed/,
  );
  assert.equal(dumped, false);
});

test("fails closed and closes the database when pg_dump fails", async () => {
  const database = makeDatabase();
  await assert.rejects(
    captureM4ConsistentBackup({
      connectionString,
      outputPath: "/tmp/appbasis-test-dump-failure.pgdump",
      createDatabase: database.createDatabase,
      verifySchema: async () => {},
      runDump: async () => {
        throw new Error("do not expose provider details");
      },
    }),
    /consistent backup capture failed/,
  );
  assert.equal(database.ended, 1);
});

test("pre-dump failures never delete an existing target path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "appbasis-m4-existing-output-"));
  const outputPath = join(dir, "database.pgdump");
  const sentinel = Buffer.from("existing-unrelated-file");
  await writeFile(outputPath, sentinel, { mode: 0o600 });

  await assert.rejects(
    captureM4ConsistentBackup({
      connectionString,
      outputPath,
      createDatabase: () => {
        throw new Error("pre-dump database failure");
      },
      verifySchema: async () => {},
      runDump: async () => {
        throw new Error("must not run");
      },
    }),
    /consistent backup capture failed/,
  );

  assert.deepEqual(await readFile(outputPath), sentinel);
});

test("pg_dump exclusive-open failures never delete an existing target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "appbasis-m4-existing-dump-"));
  const outputPath = join(dir, "database.pgdump");
  const sentinel = Buffer.from("existing-good-dump");
  await writeFile(outputPath, sentinel, { mode: 0o600 });
  let spawned = false;

  await assert.rejects(
    runPostgresDumpWithSnapshot({
      connectionString,
      snapshotId: "00000003-0000001B-1",
      outputPath,
      spawnImpl: () => {
        spawned = true;
        throw new Error("must not spawn");
      },
    }),
    /snapshot dump failed/,
  );

  assert.equal(spawned, false);
  assert.deepEqual(await readFile(outputPath), sentinel);
});

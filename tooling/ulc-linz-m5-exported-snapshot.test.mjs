import assert from "node:assert/strict";
import test from "node:test";

import { holdUlcLinzM5ExportedSnapshot } from "./ulc-linz-m5-exported-snapshot.mjs";

function databaseFactoryFor(snapshotId, queries) {
  return () => ({
    client: {
      async begin(callback) {
        return callback({
          async unsafe(query) {
            queries.push(query);
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

test("holds one read-only repeatable-read exported snapshot until the workflow releases it", async () => {
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
  assert.deepEqual(queries, [
    "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    "SELECT pg_export_snapshot() AS snapshot_id",
  ]);
  assert.deepEqual(writes, [{
    path: "/tmp/source.snapshot",
    content: `${snapshotId}\n`,
    options: { encoding: "utf8", mode: 0o600, flag: "wx" },
  }]);
  assert.equal(accessCalls, 2);
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

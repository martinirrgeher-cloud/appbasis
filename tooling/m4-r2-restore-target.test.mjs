import assert from "node:assert/strict";
import test from "node:test";

import { verifyM4IsolatedRestoreTargetEmpty } from "./m4-r2-restore-target.mjs";

const sourceUrl =
  "postgresql://source:secret@source.example.test/appbasis_m3_preview?sslmode=require";
const restoreUrl =
  "postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=require";

function databaseFactory({ relationCount = 0, error = null } = {}) {
  let closed = 0;
  const calls = [];
  return {
    calls,
    get closed() {
      return closed;
    },
    createDatabase(connectionString) {
      assert.equal(connectionString, restoreUrl);
      return {
        client: {
          async unsafe(query) {
            calls.push(query);
            if (error) throw new Error(error);
            return [{ relation_count: relationCount }];
          },
          async end() {
            closed += 1;
          },
        },
      };
    },
  };
}

test("accepts only a distinct empty isolated m3-preview restore target", async () => {
  const database = databaseFactory();
  const result = await verifyM4IsolatedRestoreTargetEmpty({
    sourceUrl,
    restoreUrl,
    createDatabase: database.createDatabase,
  });

  assert.deepEqual(result, { status: "restore-target-empty", appId: "m3-preview" });
  assert.equal(database.calls.length, 1);
  assert.match(database.calls[0], /^\s*SELECT\b/i);
  assert.doesNotMatch(
    database.calls[0],
    /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
  );
  assert.equal(database.closed, 1);
});

test("rejects a non-empty restore target and closes the connection", async () => {
  const database = databaseFactory({ relationCount: 1 });
  await assert.rejects(
    verifyM4IsolatedRestoreTargetEmpty({
      sourceUrl,
      restoreUrl,
      createDatabase: database.createDatabase,
    }),
    /not empty or could not be inspected/,
  );
  assert.equal(database.closed, 1);
});

test("rejects the source database even when credentials differ", async () => {
  let created = false;
  await assert.rejects(
    verifyM4IsolatedRestoreTargetEmpty({
      sourceUrl,
      restoreUrl:
        "postgresql://other:other@source.example.test:5432/appbasis_m3_preview?sslmode=require",
      createDatabase() {
        created = true;
        throw new Error("must not connect");
      },
    }),
    /different database endpoint/,
  );
  assert.equal(created, false);
});

test("rejects Neon direct and pooler hostnames that represent the same endpoint", async () => {
  let created = false;
  await assert.rejects(
    verifyM4IsolatedRestoreTargetEmpty({
      sourceUrl:
        "postgresql://source:secret@ep-blue-field.eu-central-1.aws.neon.tech/appbasis_m3_preview?sslmode=require",
      restoreUrl:
        "postgresql://restore:secret@ep-blue-field-pooler.eu-central-1.aws.neon.tech/appbasis_m3_preview?sslmode=require",
      createDatabase() {
        created = true;
        throw new Error("must not connect");
      },
    }),
    /including Neon pooler aliases/,
  );
  assert.equal(created, false);
});

test("sanitizes restore target connection failures", async () => {
  const sentinel = "postgresql://user:super-secret@private-provider.example/hidden";
  const database = databaseFactory({ error: sentinel });
  await assert.rejects(
    verifyM4IsolatedRestoreTargetEmpty({
      sourceUrl,
      restoreUrl,
      createDatabase: database.createDatabase,
    }),
    (error) => {
      assert.match(error.message, /not empty or could not be inspected/);
      assert.doesNotMatch(error.message, /super-secret|private-provider/);
      return true;
    },
  );
  assert.equal(database.closed, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import { verifyM4IsolatedRestoreTargetEmpty } from "./m4-r2-restore-target.mjs";

const sourceUrl =
  "postgresql://source:secret@source.example.test/appbasis_m3_preview?sslmode=require";
const restoreUrl =
  "postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=require";

function databaseFactory({
  expectedConnectionString = restoreUrl,
  extraSchemaCount = 0,
  publicRelationCount = 0,
  publicRoutineCount = 0,
  publicTypeCount = 0,
  error = null,
} = {}) {
  let closed = 0;
  const calls = [];
  return {
    calls,
    get closed() {
      return closed;
    },
    createDatabase(connectionString) {
      assert.equal(connectionString, expectedConnectionString);
      return {
        client: {
          async unsafe(query) {
            calls.push(query);
            if (error) throw new Error(error);
            return [{
              extra_schema_count: extraSchemaCount,
              public_relation_count: publicRelationCount,
              public_routine_count: publicRoutineCount,
              public_type_count: publicTypeCount,
            }];
          },
          async end() {
            closed += 1;
          },
        },
      };
    },
  };
}

test("accepts only a distinct fresh isolated m3-preview restore target", async () => {
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
  assert.match(database.calls[0], /pg_catalog\.pg_namespace/);
  assert.match(database.calls[0], /pg_catalog\.pg_proc/);
  assert.match(database.calls[0], /pg_catalog\.pg_type/);
  assert.equal(database.closed, 1);
});

test("accepts only strong single sslmode values for restore transport", async () => {
  for (const sslmode of ["require", "verify-ca", "verify-full"]) {
    const secureRestoreUrl =
      `postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=${sslmode}`;
    const database = databaseFactory({ expectedConnectionString: secureRestoreUrl });
    await assert.doesNotReject(
      verifyM4IsolatedRestoreTargetEmpty({
        sourceUrl,
        restoreUrl: secureRestoreUrl,
        createDatabase: database.createDatabase,
      }),
    );
    assert.equal(database.closed, 1);
  }
});

test("rejects missing, weak or ambiguous sslmode before any database connection", async () => {
  for (const [insecureSourceUrl, insecureRestoreUrl] of [
    [
      "postgresql://source:secret@source.example.test/appbasis_m3_preview",
      restoreUrl,
    ],
    [
      sourceUrl,
      "postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=prefer",
    ],
    [
      sourceUrl,
      "postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=disable",
    ],
    [
      sourceUrl,
      "postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=require&sslmode=disable",
    ],
  ]) {
    let created = false;
    await assert.rejects(
      verifyM4IsolatedRestoreTargetEmpty({
        sourceUrl: insecureSourceUrl,
        restoreUrl: insecureRestoreUrl,
        createDatabase() {
          created = true;
          throw new Error("must not connect");
        },
      }),
      /encrypted transport/,
    );
    assert.equal(created, false);
  }
});

test("rejects application relations, routines, types and extra user schemas", async () => {
  for (const state of [
    { publicRelationCount: 1 },
    { publicRoutineCount: 1 },
    { publicTypeCount: 1 },
    { extraSchemaCount: 1 },
  ]) {
    const database = databaseFactory(state);
    await assert.rejects(
      verifyM4IsolatedRestoreTargetEmpty({
        sourceUrl,
        restoreUrl,
        createDatabase: database.createDatabase,
      }),
      /not empty or could not be inspected/,
    );
    assert.equal(database.closed, 1);
  }
});

test("rejects malformed empty-target inspection results fail-closed", async () => {
  const database = databaseFactory();
  database.createDatabase = (connectionString) => {
    assert.equal(connectionString, restoreUrl);
    return {
      client: {
        async unsafe(query) {
          database.calls.push(query);
          return [{
            extra_schema_count: 0,
            public_relation_count: 0,
            public_routine_count: 0,
          }];
        },
        async end() {},
      },
    };
  };

  await assert.rejects(
    verifyM4IsolatedRestoreTargetEmpty({
      sourceUrl,
      restoreUrl,
      createDatabase: database.createDatabase,
    }),
    /not empty or could not be inspected/,
  );
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

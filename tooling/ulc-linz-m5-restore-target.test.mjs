import assert from "node:assert/strict";
import test from "node:test";

import {
  resetAndVerifyUlcLinzM5IsolatedRestoreTarget,
  verifyUlcLinzM5IsolatedRestoreTargetEmpty,
} from "./ulc-linz-m5-restore-target.mjs";

const SOURCE = "postgresql://ulc_linz_application:secret@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const RESTORE = "postgresql://neondb_owner:secret@ep-restore.us-east-2.aws.neon.tech/neondb?sslmode=require";

function state(overrides = {}) {
  return {
    public_schema_count: 1,
    extra_schema_count: 0,
    public_relation_count: 0,
    public_routine_count: 0,
    public_type_count: 0,
    ...overrides,
  };
}

function emptyDatabase() {
  return {
    client: {
      async unsafe() {
        return [state()];
      },
      async end() {},
    },
  };
}

test("accepts only the canonical ULC production application source and an empty isolated restore target", async () => {
  const result = await verifyUlcLinzM5IsolatedRestoreTargetEmpty({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: emptyDatabase,
  });
  assert.deepEqual(result, { status: "restore-target-empty", appId: "ulc-linz" });
});

test("rejects owner, wrong database, wrong project, wrong region and same-target sources", async () => {
  const invalidSources = [
    SOURCE.replace("ulc_linz_application", "neondb_owner"),
    SOURCE.replace("/neondb?", "/appbasis_m3_preview?"),
    SOURCE.replace("ep-crimson-boat-b1aqfjwf.c-5", "ep-other-project.c-5"),
    SOURCE.replace("eu-central-1", "us-east-2"),
  ];

  for (const sourceUrl of invalidSources) {
    await assert.rejects(
      () => verifyUlcLinzM5IsolatedRestoreTargetEmpty({
        sourceUrl,
        restoreUrl: RESTORE,
        createDatabase: emptyDatabase,
      }),
      /production application principal|canonical ULC production Neon origin/,
    );
  }

  await assert.rejects(
    () => verifyUlcLinzM5IsolatedRestoreTargetEmpty({
      sourceUrl: SOURCE,
      restoreUrl: SOURCE.replace("ulc_linz_application", "neondb_owner"),
      createDatabase: emptyDatabase,
    }),
    /different database endpoint/,
  );
});

test("canonicalizes equivalent production endpoint spellings before allowing reset", async () => {
  const productionOwner = SOURCE.replace("ulc_linz_application", "neondb_owner");
  const equivalentRestoreUrls = [
    productionOwner.replace("/neondb?", "/n%65ondb?"),
    productionOwner.replace(".neon.tech/", ".neon.tech./"),
    productionOwner.replace("ep-crimson-boat-b1aqfjwf.c-5", "ep-crimson-boat-b1aqfjwf-pooler.c-5"),
    productionOwner.replace("/neondb?", "/%6Eeondb?"),
  ];

  for (const restoreUrl of equivalentRestoreUrls) {
    let createCalls = 0;
    await assert.rejects(
      () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
        sourceUrl: SOURCE,
        restoreUrl,
        createDatabase: () => {
          createCalls += 1;
          return emptyDatabase();
        },
      }),
      /different database endpoint/,
    );
    assert.equal(createCalls, 0, `must reject before connecting to ${restoreUrl}`);
  }
});

test("rejects malformed encoded database identities before connecting", async () => {
  const malformedRestoreUrls = [
    RESTORE.replace("/neondb?", "/neo%2Fndb?"),
    RESTORE.replace("/neondb?", "/neo%5Cndb?"),
    RESTORE.replace("/neondb?", "/neo%00ndb?"),
    RESTORE.replace("/neondb?", "/neo%ZZndb?"),
  ];

  for (const restoreUrl of malformedRestoreUrls) {
    let createCalls = 0;
    await assert.rejects(
      () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
        sourceUrl: SOURCE,
        restoreUrl,
        createDatabase: () => {
          createCalls += 1;
          return emptyDatabase();
        },
      }),
    );
    assert.equal(createCalls, 0);
  }
});

test("rejects weak transport and non-empty restore targets fail closed", async () => {
  await assert.rejects(
    () => verifyUlcLinzM5IsolatedRestoreTargetEmpty({
      sourceUrl: SOURCE.replace("sslmode=require", "sslmode=prefer"),
      restoreUrl: RESTORE,
      createDatabase: emptyDatabase,
    }),
    /encrypted transport/,
  );

  await assert.rejects(
    () => verifyUlcLinzM5IsolatedRestoreTargetEmpty({
      sourceUrl: SOURCE,
      restoreUrl: RESTORE,
      createDatabase: () => ({
        client: {
          async unsafe() {
            return [state({ public_relation_count: 1 })];
          },
          async end() {},
        },
      }),
    }),
    /not empty or could not be inspected/,
  );
});

test("reset is idempotent for an already empty isolated target", async () => {
  let beginCalls = 0;
  const result = await resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: () => ({
      client: {
        async unsafe() {
          return [state()];
        },
        async begin() {
          beginCalls += 1;
        },
        async end() {},
      },
    }),
  });

  assert.deepEqual(result, {
    status: "restore-target-empty",
    appId: "ulc-linz",
    resetApplied: false,
  });
  assert.equal(beginCalls, 0);
});

test("reset atomically replaces only the public schema and verifies the empty result", async () => {
  const transactionStatements = [];
  let inspectionCalls = 0;
  let beginCalls = 0;
  let closed = 0;
  const result = await resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: (connectionString) => {
      assert.equal(connectionString, RESTORE);
      return {
        client: {
          async unsafe(query) {
            assert.match(query, /pg_catalog\.pg_namespace/);
            inspectionCalls += 1;
            return inspectionCalls === 1
              ? [state({ public_relation_count: 12, public_routine_count: 2, public_type_count: 3 })]
              : [state()];
          },
          async begin(callback) {
            beginCalls += 1;
            await callback({
              async unsafe(statement) {
                transactionStatements.push(statement);
              },
            });
          },
          async end() {
            closed += 1;
          },
        },
      };
    },
  });

  assert.deepEqual(result, {
    status: "restore-target-empty",
    appId: "ulc-linz",
    resetApplied: true,
  });
  assert.equal(inspectionCalls, 2);
  assert.equal(beginCalls, 1);
  assert.equal(closed, 1);
  assert.deepEqual(transactionStatements, [
    "DROP SCHEMA IF EXISTS public CASCADE",
    "CREATE SCHEMA public",
    "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
    "GRANT USAGE ON SCHEMA public TO PUBLIC",
  ]);
});

test("reset refuses unexpected non-public schemas before any destructive statement", async () => {
  let beginCalls = 0;
  await assert.rejects(
    () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE,
      restoreUrl: RESTORE,
      createDatabase: () => ({
        client: {
          async unsafe() {
            return [state({ extra_schema_count: 1 })];
          },
          async begin() {
            beginCalls += 1;
          },
          async end() {},
        },
      }),
    }),
    /reset was refused or failed/,
  );
  assert.equal(beginCalls, 0);
});

test("reset fails closed when the transaction boundary or post-reset verification is invalid", async () => {
  await assert.rejects(
    () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE,
      restoreUrl: RESTORE,
      createDatabase: () => ({
        client: {
          async unsafe() {
            return [state({ public_relation_count: 1 })];
          },
          async end() {},
        },
      }),
    }),
    /reset was refused or failed/,
  );

  let inspectionCalls = 0;
  await assert.rejects(
    () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE,
      restoreUrl: RESTORE,
      createDatabase: () => ({
        client: {
          async unsafe() {
            inspectionCalls += 1;
            return [state({ public_relation_count: 1 })];
          },
          async begin(callback) {
            await callback({ async unsafe() {} });
          },
          async end() {},
        },
      }),
    }),
    /reset was refused or failed/,
  );
  assert.equal(inspectionCalls, 2);
});

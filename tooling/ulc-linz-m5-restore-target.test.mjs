import assert from "node:assert/strict";
import test from "node:test";

import { verifyUlcLinzM5IsolatedRestoreTargetEmpty } from "./ulc-linz-m5-restore-target.mjs";

const SOURCE = "postgresql://ulc_linz_application:secret@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const RESTORE = "postgresql://neondb_owner:secret@ep-restore.us-east-2.aws.neon.tech/neondb?sslmode=require";

function emptyDatabase() {
  return {
    client: {
      async unsafe() {
        return [{
          extra_schema_count: 0,
          public_relation_count: 0,
          public_routine_count: 0,
          public_type_count: 0,
        }];
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
            return [{
              extra_schema_count: 0,
              public_relation_count: 1,
              public_routine_count: 0,
              public_type_count: 0,
            }];
          },
          async end() {},
        },
      }),
    }),
    /not empty or could not be inspected/,
  );
});

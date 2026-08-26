import assert from "node:assert/strict";
import test from "node:test";

import { verifyUlcLinzM5IsolatedRestoreTargetEmpty } from "./ulc-linz-m5-restore-target.mjs";

const SOURCE = "postgresql://ulc_linz_application:secret@ep-prod.eu-central-1.aws.neon.tech/neondb?sslmode=require";
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

test("accepts only the exact Frankfurt ULC production application source and an empty isolated restore target", async () => {
  const result = await verifyUlcLinzM5IsolatedRestoreTargetEmpty({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: emptyDatabase,
  });
  assert.deepEqual(result, { status: "restore-target-empty", appId: "ulc-linz" });
});

test("rejects m3-preview, owner, wrong-region and same-target sources", async () => {
  for (const sourceUrl of [
    SOURCE.replace("ulc_linz_application", "neondb_owner"),
    SOURCE.replace("/neondb?", "/appbasis_m3_preview?"),
    SOURCE.replace("eu-central-1", "us-east-2"),
  ]) {
    await assert.rejects(
      () => verifyUlcLinzM5IsolatedRestoreTargetEmpty({
        sourceUrl,
        restoreUrl: RESTORE,
        createDatabase: emptyDatabase,
      }),
      /dedicated Frankfurt production application database/,
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

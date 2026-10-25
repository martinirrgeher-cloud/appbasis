import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUlcLinzPreviewGroupCleanupEnvironment,
  cleanupUlcLinzPreviewGroups,
  ULC_LINZ_PREVIEW_CANONICAL_ATTENDANCE_GROUP,
} from "./ulc-linz-preview-group-cleanup.mjs";

const CONNECTION =
  "postgresql://appbasis_ulc_linz_preview_application:password@ep-ulc-preview.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

test("deactivates only obsolete active Preview groups and preserves the canonical self-registration group", async () => {
  const executed = [];
  let ended = false;

  const result = await cleanupUlcLinzPreviewGroups(
    { connectionString: CONNECTION },
    {
      databaseFactory: () => ({
        client: {
          async begin(callback) {
            await callback({
              async unsafe(sql, parameters = []) {
                executed.push({ sql, parameters });
                if (sql.startsWith("SELECT current_database()")) {
                  return [
                    {
                      database_name: "appbasis_ulc_linz_preview",
                      principal_name: "appbasis_ulc_linz_preview_application",
                    },
                  ];
                }
                if (sql.includes("UPDATE appbasis_training_group")) {
                  assert.deepEqual(parameters, [
                    "ulc-linz-preview",
                    ULC_LINZ_PREVIEW_CANONICAL_ATTENDANCE_GROUP,
                  ]);
                  assert.match(sql, /lower\(btrim\(name\)\) LIKE 'preview%'/);
                  assert.match(sql, /name <> \$2/);
                  return [
                    { id: "group-old-1", name: "Preview U12" },
                    { id: "group-old-2", name: "Preview Training" },
                  ];
                }
                return [];
              },
            });
          },
          async end() {
            ended = true;
          },
        },
      }),
    },
  );

  assert.equal(result.state, "clean");
  assert.equal(result.deactivatedCount, 2);
  assert.equal(result.preservedGroup, "Preview Selbstanmeldung");
  assert.equal(ended, true);
  assert.ok(
    executed.some(({ sql }) => sql.includes("pg_advisory_xact_lock")),
  );
});

test("requires explicit preview-only approval", () => {
  assert.throws(
    () =>
      assertUlcLinzPreviewGroupCleanupEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
      }),
    /explicit approval/,
  );
  assert.throws(
    () =>
      assertUlcLinzPreviewGroupCleanupEnvironment({
        APPBASIS_GENERATED_APP_ID: "other",
        ULC_LINZ_PREVIEW_GROUP_CLEANUP_APPLY: "1",
      }),
    /appId ulc-linz/,
  );
  assert.doesNotThrow(() =>
    assertUlcLinzPreviewGroupCleanupEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      ULC_LINZ_PREVIEW_GROUP_CLEANUP_APPLY: "1",
    }),
  );
});

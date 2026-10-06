import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectUlcExerciseCatalogCutoverReadiness,
  renderUlcExerciseCatalogCutoverReadiness,
  UlcExerciseCatalogCutoverReadinessError,
} from "./ulc-linz-exercise-catalog-cutover-readiness.mjs";

const PREVIEW_URL =
  "postgresql://appbasis_ulc_linz_preview_migration:secret@ep-c3c.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

test("E6G-C3C rejects the application principal before opening PostgreSQL", async () => {
  let opened = false;
  await assert.rejects(
    inspectUlcExerciseCatalogCutoverReadiness(
      {
        connectionString:
          "postgresql://appbasis_ulc_linz_preview_application:secret@ep-c3c.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require",
      },
      {
        databaseFactory() {
          opened = true;
          throw new Error("must not open");
        },
      },
    ),
    (error) =>
      error instanceof UlcExerciseCatalogCutoverReadinessError &&
      /exact ULC preview migration database and principal/.test(error.message),
  );
  assert.equal(opened, false);
});

test("E6G-C3C uses one repeatable-read read-only transaction and reports exact equality", async () => {
  const queries = [];
  let closed = false;
  const databaseFactory = () => ({
    client: {
      async begin(callback) {
        return callback({
          async unsafe(query) {
            queries.push(query);
            if (query.startsWith("SET TRANSACTION")) return [];
            if (query.startsWith("SELECT current_database")) {
              return [
                {
                  database_name: "appbasis_ulc_linz_preview",
                  principal_name: "appbasis_ulc_linz_preview_migration",
                },
              ];
            }
            if (query.startsWith("SELECT to_regclass")) {
              return [
                {
                  source_item: "ulc_linz_exercise_catalog_item",
                  source_parameter: "ulc_linz_exercise_parameter",
                  source_audience: "ulc_linz_exercise_group",
                  source_favorite: "ulc_linz_exercise_favorite",
                  target_item: "appbasis_exercise_catalog_item",
                  target_parameter: "appbasis_exercise_catalog_parameter",
                  target_audience: "appbasis_exercise_catalog_audience",
                  target_favorite: "appbasis_exercise_catalog_favorite",
                },
              ];
            }
            if (query.includes("AS mismatch_count")) {
              return [
                {
                  source_count: 1,
                  target_count: 1,
                  mismatch_count: 0,
                },
              ];
            }
            throw new Error("unexpected SQL");
          },
        });
      },
      async end() {
        closed = true;
      },
    },
  });

  const result = await inspectUlcExerciseCatalogCutoverReadiness(
    { connectionString: PREVIEW_URL },
    { databaseFactory },
  );

  assert.equal(result.state, "ready-for-runtime-cutover");
  assert.equal(result.equality.exact, true);
  assert.equal(result.equality.totalMismatchCount, 0);
  assert.equal(result.tables.length, 4);
  assert.equal(result.sourceWriteQuiescence.requiredExternally, true);
  assert.equal(result.sourceWriteQuiescence.verifiedByRuntimeMode, false);
  assert.equal(result.runtimeCutover.performed, false);
  assert.deepEqual(result.writes, []);
  assert.match(queries[0], /REPEATABLE READ, READ ONLY/);
  assert.equal(closed, true);
  assert.equal(
    renderUlcExerciseCatalogCutoverReadiness(result),
    JSON.stringify(result, null, 2) + "\n",
  );
});

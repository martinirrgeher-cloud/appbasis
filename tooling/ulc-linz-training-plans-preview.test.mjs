import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyUlcTrainingPlansPreviewShape,
  inspectUlcTrainingPlansPreview,
  loadUlcTrainingPlansPreviewPlan,
  UlcTrainingPlansPreviewConfigurationError,
  UlcTrainingPlansPreviewExecutionError,
} from "./ulc-linz-training-plans-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_URL =
  `postgresql://appbasis_ulc_linz_preview_migration:x@${HOST}/${DATABASE}?sslmode=require`;
const APPLICATION_URL =
  `postgresql://appbasis_ulc_linz_preview_application:x@${HOST}/${DATABASE}?sslmode=require`;
const SECURITY_URL =
  `postgresql://appbasis_ulc_linz_preview_security_log:x@${HOST}/${DATABASE}?sslmode=require`;

const targetTables = [
  "appbasis_training_plan",
  "appbasis_training_plan_revision",
  "appbasis_training_plan_revision_item",
  "appbasis_training_plan_subject_deletion",
];

const trainingBlockTables = [
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter",
  "appbasis_training_block_favorite",
  "appbasis_training_block_usage",
];

test("E7B9 plan pins the published training-plans-v2 owner on the training-blocks-v3 baseline", async () => {
  const plan = await loadUlcTrainingPlansPreviewPlan({
    repositoryRoot,
  });

  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "training-plans");
  assert.equal(plan.preview.environment, "generated-preview-ulc-linz");
  assert.equal(plan.preview.database, DATABASE);
  assert.equal(plan.target.schemaVersion, 2);
  assert.deepEqual(plan.target.migrations, [
    "modules/training-plans/migrations/0000_appbasis_training_plans_foundation.sql",
    "modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql",
  ]);
  assert.deepEqual(plan.target.tables, targetTables);
  assert.deepEqual(
    plan.requiredTrainingBlocksTables,
    trainingBlockTables,
  );
  assert.equal(plan.productionChanged, false);
});

test("E7B9 preview shape distinguishes absent, current and partial training-plans schemas", () => {
  assert.equal(
    classifyUlcTrainingPlansPreviewShape({ tables: [] }),
    "migration-required",
  );
  assert.equal(
    classifyUlcTrainingPlansPreviewShape({ tables: targetTables }),
    "current",
  );
  assert.throws(
    () =>
      classifyUlcTrainingPlansPreviewShape({
        tables: targetTables.slice(0, 2),
      }),
    (error) =>
      error instanceof UlcTrainingPlansPreviewExecutionError &&
      /partially applied or drifted/.test(error.message),
  );
  assert.throws(
    () => classifyUlcTrainingPlansPreviewShape(),
    UlcTrainingPlansPreviewConfigurationError,
  );
});

test("E7B9 read-only inspect refuses a preview missing the complete training-blocks-v3 baseline", async () => {
  const tables = [...targetTables, ...trainingBlockTables.slice(0, -1)];
  let closed = false;
  const fakePlan = Object.freeze({
    preview: Object.freeze({
      environment: "generated-preview-ulc-linz",
      database: DATABASE,
      migrationPrincipal:
        "appbasis_ulc_linz_preview_migration",
    }),
    target: Object.freeze({
      schemaVersion: 2,
      migrations: Object.freeze([]),
      tables: Object.freeze([...targetTables]),
    }),
    requiredTrainingBlocksTables: Object.freeze([
      ...trainingBlockTables,
    ]),
    executionPlan: Object.freeze({
      baselineCatalogContract: Object.freeze([]),
      targetCatalogContract: Object.freeze([]),
    }),
  });

  await assert.rejects(
    inspectUlcTrainingPlansPreview(
      {
        migrationDatabaseUrl: MIGRATION_URL,
        applicationDatabaseUrl: APPLICATION_URL,
        securityLogDatabaseUrl: SECURITY_URL,
      },
      {
        repositoryRoot,
        loadPlan: async () => fakePlan,
        databaseFactory: () => ({
          client: {
            async unsafe(sql) {
              if (sql.includes("current_database()")) {
                return [{
                  database_name: DATABASE,
                  principal_name:
                    "appbasis_ulc_linz_preview_migration",
                }];
              }
              if (sql.includes("pg_catalog.pg_tables")) {
                return tables.map((tablename) => ({ tablename }));
              }
              throw new Error("unexpected SQL");
            },
            async end() {
              closed = true;
            },
          },
        }),
      },
    ),
    (error) =>
      error instanceof UlcTrainingPlansPreviewExecutionError &&
      /complete training-blocks-v3 preview baseline/.test(
        error.message,
      ),
  );
  assert.equal(closed, true);
});

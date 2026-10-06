import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcExerciseCatalogPreviewAdoption,
  assertUlcExerciseCatalogPreviewAdoptionEnvironment,
  loadUlcExerciseCatalogPreviewAdoptionApplyPlan,
  UlcExerciseCatalogPreviewAdoptionConfigurationError,
} from "./ulc-linz-exercise-catalog-preview-adoption-apply.mjs";

const PREVIEW_URL =
  "postgresql://appbasis_ulc_linz_preview_migration:secret@ep-c3b.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

test("E6G-C3B plans one atomic preview schema/copy transaction without runtime cutover", async () => {
  const plan = await loadUlcExerciseCatalogPreviewAdoptionApplyPlan();

  assert.equal(plan.schemaVersion, 1);
  assert.equal(
    plan.operation,
    "ulc-exercise-catalog-preview-adoption-apply",
  );
  assert.equal(
    plan.state,
    "ready-for-explicit-preview-schema-copy-apply",
  );
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "exercise-catalog");
  assert.equal(plan.repositoryState, "published-target");

  assert.deepEqual(plan.preview, {
    environment: "generated-preview-ulc-linz",
    database: "appbasis_ulc_linz_preview",
    migrationPrincipal:
      "appbasis_ulc_linz_preview_migration",
  });

  assert.deepEqual(plan.transaction, {
    atomic: true,
    isolation: "repeatable-read",
    rollbackSchemaOnCopyFailure: true,
  });

  assert.equal(plan.targetSchemaMigration.ownerId, "exercise-catalog");
  assert.equal(plan.targetSchemaMigration.schemaVersion, 2);
  assert.equal(plan.targetSchemaMigration.migrationCount, 2);
  assert.deepEqual(plan.targetSchemaMigration.migrationPaths, [
    "modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
    "modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
  ]);

  assert.equal(plan.copyAndVerify.tableCount, 4);
  assert.deepEqual(plan.copyAndVerify.sourceTables, [
    "ulc_linz_exercise_catalog_item",
    "ulc_linz_exercise_parameter",
    "ulc_linz_exercise_group",
    "ulc_linz_exercise_favorite",
  ]);
  assert.deepEqual(plan.copyAndVerify.targetTables, [
    "appbasis_exercise_catalog_item",
    "appbasis_exercise_catalog_parameter",
    "appbasis_exercise_catalog_audience",
    "appbasis_exercise_catalog_favorite",
  ]);
  assert.equal(
    plan.copyAndVerify.targetTablesMustBeAbsentBeforeApply,
    true,
  );
  assert.equal(
    plan.copyAndVerify.sourceWriteQuiescenceApplied,
    false,
  );

  assert.equal(plan.runtimeCutover.eligible, false);
  assert.equal(plan.runtimeCutover.separateGate, true);
  assert.deepEqual(plan.runtimeCutover.blockedUntil, [
    "preview-schema-copy-pass",
    "source-writes-quiesced",
    "final-source-target-equality-pass",
  ]);
  assert.equal(plan.providerAccess, false);
  assert.equal(plan.databaseAccess, false);
  assert.deepEqual(plan.writes, []);
});

test("E6G-C3B requires two independent explicit preview apply approvals", () => {
  assert.doesNotThrow(() =>
    assertUlcExerciseCatalogPreviewAdoptionEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
      APPBASIS_APPLY_EXERCISE_CATALOG_ADOPTION: "1",
    }),
  );

  assert.throws(
    () =>
      assertUlcExerciseCatalogPreviewAdoptionEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
        APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
        APPBASIS_APPLY_MIGRATIONS: "1",
        APPBASIS_APPLY_EXERCISE_CATALOG_ADOPTION: "0",
      }),
    /explicit copy\/verify approval/,
  );
});

test("E6G-C3B refuses the C2 isolated-proof scope before any database connection", async () => {
  let connected = false;

  await assert.rejects(
    applyUlcExerciseCatalogPreviewAdoption(
      {
        connectionString: PREVIEW_URL,
        executionScope: "isolated-proof",
      },
      {
        databaseFactory: () => {
          connected = true;
          throw new Error("must not connect");
        },
      },
    ),
    (error) =>
      error instanceof
        UlcExerciseCatalogPreviewAdoptionConfigurationError &&
      /only permits the preview-schema-copy execution scope/.test(
        error.message,
      ),
  );

  assert.equal(connected, false);
});

test("E6G-C3B refuses an application-runtime principal before any database connection", async () => {
  let connected = false;
  const applicationUrl =
    "postgresql://appbasis_ulc_linz_preview_application:secret@ep-c3b.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

  await assert.rejects(
    applyUlcExerciseCatalogPreviewAdoption(
      {
        connectionString: applicationUrl,
        executionScope: "preview-schema-copy",
      },
      {
        databaseFactory: () => {
          connected = true;
          throw new Error("must not connect");
        },
      },
    ),
    (error) =>
      error instanceof
        UlcExerciseCatalogPreviewAdoptionConfigurationError &&
      /exact ULC preview migration database and principal/.test(
        error.message,
      ),
  );

  assert.equal(connected, false);
});

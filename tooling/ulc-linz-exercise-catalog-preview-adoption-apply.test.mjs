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

test("P1: obsolete E6G-C3B schema/copy planner refuses published v5 (no provider access)", async () => {
  await assert.rejects(
    loadUlcExerciseCatalogPreviewAdoptionApplyPlan(),
    /FC6-B baseline migration contains a statement without a verifiable catalog marker/,
  );
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

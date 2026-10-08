import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyUlcExerciseCatalogPreviewParityShape,
  loadUlcExerciseCatalogPreviewParityPlan,
  UlcExerciseCatalogPreviewParityExecutionError,
} from "./ulc-linz-exercise-catalog-preview-parity.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

const baselineTables = [
  "appbasis_exercise_catalog_item",
  "appbasis_exercise_catalog_parameter",
  "appbasis_exercise_catalog_audience",
  "appbasis_exercise_catalog_favorite",
];

const parityMarkers = [
  "difficulty-column",
  "difficulty-constraint",
  "video-table",
  "video-index",
  "similarity-table",
  "similarity-index",
  "usage-table",
  "usage-index",
  "private-media-table",
  "private-media-storage-index",
  "private-media-exercise-index",
];

test("E6H preview parity pins the additive schema-v3 migration without changing production", async () => {
  const plan = await loadUlcExerciseCatalogPreviewParityPlan();

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.operation, "ulc-exercise-catalog-preview-parity");
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "exercise-catalog");
  assert.deepEqual(plan.preview, {
    environment: "generated-preview-ulc-linz",
    database: "appbasis_ulc_linz_preview",
    migrationPrincipal: "appbasis_ulc_linz_preview_migration",
  });
  assert.equal(plan.target.schemaVersion, 3);
  assert.equal(
    plan.target.migrationPath,
    "modules/exercise-catalog/migrations/0002_appbasis_exercise_catalog_parity.sql",
  );
  assert.equal(plan.target.statementCount, 11);
  assert.deepEqual(plan.target.parityMarkers, parityMarkers);
  assert.equal(plan.target.runtimeMode, "standard-module");
  assert.equal(plan.productionChanged, false);
  assert.equal(plan.statements.length, 11);
});

test("E6H preview parity distinguishes an untouched v2 target from the complete v3 target", () => {
  assert.equal(
    classifyUlcExerciseCatalogPreviewParityShape({
      baselineTables,
      parityMarkers: [],
    }),
    "upgrade-required",
  );
  assert.equal(
    classifyUlcExerciseCatalogPreviewParityShape({
      baselineTables,
      parityMarkers,
    }),
    "current",
  );
});

test("E6H preview parity fails closed on partial v3 application or a missing v2 baseline", () => {
  assert.throws(
    () =>
      classifyUlcExerciseCatalogPreviewParityShape({
        baselineTables,
        parityMarkers: ["difficulty-column"],
      }),
    (error) =>
      error instanceof UlcExerciseCatalogPreviewParityExecutionError &&
      /partially applied or drifted/.test(error.message),
  );

  assert.throws(
    () =>
      classifyUlcExerciseCatalogPreviewParityShape({
        baselineTables: baselineTables.slice(0, 3),
        parityMarkers: [],
      }),
    (error) =>
      error instanceof UlcExerciseCatalogPreviewParityExecutionError &&
      /schema-v2 baseline/.test(error.message),
  );
});

test("E6H preview workflow preserves the standard-module cutover and keeps mutation explicitly gated", async () => {
  const workflow = await readFile(
    resolve(
      repositoryRoot,
      ".github/workflows/ulc-linz-e6h-preview-parity.yml",
    ),
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: \$\{\{ inputs\.apply == true \}\}/);
  assert.match(workflow, /environment:\n\s+name: generated-preview-ulc-linz/);
  assert.match(
    workflow,
    /APPBASIS_EXPECTED_MODE: standard-module/,
  );
  assert.match(
    workflow,
    /entrypoint: "\.\/worker\/preview-exercise-catalog-standard\.ts"/,
  );
  assert.match(
    workflow,
    /r2BucketName: "appbasis-ulc-linz-preview-exercise-media"/,
  );
  assert.match(
    workflow,
    /r2Jurisdiction: "eu"/,
  );
  assert.match(
    workflow,
    /pre-created R2 binding/,
  );
  assert.doesNotMatch(
    workflow,
    /\/r2\/buckets/,
  );
  assert.match(
    workflow,
    /ulc-linz-exercise-catalog-preview-parity\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-exercise-catalog-preview-parity\.mjs verify/,
  );
  assert.match(
    workflow,
    /ulc-linz-exercise-catalog-preview-media-smoke\.mjs/,
  );
  assert.match(
    workflow,
    /APPBASIS_ROOT_ADMIN_PASSWORD/,
  );
  assert.doesNotMatch(
    workflow,
    /entrypoint: "\.\/worker\/preview\.ts"/,
  );
  assert.match(workflow, /Production was not changed\./);
});

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

const v3ParityMarkers = [
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
const parityMarkers = [
  ...v3ParityMarkers,
  "private-media-deletion-column",
  "private-media-deletion-index",
];

test("P1: retired E6H v4-only Preview migrator rejects current v5 manifest", async () => {
  await assert.rejects(
    loadUlcExerciseCatalogPreviewParityPlan(),
    /E6H preview parity requires the canonical exercise-catalog schema-v4 repository contract/,
  );
});

test("E6H preview parity distinguishes v2, v3 and complete v4 targets", () => {
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
      parityMarkers: v3ParityMarkers,
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

test("E6H preview parity fails closed on partial migration state or a missing v2 baseline", () => {
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
  assert.match(
    workflow,
    /Synchronize preview identity secret/,
  );
  assert.match(
    workflow,
    /wrangler secret put BETTER_AUTH_SECRET/,
  );
  assert.match(
    workflow,
    /APPBASIS_BETTER_AUTH_SECRET: \$\{\{ secrets\.APPBASIS_BETTER_AUTH_SECRET \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /entrypoint: "\.\/worker\/preview\.ts"/,
  );
  assert.match(workflow, /Production was not changed\./);
});

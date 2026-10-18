import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  classifyUlcTrainingBlocksV3PreviewShape,
  loadUlcTrainingBlocksV3PreviewPlan,
  UlcTrainingBlocksV3PreviewConfigurationError,
  UlcTrainingBlocksV3PreviewExecutionError,
} from "./ulc-linz-training-blocks-v3-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

test("training-blocks v3 preview pins only the incremental multi-audience migration", async () => {
  const plan = await loadUlcTrainingBlocksV3PreviewPlan({ repositoryRoot });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "training-blocks");
  assert.equal(plan.target.schemaVersion, 3);
  assert.equal(
    plan.target.migrationPath,
    "modules/training-blocks/migrations/0002_appbasis_training_block_multi_audience.sql",
  );
  assert.equal(plan.migration.relativePath, plan.target.migrationPath);
  assert.equal(plan.migration.statements.length, 2);
  assert.ok(
    plan.deltaCatalogContract.some(
      (marker) =>
        marker.kind === "column" &&
        marker.table === "appbasis_training_block_revision" &&
        marker.name === "audience_ids" &&
        marker.present === true,
    ),
  );
  assert.equal(plan.productionChanged, false);
});

test("training-blocks v3 preview distinguishes absent, complete and partial delta", () => {
  assert.equal(
    classifyUlcTrainingBlocksV3PreviewShape({
      audienceIdsColumn: false,
      audienceIdsCountConstraint: false,
      audienceCompatibilityConstraint: false,
    }),
    "migration-required",
  );
  assert.equal(
    classifyUlcTrainingBlocksV3PreviewShape({
      audienceIdsColumn: true,
      audienceIdsCountConstraint: true,
      audienceCompatibilityConstraint: true,
    }),
    "current",
  );
  assert.throws(
    () =>
      classifyUlcTrainingBlocksV3PreviewShape({
        audienceIdsColumn: true,
        audienceIdsCountConstraint: false,
        audienceCompatibilityConstraint: false,
      }),
    UlcTrainingBlocksV3PreviewExecutionError,
  );
  assert.throws(
    () => classifyUlcTrainingBlocksV3PreviewShape({}),
    UlcTrainingBlocksV3PreviewConfigurationError,
  );
});

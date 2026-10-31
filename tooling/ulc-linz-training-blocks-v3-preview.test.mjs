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

test("historical training-blocks v3 plan fails closed after repository advances to schema v4", async () => {
  await assert.rejects(
    loadUlcTrainingBlocksV3PreviewPlan({ repositoryRoot }),
    UlcTrainingBlocksV3PreviewConfigurationError,
  );
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

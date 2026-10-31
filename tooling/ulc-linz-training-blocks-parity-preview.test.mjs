import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyUlcTrainingBlocksParityPreviewShape,
  loadUlcTrainingBlocksParityPreviewPlan,
  UlcTrainingBlocksParityPreviewExecutionError,
  UlcTrainingBlocksParityPreviewConfigurationError,
} from "./ulc-linz-training-blocks-parity-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

const baselineTables = [
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter",
];
const targetTables = [
  "appbasis_training_block_favorite",
  "appbasis_training_block_usage",
];

test("historical v2 parity plan fails closed when published owner advances to v4", async () => {
  await assert.rejects(
    loadUlcTrainingBlocksParityPreviewPlan({ repositoryRoot }),
    UlcTrainingBlocksParityPreviewConfigurationError,
  );
});

test("E7A6 preview shape requires the complete E7A5 baseline", () => {
  assert.throws(
    () =>
      classifyUlcTrainingBlocksParityPreviewShape({
        tables: baselineTables.slice(0, 3),
      }),
    (error) =>
      error instanceof UlcTrainingBlocksParityPreviewExecutionError &&
      /complete E7A5/.test(error.message),
  );
  assert.equal(
    classifyUlcTrainingBlocksParityPreviewShape({ tables: baselineTables }),
    "migration-required",
  );
});

test("E7A6 preview shape distinguishes complete and partial schema-v2 targets", () => {
  assert.equal(
    classifyUlcTrainingBlocksParityPreviewShape({
      tables: [...baselineTables, ...targetTables],
    }),
    "current",
  );
  assert.throws(
    () =>
      classifyUlcTrainingBlocksParityPreviewShape({
        tables: [...baselineTables, targetTables[0]],
      }),
    (error) =>
      error instanceof UlcTrainingBlocksParityPreviewExecutionError &&
      /partially applied or drifted/.test(error.message),
  );
});

test("E7A6 workflow keeps inspect read-only and gates migration/deploy separately", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/ulc-linz-e7a6-preview.yml"),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- inspect/);
  assert.match(workflow, /- migrate/);
  assert.match(workflow, /- deploy/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /APPBASIS_APPLY_TRAINING_BLOCKS_PARITY_PREVIEW: "1"/);
  assert.match(workflow, /ulc-linz-training-blocks-parity-preview\.mjs apply/);
  assert.match(workflow, /ulc-linz-training-blocks-parity-preview\.mjs verify/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs reconcile/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs preflight-existing/);
  assert.match(workflow, /APPBASIS_EXPECTED_MODE: standard-module/);
  assert.match(workflow, /--dry-run/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /id="training-block-favorite"/);
  assert.match(workflow, /id="training-block-usage-info"/);
  assert.match(workflow, /for attempt in \$\(seq 1 20\)/);
  assert.match(workflow, /sleep 2/);
  assert.match(workflow, /did not converge to the E7A6 training-block UI within the propagation window/);
  assert.match(workflow, /Production was not changed\./);
});

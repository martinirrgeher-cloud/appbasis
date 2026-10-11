import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyUlcTrainingBlocksPreviewShape,
  loadUlcTrainingBlocksPreviewPlan,
  UlcTrainingBlocksPreviewExecutionError,
} from "./ulc-linz-training-blocks-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

const targetTables = [
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter",
];

test("E7A5 historical plan fails closed after the repository advances beyond schema v1", async () => {
  await assert.rejects(
    loadUlcTrainingBlocksPreviewPlan({ repositoryRoot }),
    /canonical published training-blocks schema-v1 repository contract/,
  );
});
test("E7A5 preview shape distinguishes absent and complete targets", () => {
  assert.equal(
    classifyUlcTrainingBlocksPreviewShape({ tables: [] }),
    "migration-required",
  );
  assert.equal(
    classifyUlcTrainingBlocksPreviewShape({ tables: targetTables }),
    "current",
  );
});

test("E7A5 preview shape fails closed on partial targets", () => {
  assert.throws(
    () =>
      classifyUlcTrainingBlocksPreviewShape({
        tables: targetTables.slice(0, 2),
      }),
    (error) =>
      error instanceof UlcTrainingBlocksPreviewExecutionError &&
      /partially applied or drifted/.test(error.message),
  );
});

test("E7A5 workflow keeps inspect read-only and gates migration/deploy separately", async () => {
  const workflow = await readFile(
    resolve(
      repositoryRoot,
      ".github/workflows/ulc-linz-e7a5-preview.yml",
    ),
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- inspect/);
  assert.match(workflow, /- migrate/);
  assert.match(workflow, /- deploy/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(
    workflow,
    /environment:\n\s+name: generated-preview-ulc-linz/,
  );
  assert.match(
    workflow,
    /inputs\.operation != 'inspect'/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_TRAINING_BLOCKS_PREVIEW: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-preview\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-preview\.mjs verify/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_DATABASE_ACCESS: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-d4-preview-database-access\.mjs reconcile/,
  );
  assert.match(
    workflow,
    /ulc-linz-d4-preview-database-access\.mjs preflight-existing/,
  );
  assert.match(
    workflow,
    /APPBASIS_EXPECTED_MODE: standard-module/,
  );
  assert.match(
    workflow,
    /ulc-linz-exercise-catalog-preview-runtime-smoke\.mjs/,
  );
  assert.match(
    workflow,
    /entrypoint: "\.\/worker\/preview-exercise-catalog-standard\.ts"/,
  );
  assert.match(
    workflow,
    /--dry-run/,
  );
  assert.match(
    workflow,
    /--experimental-provision=false/,
  );
  assert.match(
    workflow,
    /id="training-block-new"/,
  );
  assert.match(workflow, /Production was not changed\./);
});

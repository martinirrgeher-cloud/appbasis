import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyUlcTrainingDocumentationPreviewShape,
  loadUlcTrainingDocumentationPreviewPlan,
  UlcTrainingDocumentationPreviewConfigurationError,
  UlcTrainingDocumentationPreviewExecutionError,
} from "./ulc-linz-training-documentation-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

const targetTables = [
  "appbasis_training_documentation",
  "appbasis_training_documentation_revision",
];

const trainingPlanTables = [
  "appbasis_training_plan",
  "appbasis_training_plan_revision",
  "appbasis_training_plan_revision_item",
  "appbasis_training_plan_subject_deletion",
];

test("E7B9 documentation plan pins schema v1 on the training-plans-v2 baseline", async () => {
  const plan = await loadUlcTrainingDocumentationPreviewPlan({
    repositoryRoot,
  });

  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "training-documentation");
  assert.equal(plan.preview.environment, "generated-preview-ulc-linz");
  assert.equal(plan.preview.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.target.schemaVersion, 1);
  assert.deepEqual(plan.target.migrations, [
    "modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
  ]);
  assert.deepEqual(plan.target.tables, targetTables);
  assert.deepEqual(plan.requiredTrainingPlansTables, trainingPlanTables);
  assert.equal(plan.productionChanged, false);
});

test("E7B9 documentation preview shape fails closed on partial schema", () => {
  assert.equal(
    classifyUlcTrainingDocumentationPreviewShape({ tables: [] }),
    "migration-required",
  );
  assert.equal(
    classifyUlcTrainingDocumentationPreviewShape({ tables: targetTables }),
    "current",
  );
  assert.throws(
    () =>
      classifyUlcTrainingDocumentationPreviewShape({
        tables: targetTables.slice(0, 1),
      }),
    (error) =>
      error instanceof UlcTrainingDocumentationPreviewExecutionError &&
      /partially applied or drifted/.test(error.message),
  );
  assert.throws(
    () => classifyUlcTrainingDocumentationPreviewShape(),
    UlcTrainingDocumentationPreviewConfigurationError,
  );
});

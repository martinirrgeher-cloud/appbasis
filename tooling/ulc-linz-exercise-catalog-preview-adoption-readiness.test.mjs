import assert from "node:assert/strict";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { planUlcExerciseCatalogPreviewAdoptionReadiness } from "./ulc-linz-exercise-catalog-preview-adoption-readiness.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("E6G-C3A proves the published ULC repository target is ready for an explicit preview schema/copy gate", async () => {
  const plan = await planUlcExerciseCatalogPreviewAdoptionReadiness({
    repositoryRoot,
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(
    plan.operation,
    "ulc-exercise-catalog-preview-adoption-readiness",
  );
  assert.equal(plan.state, "ready-for-explicit-preview-schema-copy-gate");
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "exercise-catalog");
  assert.equal(plan.repositoryState, "published-target");

  assert.deepEqual(plan.preview, {
    environment: "generated-preview-ulc-linz",
    database: "appbasis_ulc_linz_preview",
    workerName: "appbasis-ulc-linz",
  });

  assert.equal(
    plan.targetSchemaMigration.repositoryState,
    "published-target",
  );
  assert.equal(plan.targetSchemaMigration.targetOwner.id, "exercise-catalog");
  assert.equal(plan.targetSchemaMigration.targetOwner.schemaVersion, 2);
  assert.equal(plan.targetSchemaMigration.migrationCount, 2);
  assert.equal(plan.targetSchemaMigration.executed, false);

  assert.equal(plan.copyAndVerify.tableCount, 4);
  assert.equal(plan.copyAndVerify.isolatedProofExecutorReusableOnPreview, false);
  assert.equal(plan.copyAndVerify.previewBoundExecutorRequired, true);
  assert.equal(plan.copyAndVerify.executed, false);

  assert.equal(plan.runtimeCutover.eligible, false);
  assert.equal(plan.runtimeCutover.separateGate, true);
  assert.deepEqual(plan.runtimeCutover.blockedUntil, [
    "preview-target-schema-migration-pass",
    "preview-copy-and-verify-pass",
    "source-writes-quiesced",
    "final-source-target-equality-pass",
  ]);

  assert.equal(plan.providerAccess, false);
  assert.equal(plan.databaseAccess, false);
  assert.deepEqual(plan.writes, []);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  catalogMarkerMatches,
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
  "appbasis_training_documentation_subject_deletion",
];

const trainingPlanTables = [
  "appbasis_training_plan",
  "appbasis_training_plan_revision",
  "appbasis_training_plan_revision_item",
  "appbasis_training_plan_subject_deletion",
];

test("E7B9 documentation plan pins schema v2 with subject write guards on the training-plans-v2 baseline", async () => {
  const plan = await loadUlcTrainingDocumentationPreviewPlan({
    repositoryRoot,
  });

  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "training-documentation");
  assert.equal(plan.preview.environment, "generated-preview-ulc-linz");
  assert.equal(plan.preview.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.target.schemaVersion, 2);
  assert.deepEqual(plan.target.migrations, [
    "modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
    "modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql",
  ]);
  const proof = plan.executionPlan.targetCatalogContract;
  assert.equal(proof.filter((marker) => marker.kind === "function").length, 3);
  assert.equal(proof.filter((marker) =>
    marker.kind === "function-public-execute-revoked"
  ).length, 3);
  assert.equal(proof.filter((marker) => marker.kind === "trigger").length, 2);
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
  // Existing v1-only preview databases may not be silently called v2-ready.
  assert.throws(
    () => classifyUlcTrainingDocumentationPreviewShape({
      tables: targetTables.slice(0, 2),
    }),
    /partially applied or drifted/,
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

test("E7B9 preview rejects drifts in SECURITY DEFINER and locked search_path", async () => {
  const body = "\nBEGIN\n  RETURN NEW;\nEND;\n";
  const marker = {
    kind: "function",
    name: "appbasis_training_documentation_guard_revision_write",
    arguments: "",
    returnType: "trigger",
    securityDefiner: true,
    bodyHash: createHash("sha256").update(body, "utf8").digest("hex"),
  };
  const fakeClient = (securityDefiner, hardenedSearchPath) => ({
    async unsafe(sql, params) {
      assert.match(sql, /prosecdef/);
      assert.match(sql, /proconfig/);
      assert.deepEqual(params, [marker.name]);
      return [{
        arguments: "",
        result_type: "trigger",
        source: body,
        security_definer: securityDefiner,
        hardened_search_path: hardenedSearchPath,
      }];
    },
  });
  assert.equal(await catalogMarkerMatches(fakeClient(true, true), marker), true);
  assert.equal(await catalogMarkerMatches(fakeClient(false, true), marker), false);
  assert.equal(await catalogMarkerMatches(fakeClient(true, false), marker), false);
  assert.equal(await catalogMarkerMatches(fakeClient(false, false), marker), false);
});

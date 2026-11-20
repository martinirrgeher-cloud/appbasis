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

test("P1: obsolete E7B9 documentation installer refuses published catalog-v5 baseline", async () => {
  await assert.rejects(
    loadUlcTrainingDocumentationPreviewPlan({ repositoryRoot }),
    /FC6-B baseline migration contains a statement without a verifiable catalog marker/,
  );
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

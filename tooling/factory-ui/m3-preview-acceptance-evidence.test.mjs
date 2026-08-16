import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveM3PreviewAcceptanceEvidence,
  isValidAcceptanceAttestation,
  M3_PREVIEW_ACCEPTANCE_ATTESTATION,
} from "./m3-preview-acceptance-evidence.mjs";

const definition = Object.freeze({
  schemaVersion: 2,
  appId: "m3-preview",
  displayName: "AppBasis M3 Preview",
  modules: Object.freeze(["tasks"]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

test("M3 preview acceptance attestation verifies the exact accepted generated app", () => {
  assert.equal(isValidAcceptanceAttestation(M3_PREVIEW_ACCEPTANCE_ATTESTATION), true);
  assert.deepEqual(deriveM3PreviewAcceptanceEvidence(definition), {
    previewAccepted: true,
  });
});

test("M3 preview evidence applies only to the accepted generated app", () => {
  assert.deepEqual(
    deriveM3PreviewAcceptanceEvidence({ ...definition, appId: "reference" }),
    {},
  );
  assert.deepEqual(
    deriveM3PreviewAcceptanceEvidence({ ...definition, appId: "tasks-minimal" }),
    {},
  );
});

test("M3 preview evidence fails closed for app definition drift", () => {
  for (const changedDefinition of [
    { ...definition, displayName: "Changed Preview" },
    { ...definition, modules: ["tasks", "future-module"] },
    { ...definition, platformServices: ["identity"] },
    { ...definition, futureSchemaField: true },
  ]) {
    assert.deepEqual(deriveM3PreviewAcceptanceEvidence(changedDefinition), {});
  }
});

test("M3 preview evidence fails closed for altered operational metadata or contract digests", () => {
  for (const attestation of [
    { ...M3_PREVIEW_ACCEPTANCE_ATTESTATION, workflowRunConclusion: "failure" },
    { ...M3_PREVIEW_ACCEPTANCE_ATTESTATION, workflowRunEvent: "push" },
    { ...M3_PREVIEW_ACCEPTANCE_ATTESTATION, workflowRunBranch: "feature/test" },
    { ...M3_PREVIEW_ACCEPTANCE_ATTESTATION, workflowRunId: 31961655065 },
    {
      ...M3_PREVIEW_ACCEPTANCE_ATTESTATION,
      workflowRunHeadSha: "0".repeat(40),
    },
    {
      ...M3_PREVIEW_ACCEPTANCE_ATTESTATION,
      acceptedM3ContractDigest: "0".repeat(64),
    },
    {
      ...M3_PREVIEW_ACCEPTANCE_ATTESTATION,
      acceptedAppDefinitionDigest: "0".repeat(64),
    },
  ]) {
    assert.equal(isValidAcceptanceAttestation(attestation), false);
    assert.deepEqual(deriveM3PreviewAcceptanceEvidence(definition, attestation), {});
  }
});

test("inherited or non-object attestation data cannot verify preview acceptance", () => {
  for (const attestation of [null, [], "success"]) {
    assert.equal(isValidAcceptanceAttestation(attestation), false);
    assert.deepEqual(deriveM3PreviewAcceptanceEvidence(definition, attestation), {});
  }

  const inherited = Object.create(M3_PREVIEW_ACCEPTANCE_ATTESTATION);
  assert.equal(isValidAcceptanceAttestation(inherited), false);
  assert.deepEqual(deriveM3PreviewAcceptanceEvidence(definition, inherited), {});
});

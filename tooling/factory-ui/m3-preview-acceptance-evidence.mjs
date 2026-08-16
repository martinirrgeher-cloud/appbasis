import { createHash } from "node:crypto";

import { M3_PREVIEW_INITIAL_VERSION } from "../m3-preview-initial-version.mjs";

export const M3_PREVIEW_ACCEPTANCE_ATTESTATION = Object.freeze({
  appId: "m3-preview",
  workflowName: "M3 Preview Post-Deploy Acceptance",
  workflowPath: ".github/workflows/m3-preview-post-deploy-acceptance.yml",
  workflowRunId: 31961655064,
  workflowRunHeadSha: "f230825c66cf7fa891b6b0cef4da77f79128cad2",
  workflowRunEvent: "workflow_dispatch",
  workflowRunBranch: "main",
  workflowRunConclusion: "success",
  acceptedM3ContractDigest:
    "6e2db17f9ebb3bff93ac63c774da9793bde4a5d0ada2adad18f5fdfb248f44a0",
  acceptedAppDefinitionDigest:
    "6fd7568ad3ec1793991da4d1a0b8353b18a9641a872847fd629549b9e1055413",
});

export function deriveM3PreviewAcceptanceEvidence(
  definition,
  attestation = M3_PREVIEW_ACCEPTANCE_ATTESTATION,
) {
  if (definition?.appId !== M3_PREVIEW_ACCEPTANCE_ATTESTATION.appId) {
    return Object.freeze({});
  }
  if (!isValidAcceptanceAttestation(attestation)) {
    return Object.freeze({});
  }
  if (
    attestation.acceptedM3ContractDigest !== currentM3ContractDigest() ||
    attestation.acceptedAppDefinitionDigest !== appDefinitionDigest(definition)
  ) {
    return Object.freeze({});
  }

  return Object.freeze({ previewAccepted: true });
}

export function isValidAcceptanceAttestation(attestation) {
  return (
    isPlainObject(attestation) &&
    attestation.appId === M3_PREVIEW_ACCEPTANCE_ATTESTATION.appId &&
    attestation.workflowName === M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowName &&
    attestation.workflowPath === M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowPath &&
    attestation.workflowRunId === M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowRunId &&
    attestation.workflowRunHeadSha ===
      M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowRunHeadSha &&
    attestation.workflowRunEvent === M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowRunEvent &&
    attestation.workflowRunBranch === M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowRunBranch &&
    attestation.workflowRunConclusion ===
      M3_PREVIEW_ACCEPTANCE_ATTESTATION.workflowRunConclusion &&
    attestation.acceptedM3ContractDigest ===
      M3_PREVIEW_ACCEPTANCE_ATTESTATION.acceptedM3ContractDigest &&
    attestation.acceptedAppDefinitionDigest ===
      M3_PREVIEW_ACCEPTANCE_ATTESTATION.acceptedAppDefinitionDigest
  );
}

function currentM3ContractDigest() {
  return createHash("sha256")
    .update(`${M3_PREVIEW_INITIAL_VERSION.sourceSha}\n`)
    .update(`${M3_PREVIEW_INITIAL_VERSION.versionId}\n`)
    .digest("hex");
}

function appDefinitionDigest(definition) {
  return createHash("sha256").update(canonicalJson(definition)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

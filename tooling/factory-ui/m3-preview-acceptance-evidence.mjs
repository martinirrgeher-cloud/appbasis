import { createHash } from "node:crypto";

import { M3_PREVIEW_INITIAL_VERSION } from "../m3-preview-initial-version.mjs";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";

export const M3_PREVIEW_ACCEPTANCE_RUN = Object.freeze({
  appId: "m3-preview",
  repository: GITHUB_REPOSITORY,
  workflowName: "M3 Preview Post-Deploy Acceptance",
  workflowPath: ".github/workflows/m3-preview-post-deploy-acceptance.yml",
  workflowRunId: 31961655064,
  workflowRunAttempt: 1,
  workflowRunHeadSha: "f230825c66cf7fa891b6b0cef4da77f79128cad2",
  workflowRunEvent: "workflow_dispatch",
  workflowRunBranch: "main",
  acceptedM3ContractDigest:
    "6e2db17f9ebb3bff93ac63c774da9793bde4a5d0ada2adad18f5fdfb248f44a0",
  acceptedAppDefinitionDigest:
    "6fd7568ad3ec1793991da4d1a0b8353b18a9641a872847fd629549b9e1055413",
});

export async function deriveM3PreviewAcceptanceEvidence(
  definition,
  { fetchImpl = fetch } = {},
) {
  if (definition?.appId !== M3_PREVIEW_ACCEPTANCE_RUN.appId) {
    return Object.freeze({});
  }
  if (
    M3_PREVIEW_ACCEPTANCE_RUN.acceptedM3ContractDigest !== currentM3ContractDigest() ||
    M3_PREVIEW_ACCEPTANCE_RUN.acceptedAppDefinitionDigest !== appDefinitionDigest(definition)
  ) {
    return Object.freeze({});
  }

  const verified = await verifyAcceptanceRun(fetchImpl);
  return Object.freeze(verified ? { previewAccepted: true } : {});
}

export async function verifyAcceptanceRun(fetchImpl = fetch) {
  if (typeof fetchImpl !== "function") return false;

  let response;
  try {
    response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/repos/${M3_PREVIEW_ACCEPTANCE_RUN.repository}/actions/runs/${M3_PREVIEW_ACCEPTANCE_RUN.workflowRunId}`,
      {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
        redirect: "error",
      },
    );
  } catch {
    return false;
  }

  if (!response?.ok) return false;
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;

  let run;
  try {
    run = await response.json();
  } catch {
    return false;
  }

  return isExpectedSuccessfulRun(run);
}

function isExpectedSuccessfulRun(run) {
  return (
    isPlainObject(run) &&
    run.id === M3_PREVIEW_ACCEPTANCE_RUN.workflowRunId &&
    run.run_attempt === M3_PREVIEW_ACCEPTANCE_RUN.workflowRunAttempt &&
    run.name === M3_PREVIEW_ACCEPTANCE_RUN.workflowName &&
    run.path === M3_PREVIEW_ACCEPTANCE_RUN.workflowPath &&
    run.event === M3_PREVIEW_ACCEPTANCE_RUN.workflowRunEvent &&
    run.head_branch === M3_PREVIEW_ACCEPTANCE_RUN.workflowRunBranch &&
    run.head_sha === M3_PREVIEW_ACCEPTANCE_RUN.workflowRunHeadSha &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    isPlainObject(run.repository) &&
    run.repository.full_name === M3_PREVIEW_ACCEPTANCE_RUN.repository
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

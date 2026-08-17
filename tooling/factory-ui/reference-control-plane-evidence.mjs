const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;

export const REFERENCE_CONTROL_PLANE_EVIDENCE_RUN = Object.freeze({
  appId: "reference",
  targetEnvironment: "reference-preview",
  repository: GITHUB_REPOSITORY,
  workflowName: "M5 Reference Control Plane Evidence",
  workflowPath: ".github/workflows/m5-reference-control-plane-evidence.yml",
  workflowRunId: 32025695514,
  workflowRunAttempt: 1,
  workflowRunHeadSha: "e7fb8dbd5e76041109e2f045eabc50fc803c13a0",
  workflowRunEvent: "workflow_dispatch",
  workflowRunBranch: "main",
});

export async function deriveReferenceControlPlaneEvidence(
  definition,
  { fetchImpl = fetch } = {},
) {
  if (definition?.appId !== REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.appId) {
    return Object.freeze({});
  }

  const verified = await verifyReferenceControlPlaneEvidenceRun(fetchImpl);
  return Object.freeze(
    verified ? { privilegedControlPlaneIsolation: true } : {},
  );
}

export async function verifyReferenceControlPlaneEvidenceRun(fetchImpl = fetch) {
  if (typeof fetchImpl !== "function") return false;

  let response;
  try {
    response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/repos/${REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.repository}/actions/runs/${REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunId}`,
      {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(GITHUB_EVIDENCE_TIMEOUT_MS),
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
    run.id === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunId &&
    run.run_attempt === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunAttempt &&
    run.name === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowName &&
    run.path === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowPath &&
    run.event === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunEvent &&
    run.head_branch === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunBranch &&
    run.head_sha === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunHeadSha &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    isPlainObject(run.repository) &&
    run.repository.full_name === REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.repository
  );
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

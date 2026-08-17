const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY = Object.freeze({
  appId: "reference",
  repository: GITHUB_REPOSITORY,
  workflowName: "M5 Reference Control Plane Evidence",
  workflowPath: ".github/workflows/m5-reference-control-plane-evidence.yml",
  workflowFileName: "m5-reference-control-plane-evidence.yml",
  workflowRunEvent: "workflow_dispatch",
  workflowRunBranch: "main",
  maxAgeMs: ONE_DAY_MS,
});

export async function deriveReferenceControlPlaneEvidence(
  definition,
  { fetchImpl = fetch, now = Date.now } = {},
) {
  if (definition?.appId !== REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.appId) {
    return Object.freeze({});
  }

  const verified = await verifyReferenceControlPlaneEvidenceRun(fetchImpl, now);
  return Object.freeze(
    verified ? { privilegedControlPlaneIsolation: true } : {},
  );
}

export async function verifyReferenceControlPlaneEvidenceRun(
  fetchImpl = fetch,
  now = Date.now,
) {
  if (typeof fetchImpl !== "function" || typeof now !== "function") return false;

  const currentTime = readCurrentTime(now);
  if (currentTime === null) return false;

  const trustedHeadSha = await fetchCurrentMainHeadSha(fetchImpl);
  if (trustedHeadSha === null) return false;

  const payload = await fetchJson(fetchImpl, latestEvidenceRunsUrl());
  if (payload === null) return false;

  const run = latestRunFromPayload(payload);
  return (
    run !== null &&
    isExpectedFreshSuccessfulRun(run, currentTime, trustedHeadSha)
  );
}

async function fetchCurrentMainHeadSha(fetchImpl) {
  const payload = await fetchJson(fetchImpl, currentMainHeadUrl());
  if (
    !isPlainObject(payload) ||
    typeof payload.sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(payload.sha)
  ) {
    return null;
  }
  return payload.sha;
}

async function fetchJson(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(GITHUB_EVIDENCE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response?.ok) return null;
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function currentMainHeadUrl() {
  const policy = REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY;
  return new URL(
    `${GITHUB_API_BASE_URL}/repos/${policy.repository}/commits/${encodeURIComponent(policy.workflowRunBranch)}`,
  );
}

function latestEvidenceRunsUrl() {
  const policy = REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY;
  const url = new URL(
    `${GITHUB_API_BASE_URL}/repos/${policy.repository}/actions/workflows/${encodeURIComponent(policy.workflowFileName)}/runs`,
  );
  url.searchParams.set("branch", policy.workflowRunBranch);
  url.searchParams.set("event", policy.workflowRunEvent);
  url.searchParams.set("per_page", "1");
  return url;
}

function latestRunFromPayload(payload) {
  if (!isPlainObject(payload)) return null;
  if (!Number.isSafeInteger(payload.total_count) || payload.total_count < 1) {
    return null;
  }
  if (!Array.isArray(payload.workflow_runs) || payload.workflow_runs.length !== 1) {
    return null;
  }
  return payload.workflow_runs[0];
}

function isExpectedFreshSuccessfulRun(run, currentTime, trustedHeadSha) {
  const policy = REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY;
  if (
    !isPlainObject(run) ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    run.run_attempt !== 1 ||
    run.name !== policy.workflowName ||
    run.path !== policy.workflowPath ||
    run.event !== policy.workflowRunEvent ||
    run.head_branch !== policy.workflowRunBranch ||
    run.head_sha !== trustedHeadSha ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !isPlainObject(run.repository) ||
    run.repository.full_name !== policy.repository
  ) {
    return false;
  }

  const createdAt = parseTimestamp(run.created_at);
  const observedAt = parseTimestamp(run.updated_at);
  if (createdAt === null || observedAt === null || createdAt > observedAt) {
    return false;
  }

  return (
    currentTime >= observedAt &&
    currentTime - observedAt < policy.maxAgeMs
  );
}

function readCurrentTime(now) {
  let currentTime;
  try {
    currentTime = now();
  } catch {
    return null;
  }
  return Number.isFinite(currentTime) ? currentTime : null;
}

function parseTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

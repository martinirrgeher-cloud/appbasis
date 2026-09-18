const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_API_BASE = "https://api.github.com";
const WORKFLOW_NAME = "Generated App Preview Lifecycle";
const WORKFLOW_PATH = ".github/workflows/generated-app-preview-lifecycle.yml";
const WORKFLOW_FILE = "generated-app-preview-lifecycle.yml";
const TIMEOUT_MS = 3000;
const PER_PAGE = 100;
const MAX_PAGES = 3;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const APP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const GITHUB_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const GENERATED_PREVIEW_OPERATIONS = Object.freeze([
  "hyperdrive",
  "migrate",
  "bootstrap",
  "deploy",
]);

export async function deriveGeneratedPreviewRunEvidence(
  appId,
  { fetchImpl = fetch } = {},
) {
  if (
    typeof appId !== "string" ||
    !APP_ID_PATTERN.test(appId) ||
    typeof fetchImpl !== "function"
  ) {
    return unavailableEvidence();
  }

  const mainSha = await fetchCurrentMainSha(fetchImpl);
  if (mainSha === null) return unavailableEvidence();

  const runs = await fetchWorkflowRuns(fetchImpl);
  if (runs === null) return unavailableEvidence();

  const confirmedMainSha = await fetchCurrentMainSha(fetchImpl);
  if (confirmedMainSha !== mainSha) {
    return unavailableEvidence();
  }

  const matching = runs
    .map((run) => normalizedRelevantRun(run, appId, mainSha))
    .filter((run) => run !== null)
    .sort(compareRuns);

  const completed = [];
  let previousCompletedAt = null;

  for (const operation of GENERATED_PREVIEW_OPERATIONS) {
    const candidates = matching.filter((run) => {
      if (run.operation !== operation) return false;
      if (previousCompletedAt === null) return true;
      return Date.parse(run.startedAt) >= Date.parse(previousCompletedAt);
    });
    const candidate = candidates.at(-1);
    if (candidate === undefined || candidate.evidenceAccepted !== true) break;
    completed.push(withoutEvidenceFlag(candidate));
    previousCompletedAt = candidate.completedAt;
  }

  const completedOperations = completed.map((run) => run.operation);
  const nextOperation =
    completedOperations.length < GENERATED_PREVIEW_OPERATIONS.length
      ? GENERATED_PREVIEW_OPERATIONS[completedOperations.length]
      : null;

  return Object.freeze({
    status: "available",
    exactHeadSha: mainSha,
    completedOperations: Object.freeze(completedOperations),
    nextOperation,
    previewVerified:
      completedOperations.length === GENERATED_PREVIEW_OPERATIONS.length,
    runs: Object.freeze(completed),
  });
}

export function generatedPreviewRunTitle(appId, operation) {
  if (
    typeof appId !== "string" ||
    !APP_ID_PATTERN.test(appId) ||
    !GENERATED_PREVIEW_OPERATIONS.includes(operation)
  ) {
    throw new Error("Generated preview run title input is invalid.");
  }
  return `Generated Preview · ${appId} · ${operation}`;
}

async function fetchCurrentMainSha(fetchImpl) {
  const payload = await githubJson(
    fetchImpl,
    `${GITHUB_API_BASE}/repos/${GITHUB_REPOSITORY}/branches/main`,
  );
  const sha = payload?.commit?.sha;
  return typeof sha === "string" && COMMIT_SHA_PATTERN.test(sha) ? sha : null;
}

async function fetchWorkflowRuns(fetchImpl) {
  const runs = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs`,
    );
    url.searchParams.set("branch", "main");
    url.searchParams.set("event", "workflow_dispatch");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    const payload = await githubJson(fetchImpl, url.href);
    if (!Array.isArray(payload?.workflow_runs)) return null;
    runs.push(...payload.workflow_runs);

    if (payload.workflow_runs.length < PER_PAGE) return runs;
    if (
      Number.isInteger(payload.total_count) &&
      payload.total_count >= 0 &&
      runs.length >= payload.total_count
    ) {
      return runs;
    }
  }
  return null;
}

async function githubJson(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

function normalizedRelevantRun(run, appId, mainSha) {
  if (!isRecord(run)) return null;

  const operation = operationFromDisplayTitle(run.display_title, appId);
  if (operation === null) return null;
  if (
    run.name !== WORKFLOW_NAME ||
    run.path !== WORKFLOW_PATH ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.head_sha !== mainSha ||
    !isRecord(run.repository) ||
    run.repository.full_name !== GITHUB_REPOSITORY ||
    !Number.isInteger(run.id) ||
    run.id <= 0 ||
    !Number.isInteger(run.run_attempt) ||
    run.run_attempt <= 0 ||
    !isIsoTimestamp(run.run_started_at) ||
    !isIsoTimestamp(run.updated_at) ||
    Date.parse(run.updated_at) < Date.parse(run.run_started_at)
  ) {
    return null;
  }

  return Object.freeze({
    operation,
    runId: run.id,
    runUrl: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${run.id}`,
    startedAt: run.run_started_at,
    completedAt: run.updated_at,
    evidenceAccepted:
      run.run_attempt === 1 &&
      run.status === "completed" &&
      run.conclusion === "success",
  });
}

function compareRuns(left, right) {
  const time = Date.parse(left.startedAt) - Date.parse(right.startedAt);
  return time !== 0 ? time : left.runId - right.runId;
}

function withoutEvidenceFlag(run) {
  return Object.freeze({
    operation: run.operation,
    runId: run.runId,
    runUrl: run.runUrl,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  });
}

function operationFromDisplayTitle(value, appId) {
  for (const operation of GENERATED_PREVIEW_OPERATIONS) {
    if (value === generatedPreviewRunTitle(appId, operation)) return operation;
  }
  return null;
}

function unavailableEvidence() {
  return Object.freeze({
    status: "unavailable",
    exactHeadSha: null,
    completedOperations: Object.freeze([]),
    nextOperation: null,
    previewVerified: false,
    runs: Object.freeze([]),
  });
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !GITHUB_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

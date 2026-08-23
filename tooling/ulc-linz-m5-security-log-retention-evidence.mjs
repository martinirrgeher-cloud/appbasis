import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const ULC_LINZ_M5_F_RETENTION_RUN_POLICY = Object.freeze({
  appId: "ulc-linz",
  repository: GITHUB_REPOSITORY,
  workflowName: "M5 ULC Security Log Retention",
  workflowPath: ".github/workflows/m5-ulc-security-log-retention.yml",
  workflowFileName: "m5-ulc-security-log-retention.yml",
  workflowRunEvent: "workflow_dispatch",
  workflowRunBranch: "main",
  maxAgeMs: ONE_DAY_MS,
});

export async function readUlcLinzM5SecurityLogRetentionRunEvidence(
  { fetchImpl = fetch, now = Date.now } = {},
) {
  if (typeof fetchImpl !== "function" || typeof now !== "function") return Object.freeze({});

  const currentTime = readCurrentTime(now);
  if (currentTime === null) return Object.freeze({});

  const trustedHeadSha = await fetchCurrentMainHeadSha(fetchImpl);
  if (trustedHeadSha === null) return Object.freeze({});

  const payload = await fetchJson(fetchImpl, latestEvidenceRunsUrl());
  if (payload === null) return Object.freeze({});

  const run = latestRunFromPayload(payload);
  const observedAt = verifiedRunObservedAt(run, currentTime, trustedHeadSha);
  if (observedAt === null) return Object.freeze({});

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "github-actions-controlled-production-retention-run",
    cleanupExecutionBound: true,
    cleanupLastSucceededAt: observedAt,
    cleanupResultVerified: true,
    cutoffSemantics: "created-at-strictly-older-than-12-calendar-months",
    boundaryEventPreserved: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  });
}

async function fetchCurrentMainHeadSha(fetchImpl) {
  const payload = await fetchJson(fetchImpl, currentMainHeadUrl());
  if (
    !isPlainObject(payload) ||
    typeof payload.sha !== "string" ||
    !SHA_PATTERN.test(payload.sha)
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
  return new URL(
    `${GITHUB_API_BASE_URL}/repos/${ULC_LINZ_M5_F_RETENTION_RUN_POLICY.repository}/commits/${ULC_LINZ_M5_F_RETENTION_RUN_POLICY.workflowRunBranch}`,
  );
}

function latestEvidenceRunsUrl() {
  const policy = ULC_LINZ_M5_F_RETENTION_RUN_POLICY;
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
  if (!Number.isSafeInteger(payload.total_count) || payload.total_count < 1) return null;
  if (!Array.isArray(payload.workflow_runs) || payload.workflow_runs.length !== 1) return null;
  return payload.workflow_runs[0];
}

function verifiedRunObservedAt(run, currentTime, trustedHeadSha) {
  const policy = ULC_LINZ_M5_F_RETENTION_RUN_POLICY;
  if (
    !isPlainObject(run) ||
    !Number.isSafeInteger(run.id) || run.id < 1 ||
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
    return null;
  }

  const createdAt = parseTimestamp(run.created_at);
  const observedAt = parseTimestamp(run.updated_at);
  if (createdAt === null || observedAt === null || createdAt > observedAt) return null;
  if (currentTime < observedAt || currentTime - observedAt >= policy.maxAgeMs) return null;
  return new Date(observedAt).toISOString();
}

function readCurrentTime(now) {
  try {
    const value = now();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
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

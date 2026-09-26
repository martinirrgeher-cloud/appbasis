import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { deriveUlcLinzD4PreviewAcceptanceEvidence } from "./factory-ui/ulc-linz-d4-preview-acceptance-evidence.mjs";
import { verifyUlcLinzProductionRuntimeEquivalence } from "./ulc-linz-m6-runtime-contract-equivalence.mjs";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;
const ACCEPTANCE_RECORD_PATH =
  "apps/ulc-linz/evidence/fc5-countdown-production-revalidation.json";
const ACCEPTED_HEAD_SHA = "bab8b18fd9e88025a6df0ccbffe8c51b972fe4b3";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const EMPTY_EVIDENCE = Object.freeze({});

export const ULC_LINZ_FC5_PRODUCTION_REVALIDATION_RUNS = Object.freeze({
  m5: Object.freeze({
    id: 36247785054,
    name: "M5 ULC Production Evidence",
    path: ".github/workflows/m5-ulc-production-evidence.yml",
  }),
  pilotIngress: Object.freeze({
    id: 36248019506,
    name: "M6 ULC Production Pilot Ingress",
    path: ".github/workflows/m6-ulc-production-pilot-ingress.yml",
  }),
  smokePrincipal: Object.freeze({
    id: 36248085829,
    name: "M6 ULC Production Smoke Principal Bootstrap",
    path: ".github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml",
  }),
  postDeploySmoke: Object.freeze({
    id: 36248243012,
    name: "M6 ULC Production Post-Deploy Smoke",
    path: ".github/workflows/m6-ulc-production-post-deploy-smoke.yml",
  }),
});

export async function deriveUlcLinzFc5ProductionRevalidationEvidence(
  repositoryRoot,
  definition,
  { fetchImpl = fetch } = {},
) {
  if (
    definition?.appId !== "ulc-linz" ||
    !Array.isArray(definition?.modules) ||
    !definition.modules.includes("countdown") ||
    typeof fetchImpl !== "function"
  ) {
    return EMPTY_EVIDENCE;
  }

  const record = await readAcceptanceRecord(repositoryRoot);
  if (!isExactAcceptanceRecord(record)) return EMPTY_EVIDENCE;

  const previewEvidence = await deriveUlcLinzD4PreviewAcceptanceEvidence(
    repositoryRoot,
    definition,
    { fetchImpl },
  );
  if (previewEvidence.previewAccepted !== true) return EMPTY_EVIDENCE;

  const firstMainSha = await fetchCurrentMainSha(fetchImpl);
  if (firstMainSha === null) return EMPTY_EVIDENCE;

  const expectedRuns = Object.values(ULC_LINZ_FC5_PRODUCTION_REVALIDATION_RUNS);
  const runs = await Promise.all(
    expectedRuns.map((expected) => fetchVerifiedRun(expected, fetchImpl)),
  );
  if (runs.some((run) => run === null) || !runsAreOrdered(runs)) {
    return EMPTY_EVIDENCE;
  }

  const confirmedMainSha = await fetchCurrentMainSha(fetchImpl);
  if (confirmedMainSha !== firstMainSha) return EMPTY_EVIDENCE;

  try {
    await verifyUlcLinzProductionRuntimeEquivalence(resolve(repositoryRoot), {
      deployedGithubSha: ACCEPTED_HEAD_SHA,
      currentGithubSha: firstMainSha,
      fetchImpl,
    });
  } catch {
    return EMPTY_EVIDENCE;
  }

  return deepFreeze({
    schemaVersion: 1,
    application: "ulc-linz",
    module: "countdown",
    environment: "production-pilot",
    acceptedHeadSha: ACCEPTED_HEAD_SHA,
    d4PreviewAccepted: true,
    m5ProductionEvidenceRevalidated: true,
    pilotIngressVerified: true,
    smokePrincipalVerified: true,
    postDeploySmokePassed: true,
    fc5ProductionRevalidated: true,
    finalProductionReleaseAuthorized: false,
  });
}

async function readAcceptanceRecord(repositoryRoot) {
  try {
    return JSON.parse(
      await readFile(
        join(resolve(repositoryRoot), ACCEPTANCE_RECORD_PATH),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

function isExactAcceptanceRecord(value) {
  const fields = [
    "schemaVersion",
    "application",
    "module",
    "environment",
    "acceptedHeadSha",
    "m5ProductionEvidenceRunId",
    "pilotIngressRunId",
    "smokePrincipalRunId",
    "postDeploySmokeRunId",
    "fc5ProductionRevalidated",
    "finalProductionReleaseAuthorized",
    "recordedAt",
  ];
  if (!isPlainObject(value) || Object.keys(value).length !== fields.length) {
    return false;
  }
  if (fields.some((field) => !Object.hasOwn(value, field))) return false;

  return (
    value.schemaVersion === 1 &&
    value.application === "ulc-linz" &&
    value.module === "countdown" &&
    value.environment === "production-pilot" &&
    value.acceptedHeadSha === ACCEPTED_HEAD_SHA &&
    value.m5ProductionEvidenceRunId ===
      ULC_LINZ_FC5_PRODUCTION_REVALIDATION_RUNS.m5.id &&
    value.pilotIngressRunId ===
      ULC_LINZ_FC5_PRODUCTION_REVALIDATION_RUNS.pilotIngress.id &&
    value.smokePrincipalRunId ===
      ULC_LINZ_FC5_PRODUCTION_REVALIDATION_RUNS.smokePrincipal.id &&
    value.postDeploySmokeRunId ===
      ULC_LINZ_FC5_PRODUCTION_REVALIDATION_RUNS.postDeploySmoke.id &&
    value.fc5ProductionRevalidated === true &&
    value.finalProductionReleaseAuthorized === false &&
    canonicalTimestamp(value.recordedAt)
  );
}

async function fetchCurrentMainSha(fetchImpl) {
  const payload = await githubJson(
    fetchImpl,
    `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPOSITORY}/branches/main`,
  );
  const sha = payload?.commit?.sha;
  return typeof sha === "string" && SHA_PATTERN.test(sha) ? sha : null;
}

async function fetchVerifiedRun(expected, fetchImpl) {
  const payload = await githubJson(
    fetchImpl,
    `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${expected.id}`,
  );
  if (
    !isPlainObject(payload) ||
    payload.id !== expected.id ||
    payload.run_attempt !== 1 ||
    payload.name !== expected.name ||
    payload.path !== expected.path ||
    payload.event !== "workflow_dispatch" ||
    payload.head_branch !== "main" ||
    payload.head_sha !== ACCEPTED_HEAD_SHA ||
    payload.status !== "completed" ||
    payload.conclusion !== "success" ||
    !canonicalTimestamp(payload.run_started_at) ||
    !canonicalTimestamp(payload.updated_at) ||
    Date.parse(payload.updated_at) < Date.parse(payload.run_started_at) ||
    !isPlainObject(payload.repository) ||
    payload.repository.full_name !== GITHUB_REPOSITORY
  ) {
    return null;
  }
  return Object.freeze({
    id: payload.id,
    startedAt: payload.run_started_at,
    completedAt: payload.updated_at,
  });
}

function runsAreOrdered(runs) {
  if (runs.length !== 4) return false;
  for (let index = 1; index < runs.length; index += 1) {
    if (
      Date.parse(runs[index].startedAt) <
      Date.parse(runs[index - 1].completedAt)
    ) {
      return false;
    }
  }
  return true;
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

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

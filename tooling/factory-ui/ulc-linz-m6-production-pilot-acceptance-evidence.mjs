import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { verifyUlcLinzProductionRuntimeEquivalence } from "../ulc-linz-m6-runtime-contract-equivalence.mjs";
import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;
const ACCEPTANCE_RECORD_PATH =
  "apps/ulc-linz/evidence/m6-production-pilot-acceptance.json";
const ACCEPTED_HEAD_SHA = "bab8b18fd9e88025a6df0ccbffe8c51b972fe4b3";
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS = Object.freeze({
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

const M6_PILOT_CRITERIA = Object.freeze([
  "productionDatabaseReady",
  "productionWorkerReady",
  "productionDomainReady",
  "productionUsersAndPermissionsReady",
  "backupRecoveryReady",
  "productionMigrationsApplied",
  "productionDeploymentCompleted",
  "postDeploySmokePassed",
]);

const EMPTY_ACCEPTANCE = Object.freeze({
  m5ProductionEvidence: Object.freeze({}),
  m6ProductionEvidence: Object.freeze({}),
});

export async function deriveUlcLinzM6ProductionPilotAcceptanceEvidence(
  repositoryRoot,
  definition,
  { fetchImpl = fetch } = {},
) {
  if (
    definition?.appId !== "ulc-linz" ||
    typeof fetchImpl !== "function"
  ) {
    return EMPTY_ACCEPTANCE;
  }

  const record = await readAcceptanceRecord(repositoryRoot);
  if (!isExactAcceptanceRecord(record)) return EMPTY_ACCEPTANCE;

  const firstMainSha = await fetchCurrentMainSha(fetchImpl);
  if (firstMainSha === null) return EMPTY_ACCEPTANCE;

  const runEntries = Object.values(ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS);
  const runs = await Promise.all(
    runEntries.map((expected) => fetchVerifiedRun(expected, fetchImpl)),
  );
  if (runs.some((run) => run === null)) return EMPTY_ACCEPTANCE;

  if (!runsAreOrdered(runs)) return EMPTY_ACCEPTANCE;

  const confirmedMainSha = await fetchCurrentMainSha(fetchImpl);
  if (confirmedMainSha !== firstMainSha) return EMPTY_ACCEPTANCE;

  try {
    await verifyUlcLinzProductionRuntimeEquivalence(resolve(repositoryRoot), {
      deployedGithubSha: ACCEPTED_HEAD_SHA,
      currentGithubSha: firstMainSha,
      fetchImpl,
    });
  } catch {
    return EMPTY_ACCEPTANCE;
  }

  const m5ProductionEvidence = Object.freeze(
    Object.fromEntries(
      REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => [id, true]),
    ),
  );
  const m6ProductionEvidence = Object.freeze(
    Object.fromEntries(M6_PILOT_CRITERIA.map((id) => [id, true])),
  );

  return Object.freeze({
    m5ProductionEvidence,
    m6ProductionEvidence,
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
    "environment",
    "acceptedHeadSha",
    "m5ProductionEvidenceRunId",
    "pilotIngressRunId",
    "smokePrincipalRunId",
    "postDeploySmokeRunId",
    "technicalPilotAccepted",
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
    value.environment === "production-pilot" &&
    value.acceptedHeadSha === ACCEPTED_HEAD_SHA &&
    value.m5ProductionEvidenceRunId ===
      ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS.m5.id &&
    value.pilotIngressRunId ===
      ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS.pilotIngress.id &&
    value.smokePrincipalRunId ===
      ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS.smokePrincipal.id &&
    value.postDeploySmokeRunId ===
      ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS.postDeploySmoke.id &&
    value.technicalPilotAccepted === true &&
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

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

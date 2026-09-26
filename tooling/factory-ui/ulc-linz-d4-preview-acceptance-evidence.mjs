import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;
const ACCEPTANCE_RECORD_PATH = "apps/ulc-linz/evidence/d4-preview-acceptance.json";
const ACCEPTED_APP_DEFINITION_DIGEST =
  "49104357da0d3b54d40c052d51bd6f16bd8807435309164117c2884d0e95e97d";
const ACCEPTED_CHECKS = Object.freeze([
  "login",
  "required-password-change",
  "countdown-sequence",
  "pause-resume",
  "reset",
]);

export const ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS = Object.freeze({
  deploy: Object.freeze({
    id: 36227898782,
    name: "ULC D4 Preview · deploy",
    path: ".github/workflows/ulc-linz-d4-preview.yml",
    attempt: 1,
    headSha: "4a876063e7af74d19433084ff3b5bff5d6f7d6fc",
    event: "workflow_dispatch",
    branch: "main",
  }),
  access: Object.freeze({
    id: 36231597187,
    name: "ULC D4 Preview Access Bootstrap",
    path: ".github/workflows/ulc-linz-d4-preview-access-bootstrap.yml",
    attempt: 1,
    headSha: "254851a44bd8a031b9a8857e5cd6f5a02e82b7f5",
    event: "workflow_dispatch",
    branch: "main",
  }),
});

export async function deriveUlcLinzD4PreviewAcceptanceEvidence(
  repositoryRoot,
  definition,
  { fetchImpl = fetch } = {},
) {
  if (
    definition?.appId !== "ulc-linz" ||
    appDefinitionDigest(definition) !== ACCEPTED_APP_DEFINITION_DIGEST
  ) {
    return Object.freeze({});
  }

  let record;
  try {
    record = JSON.parse(
      await readFile(join(resolve(repositoryRoot), ACCEPTANCE_RECORD_PATH), "utf8"),
    );
  } catch {
    return Object.freeze({});
  }
  if (!isExactAcceptanceRecord(record)) return Object.freeze({});

  const [deployVerified, accessVerified] = await Promise.all([
    verifyRun(ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS.deploy, fetchImpl),
    verifyRun(ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS.access, fetchImpl),
  ]);
  return Object.freeze(
    deployVerified && accessVerified ? { previewAccepted: true } : {},
  );
}

function isExactAcceptanceRecord(value) {
  const fields = [
    "schemaVersion",
    "application",
    "environment",
    "acceptedAppDefinitionDigest",
    "deployRunId",
    "accessRunId",
    "operatorConfirmed",
    "operatorConfirmedOn",
    "recordedAt",
    "checks",
  ];
  if (!isPlainObject(value) || Object.keys(value).length !== fields.length) return false;
  if (fields.some((field) => !Object.hasOwn(value, field))) return false;
  return (
    value.schemaVersion === 1 &&
    value.application === "ulc-linz" &&
    value.environment === "preview" &&
    value.acceptedAppDefinitionDigest === ACCEPTED_APP_DEFINITION_DIGEST &&
    value.deployRunId === ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS.deploy.id &&
    value.accessRunId === ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS.access.id &&
    value.operatorConfirmed === true &&
    value.operatorConfirmedOn === "2026-09-26" &&
    canonicalTimestamp(value.recordedAt) &&
    Array.isArray(value.checks) &&
    value.checks.length === ACCEPTED_CHECKS.length &&
    value.checks.every((entry, index) => entry === ACCEPTED_CHECKS[index])
  );
}

async function verifyRun(expected, fetchImpl) {
  if (typeof fetchImpl !== "function") return false;
  let response;
  try {
    response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${expected.id}`,
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
  return (
    isPlainObject(run) &&
    run.id === expected.id &&
    run.run_attempt === expected.attempt &&
    run.name === expected.name &&
    run.path === expected.path &&
    run.event === expected.event &&
    run.head_branch === expected.branch &&
    run.head_sha === expected.headSha &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    isPlainObject(run.repository) &&
    run.repository.full_name === GITHUB_REPOSITORY
  );
}

function appDefinitionDigest(definition) {
  return createHash("sha256").update(canonicalJson(definition)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

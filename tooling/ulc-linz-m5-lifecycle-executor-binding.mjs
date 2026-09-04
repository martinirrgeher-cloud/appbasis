import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const WORKFLOW_PATH = ".github/workflows/m5-ulc-protected-lifecycle-operations.yml";
const WORKFLOW_FILE_NAME = "m5-ulc-protected-lifecycle-operations.yml";
const WORKFLOW_NAME = "M5 ULC Protected Lifecycle Operations";
const EXECUTOR_PATH = "apps/ulc-linz/worker/protected-lifecycle-operations.ts";
const CREDENTIAL_ADAPTER_PATH =
  "apps/ulc-linz/worker/protected-lifecycle-credential-operation.ts";
const PUBLIC_ENTRYPOINT_PATH = "apps/ulc-linz/worker/index.ts";
const WORKFLOW_GIT_BLOB_SHA = "6a0c01ea788aaa2512cf672ac88a36faabc5155e";
const EXECUTOR_GIT_BLOB_SHA = "ba3e24784f52ccdfceda3cce5b694f912785ea2a";
const CREDENTIAL_ADAPTER_GIT_BLOB_SHA =
  "6f71345941deaf23a5c73770132b965e379176a5";
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const GITHUB_EVIDENCE_TIMEOUT_MS = 3000;
const MAX_PREFLIGHT_AGE_MS = 24 * 60 * 60 * 1000;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

const REQUIRED_WORKFLOW_ANCHORS = Object.freeze([
  "name: M5 ULC Protected Lifecycle Operations",
  "environment: m4-dr",
  "VERIFY-ULC-M5-LIFECYCLE-BINDING",
  "RUN-ULC-M5-PRODUCTION-RETENTION",
  "administrator_username:",
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_WRITE_TOKEN }}",
  "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD: ${{ secrets.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD }}",
  "--var \"ADMINISTRATOR_USERNAME:$ULC_LINZ_PRODUCTION_ADMIN_USERNAME\"",
  "--var \"ADMINISTRATOR_PASSWORD:$ULC_LINZ_PRODUCTION_ADMIN_PASSWORD\"",
  "runUlcLinzProtectedLifecycleWithAdministratorCredentials",
  "pnpm --dir apps/reference exec wrangler dev --remote",
  "x-appbasis-lifecycle-token",
  "x-appbasis-lifecycle-operation",
  "dev: { ip: '127.0.0.1', port: 8787 }",
  "transient technical administrator session that was removed before completion",
]);

const REQUIRED_EXECUTOR_ANCHORS = Object.freeze([
  'import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";',
  'import { createIdentityRuntime } from "@appbasis/identity/server";',
  'import { runUlcLinzRetention, type UlcLinzRetentionRunResult } from "./retention";',
  "administrativeSessionToken",
  "verifyAdministrativeSessionReadOnly(",
  'FROM "session" s',
  "WHERE s.token = $1",
  "expiresAt <= Date.now()",
  "decodeBase64Signature(cookie.signature)",
  "const standardBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(value);",
  "const base64Url = /^[A-Za-z0-9_-]+$/.test(value);",
  "globalThis.crypto.subtle.verify(",
  '["public.verification", ["SELECT", "UPDATE"]]',
  '["public.appbasis_permission_principal", ["SELECT", "UPDATE", "DELETE"]]',
  "identity: identityRuntime.service",
  "new PostgresIdentityDeletion(lifecycleClient)",
  "new PostgresIdentityDeletionRetention(",
  "new PostgresPermissionStore(lifecycleClient)",
  "new PostgresPrincipalAccessAdministration(",
  "new PostgresPrincipalLifecycleAdministration(",
  "new PostgresUlcLinzScopePersistence(lifecycleClient)",
  "verifyLifecycleDatabaseCapabilities(connection.client)",
  "pg_catalog.has_table_privilege",
  "pg_catalog.has_sequence_privilege",
  "return runUlcLinzRetention(dependencies);",
]);

const REQUIRED_CREDENTIAL_ADAPTER_ANCHORS = Object.freeze([
  'import { BetterAuthIdentityBackend } from "@appbasis/identity/server";',
  "runUlcLinzProtectedLifecycleWithAdministratorCredentials(",
  "backend.signInWithUsername({",
  "createUlcLinzProtectedLifecycleOperations({",
  "await lifecycle.verifyBinding();",
  "await lifecycle.runRetention();",
  "await backend.endSession(sessionToken);",
  "await backend.getSession(sessionToken)",
  "transient administrator session cleanup failed",
  "primaryError === null && cleanupError !== null",
]);

const FORBIDDEN_WORKFLOW_ANCHORS = Object.freeze([
  "ULC_LINZ_PRODUCTION_ADMIN_SESSION",
  "wrangler deploy",
  "workers_dev: true",
  "preview_urls: true",
  "routes:",
  "route:",
  "custom_domains:",
]);

export async function verifyUlcLinzM5LifecycleExecutorBinding(
  repositoryRoot,
  { fetchImpl = fetch, now = Date.now } = {},
) {
  const root = resolve(repositoryRoot);
  const [workflow, executor, credentialAdapter, publicEntrypoint] = await Promise.all([
    readFile(join(root, WORKFLOW_PATH), "utf8"),
    readFile(join(root, EXECUTOR_PATH), "utf8"),
    readFile(join(root, CREDENTIAL_ADAPTER_PATH), "utf8"),
    readFile(join(root, PUBLIC_ENTRYPOINT_PATH), "utf8"),
  ]);

  if (gitBlobSha(workflow) !== WORKFLOW_GIT_BLOB_SHA) {
    throw new Error("ULC protected lifecycle workflow baseline drifted.");
  }
  if (gitBlobSha(executor) !== EXECUTOR_GIT_BLOB_SHA) {
    throw new Error("ULC protected lifecycle executor baseline drifted.");
  }
  if (gitBlobSha(credentialAdapter) !== CREDENTIAL_ADAPTER_GIT_BLOB_SHA) {
    throw new Error("ULC protected lifecycle credential adapter baseline drifted.");
  }
  if (!REQUIRED_WORKFLOW_ANCHORS.every((anchor) => workflow.includes(anchor))) {
    throw new Error("ULC protected lifecycle workflow contract is incomplete.");
  }
  if (!REQUIRED_EXECUTOR_ANCHORS.every((anchor) => executor.includes(anchor))) {
    throw new Error("ULC protected lifecycle executor composition is incomplete.");
  }
  if (
    !REQUIRED_CREDENTIAL_ADAPTER_ANCHORS.every((anchor) =>
      credentialAdapter.includes(anchor),
    )
  ) {
    throw new Error(
      "ULC protected lifecycle credential adapter composition is incomplete.",
    );
  }
  if (FORBIDDEN_WORKFLOW_ANCHORS.some((anchor) => workflow.includes(anchor))) {
    throw new Error(
      "ULC protected lifecycle workflow exposes a forbidden deployment or credential surface.",
    );
  }
  if (
    publicEntrypoint.includes("protected-lifecycle-operations") ||
    publicEntrypoint.includes("protected-lifecycle-credential-operation") ||
    publicEntrypoint.includes("createUlcLinzProtectedLifecycleOperations") ||
    publicEntrypoint.includes(
      "runUlcLinzProtectedLifecycleWithAdministratorCredentials",
    )
  ) {
    throw new Error("ULC protected lifecycle executor leaked into the public app runtime.");
  }
  if (typeof fetchImpl !== "function" || typeof now !== "function") {
    throw new Error("ULC protected lifecycle live binding verifier is invalid.");
  }

  const currentTime = readCurrentTime(now);
  if (currentTime === null) {
    throw new Error("ULC protected lifecycle live binding clock is invalid.");
  }
  const currentMainHead = await fetchCurrentMainHeadSha(fetchImpl);
  if (currentMainHead === null) {
    throw new Error("ULC protected lifecycle current main head is unavailable.");
  }
  const payload = await fetchJson(fetchImpl, latestProtectedLifecycleRunsUrl());
  const run = latestRunFromPayload(payload);
  const observedAt = verifiedRunObservedAt(run, currentTime, currentMainHead);
  if (observedAt === null) {
    throw new Error("ULC protected lifecycle live binding preflight is not verified.");
  }

  return Object.freeze({
    executionBoundary: "protected-operations",
    deletionExecutorBound: true,
    retentionExecutorBound: true,
    verifiedHeadSha: currentMainHead,
    verifiedAt: observedAt,
  });
}

async function fetchCurrentMainHeadSha(fetchImpl) {
  const payload = await fetchJson(
    fetchImpl,
    new URL(`${GITHUB_API_BASE_URL}/repos/${GITHUB_REPOSITORY}/commits/main`),
  );
  if (
    !isPlainObject(payload) ||
    typeof payload.sha !== "string" ||
    !SHA_PATTERN.test(payload.sha)
  ) {
    return null;
  }
  return payload.sha;
}

function latestProtectedLifecycleRunsUrl() {
  const url = new URL(
    `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE_NAME}/runs`,
  );
  url.searchParams.set("branch", "main");
  url.searchParams.set("event", "workflow_dispatch");
  url.searchParams.set("per_page", "1");
  return url;
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

function latestRunFromPayload(payload) {
  if (!isPlainObject(payload)) return null;
  if (!Number.isSafeInteger(payload.total_count) || payload.total_count < 1) return null;
  if (!Array.isArray(payload.workflow_runs) || payload.workflow_runs.length !== 1) return null;
  return payload.workflow_runs[0];
}

function verifiedRunObservedAt(run, currentTime, trustedHeadSha) {
  if (
    !isPlainObject(run) ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    run.run_attempt !== 1 ||
    run.name !== WORKFLOW_NAME ||
    run.path !== WORKFLOW_PATH ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.head_sha !== trustedHeadSha ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !isPlainObject(run.repository) ||
    run.repository.full_name !== GITHUB_REPOSITORY
  ) {
    return null;
  }
  const createdAt = parseTimestamp(run.created_at);
  const updatedAt = parseTimestamp(run.updated_at);
  if (createdAt === null || updatedAt === null || createdAt > updatedAt) return null;
  if (currentTime < updatedAt || currentTime - updatedAt >= MAX_PREFLIGHT_AGE_MS) return null;
  return new Date(updatedAt).toISOString();
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

function gitBlobSha(content) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

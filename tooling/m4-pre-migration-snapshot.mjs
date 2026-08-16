import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const MIGRATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const UTC_RFC3339_SECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SNAPSHOT_PREFIX = "appbasis-pre-migration-";

export async function ensureM4PreMigrationSnapshot({
  projectId,
  branchId,
  apiKey,
  migrationId,
  expiresAt,
  apply = false,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const input = validateInputs({
    projectId,
    branchId,
    apiKey,
    migrationId,
    expiresAt,
    apply,
    fetchImpl,
    now,
  });
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
  };
  const branch = await neonGetJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}`,
    headers,
    "branch inspection",
  );
  requireRootBranch(branch, input);

  const existing = await findExactSnapshot({ input, headers });
  if (existing !== null) {
    return readyResult(existing, input, false);
  }

  if (!input.apply) {
    return Object.freeze({
      status: "snapshot-required",
      created: false,
      snapshotId: null,
      snapshotName: input.snapshotName,
      expiresAt: input.expiresAt,
    });
  }

  const createUrl = new URL(
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/snapshot`,
  );
  createUrl.searchParams.set("name", input.snapshotName);
  createUrl.searchParams.set("expires_at", input.expiresAt);

  let response;
  try {
    response = await input.fetchImpl(createUrl.toString(), {
      method: "POST",
      headers,
    });
  } catch {
    return reconcileUnknownCreate({ input, headers });
  }

  if (!(response instanceof Response)) {
    return reconcileUnknownCreate({ input, headers });
  }
  if (!response.ok) {
    const reconciled = await findExactSnapshot({ input, headers });
    if (reconciled !== null) return readyResult(reconciled, input, false);
    const status =
      Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? ` (status ${response.status})`
        : "";
    throw new Error(
      `Neon pre-migration snapshot create outcome is unconfirmed${status}; do not retry blindly.`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return reconcileUnknownCreate({ input, headers });
  }

  let createdIdentity;
  try {
    createdIdentity = requireCreatedSnapshotIdentity(payload?.snapshot, input);
  } catch {
    return reconcileUnknownCreate({ input, headers });
  }

  const confirmed = await findExactSnapshot({ input, headers });
  if (confirmed === null || confirmed.id !== createdIdentity.id) {
    throw new Error(
      "Neon pre-migration snapshot create succeeded but authoritative readback is not yet exact; do not create another snapshot.",
    );
  }

  return readyResult(confirmed, input, true);
}

function readyResult(snapshot, input, created) {
  return Object.freeze({
    status: "snapshot-ready",
    created,
    snapshotId: snapshot.id,
    snapshotName: input.snapshotName,
    expiresAt: input.expiresAt,
  });
}

async function reconcileUnknownCreate({ input, headers }) {
  const reconciled = await findExactSnapshot({ input, headers });
  if (reconciled !== null) return readyResult(reconciled, input, false);
  throw new Error(
    "Neon pre-migration snapshot create outcome is unknown; do not retry blindly. Re-run read-only preflight after provider state settles.",
  );
}

async function findExactSnapshot({ input, headers }) {
  const payload = await neonGetJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/snapshots`,
    headers,
    "snapshot listing",
  );
  if (!Array.isArray(payload?.snapshots)) {
    throw new Error("Neon snapshot listing returned an invalid payload.");
  }
  const sameName = payload.snapshots.filter(
    (snapshot) => snapshot?.name === input.snapshotName,
  );
  if (sameName.length === 0) return null;
  if (sameName.length !== 1) {
    throw new Error("Neon pre-migration snapshot state is ambiguous for the requested migration.");
  }
  return requireExactSnapshot(sameName[0], input, "existing snapshot");
}

function requireRootBranch(payload, input) {
  const branch = payload?.branch;
  if (
    !isRecord(branch) ||
    branch.id !== input.branchId ||
    branch.project_id !== input.projectId ||
    branch.current_state !== "ready"
  ) {
    throw new Error("Neon pre-migration snapshot branch is missing, mismatched, or not ready.");
  }
  if (branch.parent_id !== undefined && branch.parent_id !== null) {
    throw new Error("Neon pre-migration snapshots require the configured root branch.");
  }
}

function requireCreatedSnapshotIdentity(snapshot, input) {
  if (
    !isRecord(snapshot) ||
    typeof snapshot.id !== "string" ||
    !PROVIDER_ID_PATTERN.test(snapshot.id) ||
    snapshot.name !== input.snapshotName ||
    !isProviderTimestamp(snapshot.created_at)
  ) {
    throw new Error("Neon snapshot create response is invalid for the requested migration.");
  }
  return snapshot;
}

function requireExactSnapshot(snapshot, input, context) {
  if (
    !isRecord(snapshot) ||
    typeof snapshot.id !== "string" ||
    !PROVIDER_ID_PATTERN.test(snapshot.id) ||
    snapshot.name !== input.snapshotName ||
    snapshot.source_branch_id !== input.branchId ||
    snapshot.manual !== true ||
    !sameInstant(snapshot.expires_at, input.expiresAt)
  ) {
    throw new Error(`Neon ${context} does not match the M4 pre-migration snapshot contract.`);
  }
  return snapshot;
}

function validateInputs({
  projectId,
  branchId,
  apiKey,
  migrationId,
  expiresAt,
  apply,
  fetchImpl,
  now,
}) {
  const canonicalMigrationId = requiredMigrationId(migrationId);
  return Object.freeze({
    projectId: requiredProviderId(projectId, "NEON_PROJECT_ID"),
    branchId: requiredProviderId(branchId, "NEON_BRANCH_ID"),
    apiKey: requiredApiKey(apiKey),
    migrationId: canonicalMigrationId,
    snapshotName: `${SNAPSHOT_PREFIX}${canonicalMigrationId}`,
    expiresAt: requiredFutureTimestamp(expiresAt, now),
    apply: requiredBoolean(apply, "APPBASIS_APPLY_PRE_MIGRATION_SNAPSHOT"),
    fetchImpl: requiredFetch(fetchImpl),
  });
}

function requiredProviderId(value, name) {
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function requiredApiKey(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    value.trim() !== value ||
    /\s/u.test(value)
  ) {
    throw new Error("NEON_API_KEY is invalid.");
  }
  return value;
}

function requiredMigrationId(value) {
  if (typeof value !== "string" || !MIGRATION_ID_PATTERN.test(value)) {
    throw new Error("APPBASIS_M4_MIGRATION_ID is invalid.");
  }
  return value;
}

function requiredFutureTimestamp(value, now) {
  if (
    typeof value !== "string" ||
    !UTC_RFC3339_SECONDS_PATTERN.test(value) ||
    !Number.isFinite(now)
  ) {
    throw new Error("APPBASIS_M4_SNAPSHOT_EXPIRES_AT is invalid.");
  }
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().replace(".000Z", "Z") !== value ||
    timestamp <= now
  ) {
    throw new Error("APPBASIS_M4_SNAPSHOT_EXPIRES_AT is invalid.");
  }
  return value;
}

function requiredBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function requiredFetch(value) {
  if (typeof value !== "function") {
    throw new Error("fetchImpl must be a function.");
  }
  return value;
}

function sameInstant(left, right) {
  if (typeof left !== "string") return false;
  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);
  return Number.isFinite(leftTimestamp) && leftTimestamp === rightTimestamp;
}

function isProviderTimestamp(value) {
  if (typeof value !== "string") return false;
  return Number.isFinite(Date.parse(value));
}

async function neonGetJson(fetchImpl, url, headers, operation) {
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", headers });
  } catch {
    throw new Error(`Neon ${operation} API request failed.`);
  }
  if (!(response instanceof Response)) {
    throw new Error(`Neon ${operation} API returned an invalid response.`);
  }
  if (!response.ok) {
    const status =
      Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? ` (status ${response.status})`
        : "";
    throw new Error(`Neon ${operation} rejected the request${status}.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Neon ${operation} API returned invalid JSON.`);
  }
  if (!isRecord(payload)) {
    throw new Error(`Neon ${operation} API returned an invalid payload.`);
  }
  return payload;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] !== "ensure") {
      throw new Error("Expected command mode ensure.");
    }
    const applyValue = process.env.APPBASIS_APPLY_PRE_MIGRATION_SNAPSHOT;
    if (applyValue !== "0" && applyValue !== "1") {
      throw new Error("APPBASIS_APPLY_PRE_MIGRATION_SNAPSHOT is invalid.");
    }
    const result = await ensureM4PreMigrationSnapshot({
      projectId: process.env.NEON_PROJECT_ID,
      branchId: process.env.NEON_BRANCH_ID,
      apiKey: process.env.NEON_API_KEY,
      migrationId: process.env.APPBASIS_M4_MIGRATION_ID,
      expiresAt: process.env.APPBASIS_M4_SNAPSHOT_EXPIRES_AT,
      apply: applyValue === "1",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "M4 pre-migration snapshot check failed.",
    );
    process.exitCode = 1;
  }
}

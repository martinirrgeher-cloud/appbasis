import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const RESTORE_BRANCH_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SUCCESSFUL_OPERATION_STATES = new Set(["finished", "skipped"]);
const RESTORE_OPERATION_PAGE_LIMIT = 1000;
const RESTORE_OPERATION_MAX_PAGES = 10;

export async function ensureM4RestoreRehearsal({
  projectId,
  sourceBranchId,
  snapshotId,
  restoreBranchName,
  apiKey,
  apply = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const input = validateInputs({
    projectId,
    sourceBranchId,
    snapshotId,
    restoreBranchName,
    apiKey,
    apply,
    fetchImpl,
  });
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
  };

  const sourcePayload = await neonGetJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.sourceBranchId)}`,
    headers,
    "restore source branch inspection",
  );
  requireReadyRootBranch(sourcePayload, input);

  const snapshot = await readRestoreSnapshot({ input, headers });
  requireRestoreSnapshot(snapshot, input);

  const existing = await readExactRestoreBranch({ input, headers });
  if (existing !== null) {
    const operationSafety = await readRestoreOperationSafety({
      input,
      headers,
      branch: existing,
    });
    return restoreResult(existing, input, "not-needed", operationSafety);
  }

  if (!input.apply) {
    return Object.freeze({
      status: "restore-required",
      writeOutcome: "not-requested",
      snapshotId: input.snapshotId,
      sourceBranchId: input.sourceBranchId,
      restoreBranchName: input.restoreBranchName,
      finalizeRestore: false,
    });
  }

  const restoreUrl = `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/snapshots/${encodeURIComponent(input.snapshotId)}/restore`;
  let response;
  try {
    response = await input.fetchImpl(restoreUrl, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        name: input.restoreBranchName,
        target_branch_id: input.sourceBranchId,
        finalize_restore: false,
      }),
    });
  } catch {
    return reconcileUnknownRestore({ input, headers });
  }

  if (!(response instanceof Response)) {
    return reconcileUnknownRestore({ input, headers });
  }
  if (!response.ok) {
    const reconciled = await readExactRestoreBranch({ input, headers });
    if (reconciled !== null) {
      const operationSafety = await readRestoreOperationSafety({
        input,
        headers,
        branch: reconciled,
      });
      return restoreResult(reconciled, input, "reconciled", operationSafety);
    }
    const status =
      Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? ` (status ${response.status})`
        : "";
    throw new Error(
      `Neon restore rehearsal create outcome is unconfirmed${status}; do not retry blindly.`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return reconcileUnknownRestore({ input, headers });
  }

  let createdBranch;
  try {
    createdBranch = requireExactRestoredBranch(payload?.branch, input, "restore response");
  } catch {
    return reconcileUnknownRestore({ input, headers });
  }
  const operationSafety = classifyRestoreOperations(payload?.operations);

  const confirmed = await readExactRestoreBranch({ input, headers });
  if (confirmed === null || confirmed.id !== createdBranch.id) {
    throw new Error(
      "Neon restore rehearsal create succeeded but authoritative readback is not yet exact; do not create another restore branch.",
    );
  }
  return restoreResult(confirmed, input, "confirmed", operationSafety);
}

async function reconcileUnknownRestore({ input, headers }) {
  const reconciled = await readExactRestoreBranch({ input, headers });
  if (reconciled !== null) {
    const operationSafety = await readRestoreOperationSafety({
      input,
      headers,
      branch: reconciled,
    });
    return restoreResult(reconciled, input, "reconciled", operationSafety);
  }
  throw new Error(
    "Neon restore rehearsal create outcome is unknown; do not retry blindly. Re-run read-only preflight after provider state settles.",
  );
}

function restoreResult(
  branch,
  input,
  writeOutcome,
  operationSafety = Object.freeze({ state: "unknown", verificationReady: false }),
) {
  const branchReady = branch.current_state === "ready";
  return Object.freeze({
    status: branchReady ? "restore-preview-ready" : "restore-preview-pending",
    writeOutcome,
    snapshotId: input.snapshotId,
    sourceBranchId: input.sourceBranchId,
    restoreBranchId: branch.id,
    restoreBranchName: input.restoreBranchName,
    restoreBranchState: branch.current_state,
    restoreOperationsState: operationSafety.state,
    verificationReady: branchReady && operationSafety.verificationReady,
    finalizeRestore: false,
  });
}

async function readRestoreOperationSafety({ input, headers, branch }) {
  const matchingOperations = [];
  const seenCursors = new Set();
  let cursor;

  for (let page = 0; page < RESTORE_OPERATION_MAX_PAGES; page += 1) {
    const url = new URL(
      `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/operations`,
    );
    url.searchParams.set("limit", String(RESTORE_OPERATION_PAGE_LIMIT));
    if (cursor !== undefined) {
      url.searchParams.set("cursor", cursor);
    }

    let payload;
    try {
      payload = await neonGetJson(
        input.fetchImpl,
        url.toString(),
        headers,
        "restore operations inspection",
      );
    } catch {
      return Object.freeze({ state: "unknown", verificationReady: false });
    }
    if (!Array.isArray(payload?.operations)) {
      throw new Error("Neon restore operations inspection returned an invalid payload.");
    }

    for (const operation of payload.operations) {
      if (!isRecord(operation)) {
        throw new Error("Neon restore operations inspection returned an invalid operation.");
      }
      if (operation.branch_id !== branch.id) continue;
      if (operation.project_id !== input.projectId) {
        throw new Error("Neon restore operation does not match the M4 restore rehearsal project.");
      }
      matchingOperations.push(operation);
    }

    const pageIsShort = payload.operations.length < RESTORE_OPERATION_PAGE_LIMIT;
    if (payload.pagination === undefined || payload.pagination === null) {
      if (pageIsShort) {
        return classifyRestoreOperations(matchingOperations);
      }
      throw new Error(
        "Neon restore operations inspection omitted pagination for a full page.",
      );
    }
    if (!isRecord(payload.pagination)) {
      throw new Error("Neon restore operations inspection returned invalid pagination.");
    }

    const hasCursor = Object.hasOwn(payload.pagination, "cursor");
    const nextCursor = payload.pagination.cursor;
    if (
      !hasCursor ||
      nextCursor === null ||
      nextCursor === undefined ||
      nextCursor === ""
    ) {
      if (pageIsShort) {
        return classifyRestoreOperations(matchingOperations);
      }
      throw new Error("Neon restore operations inspection returned an invalid cursor.");
    }
    if (
      typeof nextCursor !== "string" ||
      nextCursor.length > 2048 ||
      nextCursor.trim() !== nextCursor ||
      seenCursors.has(nextCursor)
    ) {
      throw new Error("Neon restore operations inspection returned an invalid cursor.");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error(
    "Neon restore operations inspection exceeded the safe pagination limit; verification remains blocked.",
  );
}

function classifyRestoreOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return Object.freeze({ state: "unknown", verificationReady: false });
  }

  let hasUnknown = false;
  let hasPending = false;
  for (const operation of operations) {
    if (!isRecord(operation) || typeof operation.status !== "string") {
      hasUnknown = true;
      continue;
    }
    if (!SUCCESSFUL_OPERATION_STATES.has(operation.status)) {
      hasPending = true;
    }
  }

  if (hasUnknown) {
    return Object.freeze({ state: "unknown", verificationReady: false });
  }
  if (hasPending) {
    return Object.freeze({ state: "pending", verificationReady: false });
  }
  return Object.freeze({ state: "complete", verificationReady: true });
}

async function readRestoreSnapshot({ input, headers }) {
  const payload = await neonGetJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/snapshots`,
    headers,
    "restore snapshot inspection",
  );
  if (!Array.isArray(payload?.snapshots)) {
    throw new Error("Neon restore snapshot inspection returned an invalid payload.");
  }
  const matches = payload.snapshots.filter((snapshot) => snapshot?.id === input.snapshotId);
  if (matches.length !== 1) {
    throw new Error("Neon restore snapshot is missing or ambiguous.");
  }
  return matches[0];
}

function requireRestoreSnapshot(snapshot, input) {
  if (
    !isRecord(snapshot) ||
    snapshot.id !== input.snapshotId ||
    snapshot.source_branch_id !== input.sourceBranchId ||
    typeof snapshot.name !== "string" ||
    snapshot.name.length === 0 ||
    !isProviderTimestamp(snapshot.created_at)
  ) {
    throw new Error("Neon restore snapshot does not match the configured M4 source branch.");
  }
}

async function readExactRestoreBranch({ input, headers }) {
  const url = new URL(`${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches`);
  url.searchParams.set("search", input.restoreBranchName);
  url.searchParams.set("limit", "10000");
  const payload = await neonGetJson(
    input.fetchImpl,
    url.toString(),
    headers,
    "restore branch inspection",
  );
  if (!Array.isArray(payload?.branches)) {
    throw new Error("Neon restore branch inspection returned an invalid payload.");
  }
  const exact = payload.branches.filter((branch) => branch?.name === input.restoreBranchName);
  if (exact.length === 0) return null;
  if (exact.length !== 1) {
    throw new Error("Neon restore branch state is ambiguous for the requested rehearsal.");
  }
  return requireExactRestoredBranch(exact[0], input, "existing restore branch");
}

function requireExactRestoredBranch(branch, input, context) {
  if (
    !isRecord(branch) ||
    typeof branch.id !== "string" ||
    !PROVIDER_ID_PATTERN.test(branch.id) ||
    branch.id === input.sourceBranchId ||
    branch.project_id !== input.projectId ||
    branch.name !== input.restoreBranchName ||
    branch.restored_from !== input.snapshotId ||
    typeof branch.current_state !== "string" ||
    branch.current_state.length === 0
  ) {
    throw new Error(`Neon ${context} does not match the M4 restore rehearsal contract.`);
  }
  return branch;
}

function requireReadyRootBranch(payload, input) {
  const branch = payload?.branch;
  if (
    !isRecord(branch) ||
    branch.id !== input.sourceBranchId ||
    branch.project_id !== input.projectId ||
    branch.current_state !== "ready"
  ) {
    throw new Error("Neon restore source branch is missing, mismatched, or not ready.");
  }
  if (branch.parent_id !== undefined && branch.parent_id !== null) {
    throw new Error("M4 restore rehearsal requires the configured root source branch.");
  }
}

function validateInputs({
  projectId,
  sourceBranchId,
  snapshotId,
  restoreBranchName,
  apiKey,
  apply,
  fetchImpl,
}) {
  return Object.freeze({
    projectId: requiredProviderId(projectId, "NEON_PROJECT_ID"),
    sourceBranchId: requiredProviderId(sourceBranchId, "NEON_BRANCH_ID"),
    snapshotId: requiredProviderId(snapshotId, "APPBASIS_M4_RESTORE_SNAPSHOT_ID"),
    restoreBranchName: requiredRestoreBranchName(restoreBranchName),
    apiKey: requiredApiKey(apiKey),
    apply: requiredBoolean(apply, "APPBASIS_APPLY_RESTORE_REHEARSAL"),
    fetchImpl: requiredFetch(fetchImpl),
  });
}

function requiredProviderId(value, name) {
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function requiredRestoreBranchName(value) {
  if (typeof value !== "string" || !RESTORE_BRANCH_NAME_PATTERN.test(value)) {
    throw new Error("APPBASIS_M4_RESTORE_BRANCH_NAME is invalid.");
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
    const applyValue = process.env.APPBASIS_APPLY_RESTORE_REHEARSAL;
    if (applyValue !== "0" && applyValue !== "1") {
      throw new Error("APPBASIS_APPLY_RESTORE_REHEARSAL is invalid.");
    }
    const result = await ensureM4RestoreRehearsal({
      projectId: process.env.NEON_PROJECT_ID,
      sourceBranchId: process.env.NEON_BRANCH_ID,
      snapshotId: process.env.APPBASIS_M4_RESTORE_SNAPSHOT_ID,
      restoreBranchName: process.env.APPBASIS_M4_RESTORE_BRANCH_NAME,
      apiKey: process.env.NEON_API_KEY,
      apply: applyValue === "1",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "M4 restore rehearsal check failed.",
    );
    process.exitCode = 1;
  }
}

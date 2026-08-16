import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const ALLOWED_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);
const MIN_RETENTION_SECONDS = 3_600;
const MAX_RETENTION_SECONDS = 3_024_000;

export async function ensureM4NeonBackupSchedule({
  projectId,
  branchId,
  apiKey,
  requiredFrequency,
  retentionSeconds,
  apply = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const input = validateInputs({
    projectId,
    branchId,
    apiKey,
    requiredFrequency,
    retentionSeconds,
    apply,
    fetchImpl,
  });
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
  };

  const branch = await neonGetJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}`,
    headers,
    "backup schedule branch inspection",
  );
  requireReadyRootBranch(branch, input);

  const current = await readSchedule({ input, headers });
  if (scheduleMatches(current, input)) {
    return readyResult(input, "not-needed");
  }

  if (!input.apply) {
    return Object.freeze({
      status: "schedule-update-required",
      writeOutcome: "not-requested",
      frequency: input.requiredFrequency,
      retentionSeconds: input.retentionSeconds,
    });
  }

  const url = `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/backup_schedule`;
  let response;
  try {
    response = await input.fetchImpl(url, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        schedule: [
          {
            frequency: input.requiredFrequency,
            retention_seconds: input.retentionSeconds,
          },
        ],
      }),
    });
  } catch {
    return reconcileUnknownWrite({ input, headers });
  }

  if (!(response instanceof Response)) {
    return reconcileUnknownWrite({ input, headers });
  }
  if (!response.ok) {
    const reconciled = await readSchedule({ input, headers });
    if (scheduleMatches(reconciled, input)) {
      return readyResult(input, "reconciled");
    }
    const status =
      Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? ` (status ${response.status})`
        : "";
    throw new Error(
      `Neon backup schedule update is unconfirmed${status}; do not retry blindly.`,
    );
  }

  const confirmed = await readSchedule({ input, headers });
  if (!scheduleMatches(confirmed, input)) {
    throw new Error(
      "Neon backup schedule update returned success but authoritative readback is not exact; do not write again automatically.",
    );
  }
  return readyResult(input, "confirmed");
}

async function reconcileUnknownWrite({ input, headers }) {
  const reconciled = await readSchedule({ input, headers });
  if (scheduleMatches(reconciled, input)) {
    return readyResult(input, "reconciled");
  }
  throw new Error(
    "Neon backup schedule update outcome is unknown; do not retry blindly. Re-run read-only preflight after provider state settles.",
  );
}

function readyResult(input, writeOutcome) {
  return Object.freeze({
    status: "schedule-ready",
    writeOutcome,
    frequency: input.requiredFrequency,
    retentionSeconds: input.retentionSeconds,
  });
}

async function readSchedule({ input, headers }) {
  const payload = await neonGetJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/backup_schedule`,
    headers,
    "backup schedule inspection",
  );
  if (!Array.isArray(payload?.schedule)) {
    throw new Error("Neon backup schedule inspection returned an invalid payload.");
  }
  return payload.schedule;
}

function scheduleMatches(schedule, input) {
  if (!Array.isArray(schedule) || schedule.length !== 1) return false;
  const entry = schedule[0];
  return (
    isRecord(entry) &&
    entry.frequency === input.requiredFrequency &&
    Number.isInteger(entry.retention_seconds) &&
    entry.retention_seconds === input.retentionSeconds
  );
}

function requireReadyRootBranch(payload, input) {
  const branch = payload?.branch;
  if (
    !isRecord(branch) ||
    branch.id !== input.branchId ||
    branch.project_id !== input.projectId ||
    branch.current_state !== "ready"
  ) {
    throw new Error("Neon backup schedule branch is missing, mismatched, or not ready.");
  }
  if (branch.parent_id !== undefined && branch.parent_id !== null) {
    throw new Error("M4 scheduled snapshots require the configured root branch.");
  }
}

function validateInputs({
  projectId,
  branchId,
  apiKey,
  requiredFrequency,
  retentionSeconds,
  apply,
  fetchImpl,
}) {
  return Object.freeze({
    projectId: requiredProviderId(projectId, "NEON_PROJECT_ID"),
    branchId: requiredProviderId(branchId, "NEON_BRANCH_ID"),
    apiKey: requiredApiKey(apiKey),
    requiredFrequency: requiredFrequencyValue(requiredFrequency),
    retentionSeconds: requiredInteger(
      retentionSeconds,
      "APPBASIS_MIN_SNAPSHOT_RETENTION_SECONDS",
      MIN_RETENTION_SECONDS,
      MAX_RETENTION_SECONDS,
    ),
    apply: requiredBoolean(apply, "APPBASIS_APPLY_BACKUP_SCHEDULE"),
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

function requiredFrequencyValue(value) {
  if (typeof value !== "string" || !ALLOWED_FREQUENCIES.has(value)) {
    throw new Error("APPBASIS_REQUIRED_BACKUP_FREQUENCY is invalid.");
  }
  return value;
}

function requiredInteger(value, name, min, max) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} is invalid.`);
  }
  return number;
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
    const applyValue = process.env.APPBASIS_APPLY_BACKUP_SCHEDULE;
    if (applyValue !== "0" && applyValue !== "1") {
      throw new Error("APPBASIS_APPLY_BACKUP_SCHEDULE is invalid.");
    }
    const result = await ensureM4NeonBackupSchedule({
      projectId: process.env.NEON_PROJECT_ID,
      branchId: process.env.NEON_BRANCH_ID,
      apiKey: process.env.NEON_API_KEY,
      requiredFrequency: process.env.APPBASIS_REQUIRED_BACKUP_FREQUENCY,
      retentionSeconds: process.env.APPBASIS_MIN_SNAPSHOT_RETENTION_SECONDS,
      apply: applyValue === "1",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "M4 Neon backup schedule check failed.",
    );
    process.exitCode = 1;
  }
}

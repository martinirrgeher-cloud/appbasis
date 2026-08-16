import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const ALLOWED_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);
const MIN_SNAPSHOT_RETENTION_SECONDS = 3600;
const MAX_SNAPSHOT_RETENTION_SECONDS = 3_024_000;
const MIN_SCHEDULE_HOUR = 0;
const MAX_SCHEDULE_HOUR = 23;

export async function inspectM4NeonBackupReadiness({
  projectId,
  branchId,
  apiKey,
  minRestoreWindowSeconds,
  requiredFrequency,
  minSnapshotRetentionSeconds,
  fetchImpl = globalThis.fetch,
} = {}) {
  const input = validateInputs({
    projectId,
    branchId,
    apiKey,
    minRestoreWindowSeconds,
    requiredFrequency,
    minSnapshotRetentionSeconds,
    fetchImpl,
  });

  const headers = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
  };
  const project = await neonJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}`,
    { method: "GET", headers },
    "project inspection",
  );
  const schedule = await neonJson(
    input.fetchImpl,
    `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/backup_schedule`,
    { method: "GET", headers },
    "backup schedule inspection",
  );

  const restoreWindowSeconds = project?.project?.history_retention_seconds;
  if (!Number.isInteger(restoreWindowSeconds) || restoreWindowSeconds < 0) {
    throw new Error("Neon project restore history is missing or invalid.");
  }
  if (restoreWindowSeconds < input.minRestoreWindowSeconds) {
    throw new Error("Neon project restore history does not meet the M4 policy.");
  }

  if (!Array.isArray(schedule?.schedule) || schedule.schedule.length === 0) {
    throw new Error("Neon scheduled backup configuration is missing or invalid.");
  }

  const acceptableEntry = schedule.schedule.find(
    (entry) =>
      isValidProviderScheduleEntry(entry) &&
      entry.frequency === input.requiredFrequency &&
      entry.retention_seconds >= input.minSnapshotRetentionSeconds,
  );
  if (!acceptableEntry) {
    throw new Error("Neon scheduled backup configuration does not meet the M4 policy.");
  }

  return Object.freeze({
    restoreWindowSeconds,
    matchedFrequency: input.requiredFrequency,
    snapshotRetentionSeconds: acceptableEntry.retention_seconds,
  });
}

function isValidProviderScheduleEntry(entry) {
  if (
    !isRecord(entry) ||
    !ALLOWED_FREQUENCIES.has(entry.frequency) ||
    !Number.isInteger(entry.retention_seconds) ||
    entry.retention_seconds < MIN_SNAPSHOT_RETENTION_SECONDS ||
    entry.retention_seconds > MAX_SNAPSHOT_RETENTION_SECONDS ||
    !Number.isInteger(entry.hour) ||
    entry.hour < MIN_SCHEDULE_HOUR ||
    entry.hour > MAX_SCHEDULE_HOUR
  ) {
    return false;
  }
  if (entry.frequency === "daily") {
    return entry.day === undefined || entry.day === null;
  }
  if (!Number.isInteger(entry.day)) return false;
  if (entry.frequency === "weekly") return entry.day >= 1 && entry.day <= 7;
  return entry.day >= 1 && entry.day <= 31;
}

function validateInputs({
  projectId,
  branchId,
  apiKey,
  minRestoreWindowSeconds,
  requiredFrequency,
  minSnapshotRetentionSeconds,
  fetchImpl,
}) {
  return Object.freeze({
    projectId: requiredProviderId(projectId, "NEON_PROJECT_ID"),
    branchId: requiredProviderId(branchId, "NEON_BRANCH_ID"),
    apiKey: requiredApiKey(apiKey),
    minRestoreWindowSeconds: requiredInteger(
      minRestoreWindowSeconds,
      "APPBASIS_MIN_RESTORE_WINDOW_SECONDS",
      3600,
      Number.MAX_SAFE_INTEGER,
    ),
    requiredFrequency: requiredFrequencyValue(requiredFrequency),
    minSnapshotRetentionSeconds: requiredInteger(
      minSnapshotRetentionSeconds,
      "APPBASIS_MIN_SNAPSHOT_RETENTION_SECONDS",
      MIN_SNAPSHOT_RETENTION_SECONDS,
      MAX_SNAPSHOT_RETENTION_SECONDS,
    ),
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

function requiredInteger(value, name, min, max) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} is invalid.`);
  }
  return number;
}

function requiredFrequencyValue(value) {
  if (typeof value !== "string" || !ALLOWED_FREQUENCIES.has(value)) {
    throw new Error("APPBASIS_REQUIRED_BACKUP_FREQUENCY is invalid.");
  }
  return value;
}

function requiredFetch(value) {
  if (typeof value !== "function") {
    throw new Error("fetchImpl must be a function.");
  }
  return value;
}

async function neonJson(fetchImpl, url, options, operation) {
  if (options?.method !== "GET") {
    throw new Error("M4 Neon backup readiness must remain read-only.");
  }

  let response;
  try {
    response = await fetchImpl(url, options);
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
    if (process.argv[2] !== "check") {
      throw new Error("Expected command mode check.");
    }
    const result = await inspectM4NeonBackupReadiness({
      projectId: process.env.NEON_PROJECT_ID,
      branchId: process.env.NEON_BRANCH_ID,
      apiKey: process.env.NEON_API_KEY,
      minRestoreWindowSeconds: process.env.APPBASIS_MIN_RESTORE_WINDOW_SECONDS,
      requiredFrequency: process.env.APPBASIS_REQUIRED_BACKUP_FREQUENCY,
      minSnapshotRetentionSeconds:
        process.env.APPBASIS_MIN_SNAPSHOT_RETENTION_SECONDS,
    });
    process.stdout.write(
      `${JSON.stringify({ status: "ready", ...result })}\n`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "M4 Neon backup readiness check failed.",
    );
    process.exitCode = 1;
  }
}

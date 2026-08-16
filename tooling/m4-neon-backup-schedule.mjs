import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const ALLOWED_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);
const MIN_RETENTION_SECONDS = 3_600;
const MAX_RETENTION_SECONDS = 3_024_000;
const MIN_SCHEDULE_HOUR = 0;
const MAX_SCHEDULE_HOUR = 23;
const CANONICAL_NONNEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/u;

export async function ensureM4NeonBackupSchedule({
  projectId,
  branchId,
  apiKey,
  requiredFrequency,
  retentionSeconds,
  scheduleHour,
  scheduleDay,
  apply = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const input = validateInputs({
    projectId,
    branchId,
    apiKey,
    requiredFrequency,
    retentionSeconds,
    scheduleHour,
    scheduleDay,
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
  const currentPolicyEntry = matchingPolicyEntry(current, input);
  if (currentPolicyEntry !== null) {
    return readyResult(input, currentPolicyEntry, "not-needed");
  }

  if (current.length > 1) {
    throw new Error(
      "Neon backup schedule has multiple entries without an M4 policy match; automatic replacement is refused.",
    );
  }
  if (current.length === 1) {
    validateReplaceableSingleEntry(current[0]);
  }

  if (!input.apply) {
    return Object.freeze({
      status: "schedule-update-required",
      writeOutcome: "not-requested",
      frequency: input.requiredFrequency,
      minimumRetentionSeconds: input.minRetentionSeconds,
    });
  }

  const desiredRetentionSeconds =
    current.length === 1
      ? Math.max(current[0].retention_seconds, input.minRetentionSeconds)
      : input.minRetentionSeconds;
  const desiredEntry = desiredScheduleEntry(input, desiredRetentionSeconds);
  const url = `${NEON_API_BASE}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/backup_schedule`;
  let response;
  try {
    response = await input.fetchImpl(url, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ schedule: [desiredEntry] }),
    });
  } catch {
    return reconcileUnknownWrite({ input, headers });
  }

  if (!(response instanceof Response)) {
    return reconcileUnknownWrite({ input, headers });
  }
  if (!response.ok) {
    const reconciled = await readSchedule({ input, headers });
    const reconciledPolicyEntry = matchingPolicyEntry(reconciled, input);
    if (reconciledPolicyEntry !== null) {
      return readyResult(input, reconciledPolicyEntry, "reconciled");
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
  const confirmedPolicyEntry = matchingPolicyEntry(confirmed, input);
  if (confirmedPolicyEntry === null) {
    throw new Error(
      "Neon backup schedule update returned success but authoritative readback does not meet the M4 policy; do not write again automatically.",
    );
  }
  return readyResult(input, confirmedPolicyEntry, "confirmed");
}

async function reconcileUnknownWrite({ input, headers }) {
  const reconciled = await readSchedule({ input, headers });
  const reconciledPolicyEntry = matchingPolicyEntry(reconciled, input);
  if (reconciledPolicyEntry !== null) {
    return readyResult(input, reconciledPolicyEntry, "reconciled");
  }
  throw new Error(
    "Neon backup schedule update outcome is unknown; do not retry blindly. Re-run read-only preflight after provider state settles.",
  );
}

function readyResult(input, policyEntry, writeOutcome) {
  return Object.freeze({
    status: "schedule-ready",
    writeOutcome,
    frequency: input.requiredFrequency,
    minimumRetentionSeconds: input.minRetentionSeconds,
    configuredRetentionSeconds: policyEntry.retention_seconds,
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

function matchingPolicyEntry(schedule, input) {
  return (
    schedule.find(
      (entry) =>
        isValidProviderScheduleEntry(entry) &&
        entry.frequency === input.requiredFrequency &&
        entry.retention_seconds >= input.minRetentionSeconds,
    ) ?? null
  );
}

function validateReplaceableSingleEntry(entry) {
  if (!isValidProviderScheduleEntry(entry)) {
    throw new Error(
      "Neon backup schedule contains an invalid entry; automatic replacement is refused.",
    );
  }
}

function isValidProviderScheduleEntry(entry) {
  if (
    !isRecord(entry) ||
    !ALLOWED_FREQUENCIES.has(entry.frequency) ||
    !Number.isInteger(entry.retention_seconds) ||
    entry.retention_seconds < MIN_RETENTION_SECONDS ||
    entry.retention_seconds > MAX_RETENTION_SECONDS ||
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

function desiredScheduleEntry(input, retentionSeconds) {
  const entry = {
    frequency: input.requiredFrequency,
    retention_seconds: retentionSeconds,
    hour: input.scheduleHour,
  };
  if (input.scheduleDay !== null) entry.day = input.scheduleDay;
  return entry;
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
  scheduleHour,
  scheduleDay,
  apply,
  fetchImpl,
}) {
  const frequency = requiredFrequencyValue(requiredFrequency);
  return Object.freeze({
    projectId: requiredProviderId(projectId, "NEON_PROJECT_ID"),
    branchId: requiredProviderId(branchId, "NEON_BRANCH_ID"),
    apiKey: requiredApiKey(apiKey),
    requiredFrequency: frequency,
    minRetentionSeconds: requiredInteger(
      retentionSeconds,
      "APPBASIS_MIN_SNAPSHOT_RETENTION_SECONDS",
      MIN_RETENTION_SECONDS,
      MAX_RETENTION_SECONDS,
    ),
    scheduleHour: requiredInteger(
      scheduleHour,
      "APPBASIS_BACKUP_SCHEDULE_HOUR",
      MIN_SCHEDULE_HOUR,
      MAX_SCHEDULE_HOUR,
    ),
    scheduleDay: requiredScheduleDay(scheduleDay, frequency),
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

function requiredScheduleDay(value, frequency) {
  if (frequency === "daily") {
    if (value === undefined || value === null || value === "") return null;
    throw new Error("APPBASIS_BACKUP_SCHEDULE_DAY must be empty for daily backups.");
  }
  const max = frequency === "weekly" ? 7 : 31;
  return requiredInteger(value, "APPBASIS_BACKUP_SCHEDULE_DAY", 1, max);
}

function requiredInteger(value, name, min, max) {
  let number;
  if (typeof value === "number") {
    number = value;
  } else if (
    typeof value === "string" &&
    CANONICAL_NONNEGATIVE_INTEGER_PATTERN.test(value)
  ) {
    number = Number(value);
  } else {
    throw new Error(`${name} is invalid.`);
  }
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
      scheduleHour: process.env.APPBASIS_BACKUP_SCHEDULE_HOUR,
      scheduleDay: process.env.APPBASIS_BACKUP_SCHEDULE_DAY,
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

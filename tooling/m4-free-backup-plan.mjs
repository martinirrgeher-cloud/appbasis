import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP_ID = "m3-preview";
const PREFIX = `appbasis/${APP_ID}/m4`;
const DAILY_PREFIX = `${PREFIX}/daily/`;
const WEEKLY_PREFIX = `${PREFIX}/weekly/`;
const DAY_MS = 86_400_000;
const BACKUP_KINDS = new Set(["daily", "pre-migration"]);
const JURISDICTIONS = new Set(["default", "eu"]);
const DAILY_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(DAILY_PREFIX)}(\\d{4}-\\d{2}-\\d{2})\\.tar\\.aesgcm$`,
);
const WEEKLY_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(WEEKLY_PREFIX)}(\\d{4}-\\d{2}-\\d{2})\\.tar\\.aesgcm$`,
);

export function buildM4FreeBackupPlan({
  kind,
  changeId = "",
  now = new Date(),
} = {}) {
  if (!BACKUP_KINDS.has(kind)) {
    throw new Error("M4 free backup kind must be daily or pre-migration.");
  }
  requiredDate(now, "M4 free backup timestamp");

  const createdAt = now.toISOString();
  const backupDate = createdAt.slice(0, 10);

  if (kind === "pre-migration") {
    const canonicalChangeId = requiredChangeId(changeId);
    return Object.freeze({
      schemaVersion: 1,
      appId: APP_ID,
      kind,
      createdAt,
      backupDate,
      changeId: canonicalChangeId,
      primaryKey: `${PREFIX}/pre-migration/${canonicalChangeId}.tar.aesgcm`,
      secondaryKey: null,
    });
  }

  if (changeId !== "") {
    throw new Error("M4 daily backup must not carry a change id.");
  }

  return Object.freeze({
    schemaVersion: 1,
    appId: APP_ID,
    kind,
    createdAt,
    backupDate,
    changeId: null,
    primaryKey: `${DAILY_PREFIX}${backupDate}.tar.aesgcm`,
    secondaryKey: now.getUTCDay() === 0
      ? `${WEEKLY_PREFIX}${backupDate}.tar.aesgcm`
      : null,
  });
}

export function selectExpiredM4BackupKeys({ keys, now = new Date() } = {}) {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
    throw new Error("M4 backup retention inventory is invalid.");
  }
  requiredDate(now, "M4 backup retention timestamp");

  const seen = new Set();
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const oldestDailyToKeep = new Date(today.getTime() - 6 * DAY_MS);
  const latestSunday = new Date(today.getTime() - today.getUTCDay() * DAY_MS);
  const oldestWeeklyToKeep = new Date(latestSunday.getTime() - 21 * DAY_MS);
  const expired = [];

  for (const key of keys) {
    if (seen.has(key)) {
      throw new Error("M4 backup retention inventory contains duplicate keys.");
    }
    seen.add(key);

    const dailyMatch = DAILY_KEY_PATTERN.exec(key);
    if (dailyMatch) {
      const keyDate = requiredCanonicalUtcDate(dailyMatch[1], "M4 daily backup key");
      if (keyDate.getTime() > today.getTime()) {
        throw new Error("M4 daily backup key is future-dated.");
      }
      if (keyDate.getTime() < oldestDailyToKeep.getTime()) {
        expired.push(key);
      }
      continue;
    }

    const weeklyMatch = WEEKLY_KEY_PATTERN.exec(key);
    if (weeklyMatch) {
      const keyDate = requiredCanonicalUtcDate(weeklyMatch[1], "M4 weekly backup key");
      if (keyDate.getUTCDay() !== 0) {
        throw new Error("M4 weekly backup key is not a Sunday.");
      }
      if (keyDate.getTime() > latestSunday.getTime()) {
        throw new Error("M4 weekly backup key is future-dated.");
      }
      if (keyDate.getTime() < oldestWeeklyToKeep.getTime()) {
        expired.push(key);
      }
      continue;
    }

    throw new Error("M4 backup retention inventory contains an unmanaged key.");
  }

  return Object.freeze(expired.sort());
}

export function buildM4R2Endpoint({ accountId, jurisdiction } = {}) {
  if (typeof accountId !== "string" || !/^[0-9a-f]{32}$/.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is invalid.");
  }
  if (!JURISDICTIONS.has(jurisdiction)) {
    throw new Error("APPBASIS_M4_R2_JURISDICTION must be default or eu.");
  }
  const suffix = jurisdiction === "eu" ? ".eu" : "";
  return `https://${accountId}${suffix}.r2.cloudflarestorage.com`;
}

export function validateM4R2BucketName(value) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
  ) {
    throw new Error("APPBASIS_M4_R2_BUCKET is invalid.");
  }
  return value;
}

function requiredChangeId(value) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 80 ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(value)
  ) {
    throw new Error("M4 pre-migration change id is invalid.");
  }
  return value;
}

function requiredDate(value, name) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function requiredCanonicalUtcDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is invalid.`);
  }
  return date;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readStdinJson() {
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  if (value.length === 0 || value.trim() !== value) {
    throw new Error("M4 backup retention inventory input is invalid.");
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("M4 backup retention inventory input is invalid.");
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] === "plan") {
      const result = buildM4FreeBackupPlan({
        kind: process.argv[3],
        changeId: process.argv[4] ?? "",
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else if (process.argv[2] === "prune") {
      const now = new Date(process.argv[3] ?? "");
      const keys = await readStdinJson();
      process.stdout.write(
        `${JSON.stringify(selectExpiredM4BackupKeys({ keys, now }))}\n`,
      );
    } else if (process.argv[2] === "endpoint") {
      process.stdout.write(
        `${buildM4R2Endpoint({
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
          jurisdiction: process.env.APPBASIS_M4_R2_JURISDICTION,
        })}\n`,
      );
    } else if (process.argv[2] === "bucket") {
      process.stdout.write(
        `${validateM4R2BucketName(process.env.APPBASIS_M4_R2_BUCKET)}\n`,
      );
    } else {
      throw new Error("Expected command mode plan, prune, endpoint or bucket.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "M4 free backup plan failed.");
    process.exitCode = 1;
  }
}

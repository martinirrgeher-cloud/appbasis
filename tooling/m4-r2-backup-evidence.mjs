import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { selectExpiredM4BackupKeys } from "./m4-free-backup-plan.mjs";

const APP_ID = "m3-preview";
const PREFIX = `appbasis/${APP_ID}/m4`;
const DAILY_PREFIX = `${PREFIX}/daily/`;
const WEEKLY_PREFIX = `${PREFIX}/weekly/`;
const DAILY_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(DAILY_PREFIX)}(\\d{4}-\\d{2}-\\d{2})\\.tar\\.aesgcm$`,
);
const WEEKLY_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(WEEKLY_PREFIX)}(\\d{4}-\\d{2}-\\d{2})\\.tar\\.aesgcm$`,
);

export function evaluateM4R2BackupEvidence({ objects, now = new Date() } = {}) {
  requiredDate(now, "M4 R2 evidence timestamp");
  if (!Array.isArray(objects)) {
    throw new Error("M4 R2 backup inventory is invalid.");
  }

  const normalized = objects.map((object) => normalizeInventoryObject(object, now));
  const keys = normalized.map((object) => object.key);
  const expiredKeys = selectExpiredM4BackupKeys({ keys, now });
  const dailyKeys = keys.filter((key) => DAILY_KEY_PATTERN.test(key)).sort();
  const weeklyKeys = keys.filter((key) => WEEKLY_KEY_PATTERN.test(key)).sort();
  const today = now.toISOString().slice(0, 10);
  const expectedDailyKey = `${DAILY_PREFIX}${today}.tar.aesgcm`;
  const latestDailyKey = dailyKeys.at(-1) ?? null;
  const reasons = [];

  if (dailyKeys.length === 0) {
    reasons.push("daily-backup-missing");
  } else if (latestDailyKey !== expectedDailyKey) {
    reasons.push("daily-backup-stale");
  }
  if (expiredKeys.length > 0) {
    reasons.push("retention-expired-objects");
  }
  if (dailyKeys.length > 7 || weeklyKeys.length > 4) {
    reasons.push("retention-object-count-exceeded");
  }

  return Object.freeze({
    schemaVersion: 1,
    appId: APP_ID,
    checkedAt: now.toISOString(),
    ok: reasons.length === 0,
    expectedDailyKey,
    latestDailyKey,
    dailyCount: dailyKeys.length,
    weeklyCount: weeklyKeys.length,
    expiredKeys: Object.freeze([...expiredKeys]),
    reasons: Object.freeze(reasons),
  });
}

function normalizeInventoryObject(value, now) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("M4 R2 backup inventory object is invalid.");
  }
  const { Key, LastModified, Size } = value;
  if (typeof Key !== "string" || Key.length === 0) {
    throw new Error("M4 R2 backup inventory key is invalid.");
  }
  if (!DAILY_KEY_PATTERN.test(Key) && !WEEKLY_KEY_PATTERN.test(Key)) {
    throw new Error("M4 R2 backup inventory contains an unmanaged key.");
  }
  if (!Number.isSafeInteger(Size) || Size <= 0) {
    throw new Error("M4 R2 backup inventory size is invalid.");
  }
  if (typeof LastModified !== "string" || LastModified.length === 0) {
    throw new Error("M4 R2 backup inventory LastModified is invalid.");
  }
  const modifiedAt = new Date(LastModified);
  if (Number.isNaN(modifiedAt.getTime()) || modifiedAt.getTime() > now.getTime()) {
    throw new Error("M4 R2 backup inventory LastModified is invalid.");
  }
  return Object.freeze({ key: Key, size: Size, modifiedAt: modifiedAt.toISOString() });
}

function requiredDate(value, name) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readStdinJson() {
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  if (value.length === 0 || value.trim() !== value) {
    throw new Error("M4 R2 backup inventory input is invalid.");
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("M4 R2 backup inventory input is invalid.");
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] !== "evaluate") {
      throw new Error("Expected command mode evaluate.");
    }
    const objects = await readStdinJson();
    const now = new Date(process.argv[3] ?? "");
    const evidence = evaluateM4R2BackupEvidence({ objects, now });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    if (!evidence.ok) process.exitCode = 1;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "M4 R2 backup evidence failed.",
    );
    process.exitCode = 1;
  }
}

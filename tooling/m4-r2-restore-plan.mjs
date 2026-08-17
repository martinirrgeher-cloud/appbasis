import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseM4RestoreFingerprint,
  requiredM3PreviewDatabaseUrl,
} from "./m4-restore-verification.mjs";

const APP_ID = "m3-preview";
const PREFIX = `appbasis/${APP_ID}/m4`;
const CHANGE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const DAILY_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(`${PREFIX}/daily/`)}(\\d{4}-\\d{2}-\\d{2})\\.tar\\.aesgcm$`,
);
const WEEKLY_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(`${PREFIX}/weekly/`)}(\\d{4}-\\d{2}-\\d{2})\\.tar\\.aesgcm$`,
);
const PRE_MIGRATION_KEY_PATTERN = new RegExp(
  `^${escapeRegExp(`${PREFIX}/pre-migration/`)}([a-z0-9][a-z0-9._-]{2,79})\\.tar\\.aesgcm$`,
);
const OBJECT_METADATA_KEYS = Object.freeze([
  "appbasisapp",
  "appbasiskind",
  "createdat",
  "objectkeysha256",
  "sha256",
]);
const MANIFEST_KEYS = Object.freeze([
  "appId",
  "changeId",
  "createdAt",
  "dumpFile",
  "fingerprintFile",
  "kind",
  "schemaVersion",
  "sourceGitSha",
]);

export function parseM4R2RestoreKey(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("APPBASIS_M4_R2_RESTORE_KEY is invalid.");
  }

  const daily = DAILY_KEY_PATTERN.exec(value);
  if (daily) {
    const backupDate = canonicalUtcDate(daily[1], "M4 daily restore key");
    return Object.freeze({
      appId: APP_ID,
      key: value,
      objectKind: "daily",
      manifestKind: "daily",
      backupDate,
      changeId: null,
    });
  }

  const weekly = WEEKLY_KEY_PATTERN.exec(value);
  if (weekly) {
    const backupDate = canonicalUtcDate(weekly[1], "M4 weekly restore key");
    const date = new Date(`${backupDate}T00:00:00.000Z`);
    if (date.getUTCDay() !== 0) {
      throw new Error("M4 weekly restore key is not a Sunday.");
    }
    return Object.freeze({
      appId: APP_ID,
      key: value,
      objectKind: "weekly",
      manifestKind: "daily",
      backupDate,
      changeId: null,
    });
  }

  const preMigration = PRE_MIGRATION_KEY_PATTERN.exec(value);
  if (preMigration) {
    const changeId = preMigration[1];
    if (!CHANGE_ID_PATTERN.test(changeId)) {
      throw new Error("M4 pre-migration restore key is invalid.");
    }
    return Object.freeze({
      appId: APP_ID,
      key: value,
      objectKind: "pre-migration",
      manifestKind: "pre-migration",
      backupDate: null,
      changeId,
    });
  }

  throw new Error("APPBASIS_M4_R2_RESTORE_KEY is unmanaged.");
}

export function validateM4R2RestoreObjectHead({ key, head } = {}) {
  const selection = parseM4R2RestoreKey(key);
  if (!isRecord(head)) {
    throw new Error("M4 R2 restore object metadata is invalid.");
  }
  if (!Number.isSafeInteger(head.ContentLength) || head.ContentLength <= 0) {
    throw new Error("M4 R2 restore object size is invalid.");
  }
  if (!isRecord(head.Metadata)) {
    throw new Error("M4 R2 restore object metadata is invalid.");
  }
  requireExactKeys(head.Metadata, OBJECT_METADATA_KEYS, "M4 R2 restore object metadata");

  const metadata = head.Metadata;
  const createdAt = canonicalTimestamp(metadata.createdat, "M4 R2 restore object createdAt");
  const keySha256 = createHash("sha256").update(key).digest("hex");

  if (metadata.appbasisapp !== APP_ID) {
    throw new Error("M4 R2 restore object app binding is invalid.");
  }
  if (metadata.appbasiskind !== selection.objectKind) {
    throw new Error("M4 R2 restore object kind binding is invalid.");
  }
  if (metadata.objectkeysha256 !== keySha256) {
    throw new Error("M4 R2 restore object key binding is invalid.");
  }
  if (typeof metadata.sha256 !== "string" || !SHA256_PATTERN.test(metadata.sha256)) {
    throw new Error("M4 R2 restore object digest is invalid.");
  }
  if (selection.backupDate !== null && createdAt.slice(0, 10) !== selection.backupDate) {
    throw new Error("M4 R2 restore object date binding is invalid.");
  }

  return Object.freeze({
    ...selection,
    contentLength: head.ContentLength,
    ciphertextSha256: metadata.sha256,
    createdAt,
    objectKeySha256: keySha256,
  });
}

export function validateM4R2RestoreManifest({ key, objectCreatedAt, manifest } = {}) {
  const selection = parseM4R2RestoreKey(key);
  if (!isRecord(manifest)) {
    throw new Error("M4 R2 restore manifest is invalid.");
  }
  requireExactKeys(manifest, MANIFEST_KEYS, "M4 R2 restore manifest");
  const createdAt = canonicalTimestamp(manifest.createdAt, "M4 R2 restore manifest createdAt");
  const expectedCreatedAt = canonicalTimestamp(
    objectCreatedAt,
    "M4 R2 restore object createdAt",
  );

  if (
    manifest.schemaVersion !== 1 ||
    manifest.appId !== APP_ID ||
    manifest.kind !== selection.manifestKind ||
    manifest.dumpFile !== "database.pgdump" ||
    manifest.fingerprintFile !== "fingerprint.json" ||
    typeof manifest.sourceGitSha !== "string" ||
    !GIT_SHA_PATTERN.test(manifest.sourceGitSha)
  ) {
    throw new Error("M4 R2 restore manifest binding is invalid.");
  }
  if (createdAt !== expectedCreatedAt) {
    throw new Error("M4 R2 restore manifest timestamp does not match object metadata.");
  }
  if (selection.backupDate !== null && createdAt.slice(0, 10) !== selection.backupDate) {
    throw new Error("M4 R2 restore manifest date binding is invalid.");
  }
  if (selection.changeId === null) {
    if (manifest.changeId !== null) {
      throw new Error("M4 R2 restore manifest changeId is invalid.");
    }
  } else if (manifest.changeId !== selection.changeId) {
    throw new Error("M4 R2 restore manifest changeId binding is invalid.");
  }

  return Object.freeze({
    schemaVersion: 1,
    appId: APP_ID,
    key,
    objectKind: selection.objectKind,
    manifestKind: selection.manifestKind,
    createdAt,
    sourceGitSha: manifest.sourceGitSha,
    changeId: manifest.changeId,
    dumpFile: manifest.dumpFile,
    fingerprintFile: manifest.fingerprintFile,
  });
}

export function validateM4RestoreDatabaseSeparation({ sourceUrl, restoreUrl } = {}) {
  requiredM3PreviewDatabaseUrl(sourceUrl, "APPBASIS_M4_SOURCE_DATABASE_URL");
  requiredM3PreviewDatabaseUrl(restoreUrl, "APPBASIS_M4_RESTORE_DATABASE_URL");

  const source = databaseIdentity(sourceUrl);
  const restore = databaseIdentity(restoreUrl);
  if (source === restore) {
    throw new Error("M4 restore target must be a different database endpoint from source.");
  }
  return Object.freeze({ status: "restore-target-separated", appId: APP_ID });
}

export function normalizeM4RestoreFingerprintInput(value) {
  if (typeof value !== "string") {
    throw new Error("M4 restore fingerprint input is invalid.");
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("M4 restore fingerprint input is invalid.");
  }
  return parseM4RestoreFingerprint(normalized);
}

function databaseIdentity(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const port = url.port === "" ? "5432" : url.port;
  return `${hostname}:${port}${url.pathname}`;
}

function canonicalUtcDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function canonicalTimestamp(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is invalid.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function requireExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${name} has an invalid shape.`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readStdinText() {
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

async function readStdinJson(name) {
  const text = (await readStdinText()).trim();
  if (text.length === 0) throw new Error(`${name} input is invalid.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} input is invalid.`);
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = process.argv[2];
    if (mode === "key") {
      process.stdout.write(`${JSON.stringify(parseM4R2RestoreKey(process.argv[3]))}\n`);
    } else if (mode === "head") {
      const head = await readStdinJson("M4 R2 restore head");
      process.stdout.write(
        `${JSON.stringify(validateM4R2RestoreObjectHead({ key: process.argv[3], head }))}\n`,
      );
    } else if (mode === "manifest") {
      const manifest = await readStdinJson("M4 R2 restore manifest");
      process.stdout.write(
        `${JSON.stringify(validateM4R2RestoreManifest({
          key: process.argv[3],
          objectCreatedAt: process.argv[4],
          manifest,
        }))}\n`,
      );
    } else if (mode === "databases") {
      process.stdout.write(
        `${JSON.stringify(validateM4RestoreDatabaseSeparation({
          sourceUrl: process.env.APPBASIS_M4_SOURCE_DATABASE_URL,
          restoreUrl: process.env.APPBASIS_M4_RESTORE_DATABASE_URL,
        }))}\n`,
      );
    } else if (mode === "fingerprint") {
      process.stdout.write(
        `${JSON.stringify(normalizeM4RestoreFingerprintInput(await readStdinText()))}\n`,
      );
    } else {
      throw new Error("Expected command mode key, head, manifest, databases or fingerprint.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "M4 R2 restore plan failed.");
    process.exitCode = 1;
  }
}

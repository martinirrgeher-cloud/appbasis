import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  normalizeM4RestoreFingerprintInput,
  parseM4R2RestoreKey,
  validateM4R2RestoreManifest,
  validateM4R2RestoreObjectHead,
  validateM4RestoreDatabaseSeparation,
} from "./m4-r2-restore-plan.mjs";

const dailyKey = "appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm";
const weeklyKey = "appbasis/m3-preview/m4/weekly/2026-08-16.tar.aesgcm";
const preMigrationKey =
  "appbasis/m3-preview/m4/pre-migration/permissions-v4-cutover.tar.aesgcm";
const createdAt = "2026-08-17T02:17:00.000Z";
const sourceGitSha = "a".repeat(40);
const fingerprintGroups = [
  "identity_users",
  "identity_accounts",
  "identity_sessions",
  "identity_verifications",
  "identity_persons",
  "identity_security_state",
  "identity_operations",
  "permission_capabilities",
  "permission_roles",
  "permission_role_capabilities",
  "permission_principals",
  "permission_principal_roles",
  "permission_principal_grants",
  "permission_principal_revokes",
  "permission_audit",
  "tasks",
];
const validFingerprint = Object.fromEntries(
  fingerprintGroups.flatMap((group, index) => [
    [`${group}_count`, String(index + 1)],
    [`${group}_digest`, (index % 2 === 0 ? "a" : "b").repeat(32)],
  ]),
);

function headFor(key, kind, timestamp = createdAt) {
  return {
    ContentLength: 4096,
    Metadata: {
      appbasisapp: "m3-preview",
      appbasiskind: kind,
      createdat: timestamp,
      objectkeysha256: createHash("sha256").update(key).digest("hex"),
      sha256: "c".repeat(64),
    },
  };
}

function manifestFor({ kind = "daily", changeId = null, timestamp = createdAt } = {}) {
  return {
    schemaVersion: 1,
    appId: "m3-preview",
    kind,
    createdAt: timestamp,
    sourceGitSha,
    changeId,
    dumpFile: "database.pgdump",
    fingerprintFile: "fingerprint.json",
  };
}

test("accepts only canonical daily, weekly and immutable pre-migration restore keys", () => {
  assert.deepEqual(parseM4R2RestoreKey(dailyKey), {
    appId: "m3-preview",
    key: dailyKey,
    objectKind: "daily",
    manifestKind: "daily",
    backupDate: "2026-08-17",
    changeId: null,
  });
  assert.equal(parseM4R2RestoreKey(weeklyKey).objectKind, "weekly");
  assert.deepEqual(parseM4R2RestoreKey(preMigrationKey), {
    appId: "m3-preview",
    key: preMigrationKey,
    objectKind: "pre-migration",
    manifestKind: "pre-migration",
    backupDate: null,
    changeId: "permissions-v4-cutover",
  });

  for (const key of [
    "appbasis/m3-preview/m4/weekly/2026-08-17.tar.aesgcm",
    "appbasis/m3-preview/m4/pre-migration/../escape.tar.aesgcm",
    "appbasis/other/m4/daily/2026-08-17.tar.aesgcm",
    "/absolute.tar.aesgcm",
  ]) {
    assert.throws(() => parseM4R2RestoreKey(key), /restore key|unmanaged/);
  }
});

test("binds R2 head metadata to exact app, kind, key digest, ciphertext digest and date", () => {
  const result = validateM4R2RestoreObjectHead({
    key: dailyKey,
    head: headFor(dailyKey, "daily"),
  });
  assert.equal(result.contentLength, 4096);
  assert.equal(result.ciphertextSha256, "c".repeat(64));
  assert.equal(result.createdAt, createdAt);

  assert.throws(
    () => validateM4R2RestoreObjectHead({
      key: dailyKey,
      head: { ...headFor(dailyKey, "daily"), Metadata: { ...headFor(dailyKey, "daily").Metadata, appbasisapp: "other" } },
    }),
    /app binding/,
  );
  assert.throws(
    () => validateM4R2RestoreObjectHead({
      key: dailyKey,
      head: { ...headFor(dailyKey, "daily"), Metadata: { ...headFor(dailyKey, "daily").Metadata, objectkeysha256: "d".repeat(64) } },
    }),
    /key binding/,
  );
  assert.throws(
    () => validateM4R2RestoreObjectHead({
      key: dailyKey,
      head: { ...headFor(dailyKey, "daily"), Metadata: { ...headFor(dailyKey, "daily").Metadata, unexpected: "value" } },
    }),
    /invalid shape/,
  );
});

test("binds extracted manifest to the selected R2 object", () => {
  assert.equal(
    validateM4R2RestoreManifest({
      key: dailyKey,
      objectCreatedAt: createdAt,
      manifest: manifestFor(),
    }).sourceGitSha,
    sourceGitSha,
  );
  assert.equal(
    validateM4R2RestoreManifest({
      key: weeklyKey,
      objectCreatedAt: "2026-08-16T02:17:00.000Z",
      manifest: manifestFor({ timestamp: "2026-08-16T02:17:00.000Z" }),
    }).objectKind,
    "weekly",
  );
  assert.equal(
    validateM4R2RestoreManifest({
      key: preMigrationKey,
      objectCreatedAt: createdAt,
      manifest: manifestFor({
        kind: "pre-migration",
        changeId: "permissions-v4-cutover",
      }),
    }).changeId,
    "permissions-v4-cutover",
  );

  assert.throws(
    () => validateM4R2RestoreManifest({
      key: dailyKey,
      objectCreatedAt: createdAt,
      manifest: manifestFor({ changeId: "unexpected" }),
    }),
    /changeId/,
  );
  assert.throws(
    () => validateM4R2RestoreManifest({
      key: dailyKey,
      objectCreatedAt: createdAt,
      manifest: { ...manifestFor(), dumpFile: "../database.pgdump" },
    }),
    /manifest binding/,
  );
});

test("requires restore target to be a different dedicated m3-preview database endpoint", () => {
  const sourceUrl =
    "postgresql://source:secret@source.example.test/appbasis_m3_preview?sslmode=require";
  const restoreUrl =
    "postgresql://restore:secret@restore.example.test/appbasis_m3_preview?sslmode=require";
  assert.deepEqual(validateM4RestoreDatabaseSeparation({ sourceUrl, restoreUrl }), {
    status: "restore-target-separated",
    appId: "m3-preview",
  });

  assert.throws(
    () => validateM4RestoreDatabaseSeparation({
      sourceUrl,
      restoreUrl:
        "postgresql://other:other@source.example.test:5432/appbasis_m3_preview?sslmode=require",
    }),
    /different database endpoint/,
  );
  assert.throws(
    () => validateM4RestoreDatabaseSeparation({
      sourceUrl,
      restoreUrl: "postgresql://restore:secret@restore.example.test/other_database",
    }),
    /dedicated m3-preview database/,
  );
});

test("normalizes newline-terminated stored fingerprint through the canonical parser", () => {
  assert.deepEqual(
    normalizeM4RestoreFingerprintInput(`${JSON.stringify(validFingerprint)}\n`),
    validFingerprint,
  );
  assert.throws(
    () => normalizeM4RestoreFingerprintInput("{}\n"),
    /EXPECTED_RESTORE_FINGERPRINT is invalid/,
  );
});

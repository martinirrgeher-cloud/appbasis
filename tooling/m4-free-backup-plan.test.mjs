import assert from "node:assert/strict";
import test from "node:test";

import {
  buildM4FreeBackupPlan,
  buildM4R2Endpoint,
  selectExpiredM4BackupKeys,
  validateM4R2BucketName,
} from "./m4-free-backup-plan.mjs";

test("plans daily and Sunday weekly immutable backup keys", () => {
  const sunday = new Date("2026-08-16T02:17:00.000Z");
  const plan = buildM4FreeBackupPlan({ kind: "daily", now: sunday });

  assert.deepEqual(plan, {
    schemaVersion: 1,
    appId: "m3-preview",
    kind: "daily",
    createdAt: "2026-08-16T02:17:00.000Z",
    backupDate: "2026-08-16",
    changeId: null,
    primaryKey: "appbasis/m3-preview/m4/daily/2026-08-16.tar.aesgcm",
    secondaryKey: "appbasis/m3-preview/m4/weekly/2026-08-16.tar.aesgcm",
  });
});

test("does not create a weekly copy on non-Sundays", () => {
  const monday = new Date("2026-08-17T02:17:00.000Z");
  const plan = buildM4FreeBackupPlan({ kind: "daily", now: monday });
  assert.equal(plan.secondaryKey, null);
});

test("uses an immutable pre-migration key and requires a canonical change id", () => {
  const plan = buildM4FreeBackupPlan({
    kind: "pre-migration",
    changeId: "20260816-permission-cutover",
    now: new Date("2026-08-16T19:30:00.000Z"),
  });
  assert.equal(
    plan.primaryKey,
    "appbasis/m3-preview/m4/pre-migration/20260816-permission-cutover.tar.aesgcm",
  );
  assert.equal(plan.secondaryKey, null);
  assert.equal(plan.changeId, "20260816-permission-cutover");

  assert.throws(
    () => buildM4FreeBackupPlan({ kind: "pre-migration", changeId: "bad id" }),
    /change id is invalid/,
  );
});

test("different pre-migration change ids can never target the same object", () => {
  const first = buildM4FreeBackupPlan({
    kind: "pre-migration",
    changeId: "20260816-permission-cutover",
  });
  const second = buildM4FreeBackupPlan({
    kind: "pre-migration",
    changeId: "20260817-task-schema",
  });
  assert.notEqual(first.primaryKey, second.primaryKey);
});

test("prunes every stale daily key after missed workflow days", () => {
  const expired = selectExpiredM4BackupKeys({
    now: new Date("2026-08-16T22:00:00.000Z"),
    keys: [
      "appbasis/m3-preview/m4/daily/2026-08-01.tar.aesgcm",
      "appbasis/m3-preview/m4/daily/2026-08-08.tar.aesgcm",
      "appbasis/m3-preview/m4/daily/2026-08-09.tar.aesgcm",
      "appbasis/m3-preview/m4/daily/2026-08-10.tar.aesgcm",
      "appbasis/m3-preview/m4/daily/2026-08-16.tar.aesgcm",
    ],
  });

  assert.deepEqual(expired, [
    "appbasis/m3-preview/m4/daily/2026-08-01.tar.aesgcm",
    "appbasis/m3-preview/m4/daily/2026-08-08.tar.aesgcm",
    "appbasis/m3-preview/m4/daily/2026-08-09.tar.aesgcm",
  ]);
});

test("keeps the four most recent Sunday slots and prunes all older weekly keys", () => {
  const expired = selectExpiredM4BackupKeys({
    now: new Date("2026-08-19T10:00:00.000Z"),
    keys: [
      "appbasis/m3-preview/m4/weekly/2026-07-12.tar.aesgcm",
      "appbasis/m3-preview/m4/weekly/2026-07-19.tar.aesgcm",
      "appbasis/m3-preview/m4/weekly/2026-07-26.tar.aesgcm",
      "appbasis/m3-preview/m4/weekly/2026-08-02.tar.aesgcm",
      "appbasis/m3-preview/m4/weekly/2026-08-09.tar.aesgcm",
      "appbasis/m3-preview/m4/weekly/2026-08-16.tar.aesgcm",
    ],
  });

  assert.deepEqual(expired, [
    "appbasis/m3-preview/m4/weekly/2026-07-12.tar.aesgcm",
    "appbasis/m3-preview/m4/weekly/2026-07-19.tar.aesgcm",
  ]);
});

test("retention fails closed on malformed, duplicate, future or non-Sunday managed keys", () => {
  const now = new Date("2026-08-19T10:00:00.000Z");
  const invalidInventories = [
    ["appbasis/m3-preview/m4/daily/not-a-date.tar.aesgcm"],
    ["appbasis/m3-preview/m4/daily/2026-08-20.tar.aesgcm"],
    ["appbasis/m3-preview/m4/weekly/2026-08-17.tar.aesgcm"],
    ["appbasis/m3-preview/m4/pre-migration/change.tar.aesgcm"],
    [
      "appbasis/m3-preview/m4/daily/2026-08-19.tar.aesgcm",
      "appbasis/m3-preview/m4/daily/2026-08-19.tar.aesgcm",
    ],
  ];

  for (const keys of invalidInventories) {
    assert.throws(
      () => selectExpiredM4BackupKeys({ keys, now }),
      /M4 .*backup|retention inventory/,
    );
  }
});

test("fails closed on non-canonical backup inputs", () => {
  assert.throws(() => buildM4FreeBackupPlan({ kind: "hourly" }), /daily or pre-migration/);
  assert.throws(
    () => buildM4FreeBackupPlan({ kind: "daily", changeId: "unexpected" }),
    /must not carry a change id/,
  );
  assert.throws(
    () => buildM4FreeBackupPlan({ kind: "daily", now: new Date("invalid") }),
    /timestamp is invalid/,
  );
  assert.throws(
    () => selectExpiredM4BackupKeys({ keys: "not-an-array" }),
    /retention inventory is invalid/,
  );
});

test("builds only canonical default and EU R2 S3 endpoints", () => {
  const accountId = "0123456789abcdef0123456789abcdef";
  assert.equal(
    buildM4R2Endpoint({ accountId, jurisdiction: "default" }),
    `https://${accountId}.r2.cloudflarestorage.com`,
  );
  assert.equal(
    buildM4R2Endpoint({ accountId, jurisdiction: "eu" }),
    `https://${accountId}.eu.r2.cloudflarestorage.com`,
  );
  assert.throws(
    () => buildM4R2Endpoint({ accountId: "bad", jurisdiction: "eu" }),
    /CLOUDFLARE_ACCOUNT_ID is invalid/,
  );
  assert.throws(
    () => buildM4R2Endpoint({ accountId, jurisdiction: "auto" }),
    /must be default or eu/,
  );
});

test("accepts only conservative R2 bucket names", () => {
  assert.equal(validateM4R2BucketName("appbasis-m4-backups"), "appbasis-m4-backups");
  for (const value of ["AB", "Uppercase", "-bad", "bad-", "bad.bucket", "a".repeat(64)]) {
    assert.throws(() => validateM4R2BucketName(value), /R2_BUCKET is invalid/);
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateM4R2BackupEvidence } from "./m4-r2-backup-evidence.mjs";

function object(Key, LastModified = "2026-08-17T02:18:00.000Z", Size = 1024) {
  return { Key, LastModified, Size };
}

test("accepts fresh daily evidence within the existing 7/4 retention contract", () => {
  const dailyDates = [
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
  ];
  const weeklyDates = ["2026-07-26", "2026-08-02", "2026-08-09", "2026-08-16"];
  const evidence = evaluateM4R2BackupEvidence({
    now: new Date("2026-08-17T05:00:00.000Z"),
    objects: [
      ...dailyDates.map((date) => object(`appbasis/m3-preview/m4/daily/${date}.tar.aesgcm`)),
      ...weeklyDates.map((date) => object(`appbasis/m3-preview/m4/weekly/${date}.tar.aesgcm`)),
    ],
  });

  assert.deepEqual(evidence, {
    schemaVersion: 1,
    appId: "m3-preview",
    checkedAt: "2026-08-17T05:00:00.000Z",
    ok: true,
    expectedDailyKey: "appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm",
    latestDailyKey: "appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm",
    dailyCount: 7,
    weeklyCount: 4,
    expiredKeys: [],
    reasons: [],
  });
});

test("CLI accepts newline-terminated inventory JSON emitted by jq", () => {
  const cliPath = fileURLToPath(new URL("./m4-r2-backup-evidence.mjs", import.meta.url));
  const inventory = [object("appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm")];
  const result = spawnSync(
    process.execPath,
    [cliPath, "evaluate", "2026-08-17T05:00:00.000Z"],
    {
      input: `${JSON.stringify(inventory)}\n`,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.ok, true);
  assert.equal(
    evidence.latestDailyKey,
    "appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm",
  );
});

test("fails evidence when today's UTC daily backup is missing", () => {
  const evidence = evaluateM4R2BackupEvidence({
    now: new Date("2026-08-17T05:00:00.000Z"),
    objects: [
      object("appbasis/m3-preview/m4/daily/2026-08-16.tar.aesgcm"),
      object("appbasis/m3-preview/m4/weekly/2026-08-16.tar.aesgcm"),
    ],
  });

  assert.equal(evidence.ok, false);
  assert.equal(evidence.latestDailyKey, "appbasis/m3-preview/m4/daily/2026-08-16.tar.aesgcm");
  assert.deepEqual(evidence.reasons, ["daily-backup-stale"]);
});

test("fails evidence when the actual inventory still contains expired retention objects", () => {
  const evidence = evaluateM4R2BackupEvidence({
    now: new Date("2026-08-17T05:00:00.000Z"),
    objects: [
      object("appbasis/m3-preview/m4/daily/2026-08-01.tar.aesgcm"),
      object("appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm"),
    ],
  });

  assert.equal(evidence.ok, false);
  assert.deepEqual(evidence.expiredKeys, [
    "appbasis/m3-preview/m4/daily/2026-08-01.tar.aesgcm",
  ]);
  assert.deepEqual(evidence.reasons, ["retention-expired-objects"]);
});

test("fails closed on missing, empty, malformed, future or unmanaged object metadata", () => {
  const now = new Date("2026-08-17T05:00:00.000Z");
  const invalid = [
    undefined,
    object("appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm", undefined, 0),
    object("appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm", "not-a-date"),
    object("appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm", "2026-08-17T06:00:00.000Z"),
    object("appbasis/m3-preview/m4/pre-migration/change.tar.aesgcm"),
  ];

  for (const value of invalid) {
    const objects = value === undefined ? "not-an-array" : [value];
    assert.throws(
      () => evaluateM4R2BackupEvidence({ objects, now }),
      /M4 R2 backup inventory/,
    );
  }
});

test("reuses the retention validator to reject duplicate, malformed and future-dated keys", () => {
  const now = new Date("2026-08-17T05:00:00.000Z");
  const duplicate = object("appbasis/m3-preview/m4/daily/2026-08-17.tar.aesgcm");

  assert.throws(
    () => evaluateM4R2BackupEvidence({ objects: [duplicate, duplicate], now }),
    /duplicate keys/,
  );
  assert.throws(
    () => evaluateM4R2BackupEvidence({
      objects: [object("appbasis/m3-preview/m4/weekly/2026-08-17.tar.aesgcm")],
      now,
    }),
    /not a Sunday/,
  );
  assert.throws(
    () => evaluateM4R2BackupEvidence({
      objects: [object("appbasis/m3-preview/m4/daily/2026-08-18.tar.aesgcm")],
      now,
    }),
    /future-dated/,
  );
});

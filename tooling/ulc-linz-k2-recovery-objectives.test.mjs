import test from "node:test";
import assert from "node:assert/strict";
import { evaluateK2RecoveryObjectives as check } from "./ulc-linz-k2-recovery-objectives.mjs";

const accepted = {
  evidenceRecordedAt: "2026-11-15T04:00:00Z",
  incidentAt: "2026-11-15T03:00:00Z",
  recoveryPointAt: "2026-11-15T02:45:00Z",
  sourceSnapshotAt: "2026-11-15T02:44:00Z",
  restoreStartedAt: "2026-11-15T03:05:00Z",
  restoreFinishedAt: "2026-11-15T03:20:00Z",
  serviceVerifiedAt: "2026-11-15T03:40:00Z",
  rpoMinutes: 30, rtoMinutes: 60,
  sourceVerified: true, restoreVerified: true, mediaVerified: true,
  roleAndRlsVerified: true, appAndRoutingVerified: true,
  humanAcceptanceVerified: true, evidenceIndependent: true,
};
const verify = (change = {}) => check({ ...accepted, ...change });

test("incident-to-last-data RPO and incident-to-accepted-service RTO; always human review only", () => {
  const r = verify();
  assert.equal(r.status, "READY_FOR_HUMAN_REVIEW");
  assert.equal(r.dataLossMinutes, 15);
  assert.equal(r.databaseRestoreMinutes, 15);
  assert.equal(r.endToEndRecoveryMinutes, 40);
  for (const key of ["productionReady", "enableBackupAuthorized", "restoreAuthorized", "deployAuthorized"]) {
    assert.equal(r[key], false);
  }
});
test("assessment clock does not increase or decrease incident-based data loss", () => {
  const r = verify({ evidenceRecordedAt: "2026-11-17T04:00:00Z" });
  assert.equal(r.dataLossMinutes, 15);
  assert.equal(r.endToEndRecoveryMinutes, 40);
  assert.equal(r.status, "READY_FOR_HUMAN_REVIEW");
});
test("RPO exceeding pre-agreed tolerance blocks", () => {
  const r = verify({ recoveryPointAt: "2026-11-15T01:00:00Z", sourceSnapshotAt: "2026-11-15T00:59:00Z" });
  assert.ok(r.failures.includes("RPO_EXCEEDED"));
});
test("fast pg_restore cannot mask slow app service recovery", () => {
  const r = verify({ serviceVerifiedAt: "2026-11-15T03:50:00Z", rtoMinutes: 45 });
  assert.equal(r.databaseRestoreMinutes, 15);
  assert.equal(r.endToEndRecoveryMinutes, 50);
  assert.ok(r.failures.includes("RTO_EXCEEDED"));
});
test("tolerance boundaries pass only when elapsed duration is equal or less", () => {
  assert.equal(verify({ rpoMinutes: 15, rtoMinutes: 40 }).status, "READY_FOR_HUMAN_REVIEW");
  assert.equal(verify({ rpoMinutes: 14 }).status, "BLOCK");
  assert.equal(verify({ rtoMinutes: 39 }).status, "BLOCK");
});
test("sub-minute overrun is not truncated by display rounding", () => {
  const r = verify({ serviceVerifiedAt: "2026-11-15T03:40:00.001Z", rtoMinutes: 40 });
  assert.ok(r.failures.includes("RTO_EXCEEDED"));
});
test("all seven independent control statements are mandatory", () => {
  for (const key of [
    "sourceVerified", "restoreVerified", "mediaVerified", "roleAndRlsVerified",
    "appAndRoutingVerified", "humanAcceptanceVerified", "evidenceIndependent",
  ]) {
    assert.equal(verify({ [key]: false }).status, "BLOCK", key);
    assert.equal(verify({ [key]: undefined }).status, "BLOCK", key);
    assert.equal(verify({ [key]: "true" }).status, "BLOCK", key);
  }
});
test("missing incident or verified service time must not fall back to restore subphase", () => {
  for (const field of ["incidentAt", "serviceVerifiedAt", "recoveryPointAt", "evidenceRecordedAt"]) {
    assert.throws(() => verify({ [field]: undefined }), /requires UTC ISO-8601/);
  }
});
test("invalid chronology always rejects", () => {
  for (const change of [
    { sourceSnapshotAt: "2026-11-15T02:46:00Z" },
    { recoveryPointAt: "2026-11-15T03:01:00Z" },
    { restoreStartedAt: "2026-11-15T02:59:00Z" },
    { restoreFinishedAt: "2026-11-15T03:04:00Z" },
    { serviceVerifiedAt: "2026-11-15T03:19:00Z" },
    { serviceVerifiedAt: "2026-11-15T04:01:00Z" },
  ]) assert.throws(() => verify(change), /chronology/);
});
test("invalid UTC dates and offsets rejected for every timestamp", () => {
  for (const field of [
    "evidenceRecordedAt", "incidentAt", "recoveryPointAt", "sourceSnapshotAt",
    "restoreStartedAt", "restoreFinishedAt", "serviceVerifiedAt",
  ]) {
    for (const value of ["2026-02-30T03:00:00Z", "2026-11-15T03:00:00+01:00", "bad", null]) {
      assert.throws(() => verify({ [field]: value }), field);
    }
  }
});
test("explicit zero-minute target is allowed but blocks any loss or outage", () => {
  const r = verify({ rpoMinutes: 0, rtoMinutes: 0 });
  assert.ok(r.failures.includes("RPO_EXCEEDED"));
  assert.ok(r.failures.includes("RTO_EXCEEDED"));
});
test("numeric and out-of-range targets must be safe integers", () => {
  for (const field of ["rpoMinutes", "rtoMinutes"]) {
    for (const value of [-1, 1.5, Infinity, NaN, 525601, undefined, "60"]) {
      assert.throws(() => verify({ [field]: value }), field);
    }
  }
});
test("invalid evidence is rejected without implicit approval", () => {
  for (const value of [null, [], false, "synthetic"]) {
    assert.throws(() => check(value), /object/);
  }
});

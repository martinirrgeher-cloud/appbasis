/**
 * Offline-only K2 recovery objectives evaluator. Evidence is supplied by a
 * human-reviewed collector; no provider, DB, secret, network or filesystem I/O.
 * Passing an objective is NOT permission to deploy, restore, or enable backups.
 */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function instant(value, name) {
  if (typeof value !== "string" || !ISO_UTC.test(value)) throw Error(name + " requires UTC ISO-8601.");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw Error(name + " is invalid.");
  }
  return ms;
}
function minutes(value, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 525600) throw Error(name + " is invalid.");
  return value;
}
function bool(value) { return value === true; }
export function evaluateK2RecoveryObjectives({
  now, recoveryPointAt, sourceSnapshotAt, restoreStartedAt, restoreFinishedAt,
  rpoMinutes, rtoMinutes, sourceVerified = false, restoreVerified = false,
  mediaVerified = false, roleAndRlsVerified = false, evidenceIndependent = false,
} = {}) {
  const clock = instant(now, "now");
  const point = instant(recoveryPointAt, "recoveryPointAt");
  const source = instant(sourceSnapshotAt, "sourceSnapshotAt");
  const start = instant(restoreStartedAt, "restoreStartedAt");
  const finish = instant(restoreFinishedAt, "restoreFinishedAt");
  const rpo = minutes(rpoMinutes, "rpoMinutes");
  const rto = minutes(rtoMinutes, "rtoMinutes");
  if (point > clock || source > point || start < point || finish < start || finish > clock) {
    throw Error("Inconsistent evidence chronology.");
  }
  const ageMs = clock - point;
  const durationMs = finish - start;
  const ageMinutes = Math.ceil(ageMs / 60000);
  const durationMinutes = Math.ceil(durationMs / 60000);
  const controls = {
    sourceVerified: bool(sourceVerified),
    restoreVerified: bool(restoreVerified),
    mediaVerified: bool(mediaVerified),
    roleAndRlsVerified: bool(roleAndRlsVerified),
    evidenceIndependent: bool(evidenceIndependent),
  };
  const failures = [
    ...(ageMs > rpo * 60000 ? ["RPO_EXCEEDED"] : []),
    ...(durationMs > rto * 60000 ? ["RTO_EXCEEDED"] : []),
    ...Object.entries(controls).filter(([,v]) => !v).map(([k]) => "MISSING_" + k.toUpperCase()),
  ];
  return Object.freeze({
    status: failures.length ? "BLOCK" : "READY_FOR_HUMAN_REVIEW",
    ageMinutes, durationMinutes, rpoMinutes: rpo, rtoMinutes: rto,
    failures, productionReady: false, enableBackupAuthorized: false,
    restoreAuthorized: false, deployAuthorized: false,
  });
}

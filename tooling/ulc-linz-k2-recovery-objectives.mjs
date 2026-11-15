/**
 * Offline-only K2 RPO/RTO evaluator. Supplied evidence is human-reviewed;
 * no network, filesystem, database, secret, provider or deployment action.
 *
 * RPO: incidentAt - recoveryPointAt (last provably recoverable data).
 * RTO: serviceVerifiedAt - incidentAt (full service + human acceptance).
 * The database restore subphase is recorded but NEVER used as the RTO.
 */
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function instant(value, field) {
  if (typeof value !== "string" || !UTC.test(value)) {
    throw new Error(field + " requires UTC ISO-8601.");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error(field + " is invalid.");
  }
  return ms;
}
function objective(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 525600) {
    throw new Error(field + " is invalid.");
  }
  return value;
}
const REQUIRED_CONTROLS = [
  "sourceVerified", "restoreVerified", "mediaVerified", "roleAndRlsVerified",
  "appAndRoutingVerified", "humanAcceptanceVerified", "evidenceIndependent",
];
export function evaluateK2RecoveryObjectives(evidence = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("Recovery evidence must be an object.");
  }
  const {
    evidenceRecordedAt, incidentAt, recoveryPointAt, sourceSnapshotAt,
    restoreStartedAt, restoreFinishedAt, serviceVerifiedAt,
    rpoMinutes, rtoMinutes,
  } = evidence;
  const recorded = instant(evidenceRecordedAt, "evidenceRecordedAt");
  const incident = instant(incidentAt, "incidentAt");
  const point = instant(recoveryPointAt, "recoveryPointAt");
  const snapshot = instant(sourceSnapshotAt, "sourceSnapshotAt");
  const restoreStart = instant(restoreStartedAt, "restoreStartedAt");
  const restoreFinish = instant(restoreFinishedAt, "restoreFinishedAt");
  const service = instant(serviceVerifiedAt, "serviceVerifiedAt");
  const rpo = objective(rpoMinutes, "rpoMinutes");
  const rto = objective(rtoMinutes, "rtoMinutes");

  if (!(snapshot <= point && point <= incident && incident <= restoreStart &&
        restoreStart <= restoreFinish && restoreFinish <= service && service <= recorded)) {
    throw new Error("Inconsistent incident, recovery point, restore or service chronology.");
  }

  const dataLossMs = incident - point;
  const recoveryMs = service - incident;
  const databaseRestoreMs = restoreFinish - restoreStart;
  const failures = [
    ...(dataLossMs > rpo * 60000 ? ["RPO_EXCEEDED"] : []),
    ...(recoveryMs > rto * 60000 ? ["RTO_EXCEEDED"] : []),
    ...REQUIRED_CONTROLS.filter((key) => evidence[key] !== true)
      .map((key) => "MISSING_" + key.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()),
  ];

  return Object.freeze({
    status: failures.length ? "BLOCK" : "READY_FOR_HUMAN_REVIEW",
    dataLossMinutes: Math.ceil(dataLossMs / 60000),
    endToEndRecoveryMinutes: Math.ceil(recoveryMs / 60000),
    databaseRestoreMinutes: Math.ceil(databaseRestoreMs / 60000),
    rpoMinutes: rpo,
    rtoMinutes: rto,
    failures: Object.freeze(failures),
    productionReady: false,
    enableBackupAuthorized: false,
    restoreAuthorized: false,
    deployAuthorized: false,
  });
}

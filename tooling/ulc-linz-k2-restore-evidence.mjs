// Offline-only restore acceptance gate. Never accepts DB URLs, secrets, raw rows or object keys.
const HEX = /^[a-f0-9]{64}$/;
const NAME = /^[a-z][a-z0-9_]{0,62}$/;
const EXPECTED = ["identity", "permissions", "athletes", "training", "attendance", "catalog", "audit"];
function fail(reason) { return { decision: "BLOCK", reason }; }
function validSnapshot(x) {
  return x && typeof x === "object" && !Array.isArray(x) &&
    typeof x.sourceGitSha === "string" && /^[a-f0-9]{40}$/.test(x.sourceGitSha) &&
    typeof x.backupKeyDigest === "string" && HEX.test(x.backupKeyDigest) &&
    Array.isArray(x.tables) && x.tables.length > 0 && x.tables.length <= 1000 &&
    x.tables.every(t => t && NAME.test(t.name) && Number.isSafeInteger(t.rows) &&
      t.rows >= 0 && HEX.test(t.digest)) &&
    new Set(x.tables.map(t => t.name)).size === x.tables.length &&
    x.schema && ["columns", "indexes", "constraints", "sequences", "rls"].every(k =>
      HEX.test(x.schema[k])) &&
    x.quarantine === true;
}
export function evaluateK2RestoreEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return fail("invalid evidence");
  const { source, restored, controls } = evidence;
  if (!validSnapshot(source) || !validSnapshot(restored)) return fail("missing or malformed snapshots");
  if (source.sourceGitSha !== restored.sourceGitSha ||
      source.backupKeyDigest !== restored.backupKeyDigest) return fail("backup provenance mismatch");
  if (source.tables.length !== restored.tables.length) return fail("table inventory mismatch");
  const right = new Map(restored.tables.map(t => [t.name, t]));
  for (const t of source.tables) {
    const other = right.get(t.name);
    if (!other || other.rows !== t.rows || other.digest !== t.digest) return fail("table data mismatch");
  }
  for (const k of ["columns", "indexes", "constraints", "sequences", "rls"]) {
    if (source.schema[k] !== restored.schema[k]) return fail("schema mismatch");
  }
  if (!controls || typeof controls !== "object") return fail("missing controls");
  if (controls.sourceEndpointDistinct !== true || controls.quarantineUnrouted !== true ||
      controls.noLiveWrites !== true) return fail("isolation not proven");
  if (controls.mediaRestoreVerified !== true) return fail("media restore not proven");
  if (controls.legalRetentionApproved !== true || controls.deletionReconciliationVerified !== true)
    return fail("legal or deletion authority not proven");
  if (!controls.appChecks || typeof controls.appChecks !== "object" ||
      EXPECTED.some(k => controls.appChecks[k] !== true)) return fail("app checks incomplete");
  if (controls.roleChecks !== true || controls.rlsChecks !== true) return fail("role or RLS checks incomplete");
  return { decision: "READY_FOR_HUMAN_REVIEW", reason: "offline evidence complete; no deployment authorization" };
}

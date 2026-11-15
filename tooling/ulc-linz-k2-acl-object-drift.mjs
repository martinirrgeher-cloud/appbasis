/**
 * K2-A03. Pure, fail-closed comparison of EXTERNALLY collected, read-only
 * PostgreSQL catalog evidence. Does not connect to or modify a database.
 * Never prints object names, credentials, connection strings or SQL statements.
 */
export const K2_ROLES = Object.freeze([
  "PUBLIC",
  "appbasis_ulc_linz_preview_application",
  "appbasis_ulc_linz_preview_security_ingest",
  "ulc_linz_k2_preview_backup",
  "ulc_linz_security_event_ingest",
  "ulc_linz_security_event_cleanup",
  "ulc_linz_security_event_read",
]);
export const K2_PRIVILEGES = Object.freeze({
  table: Object.freeze(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]),
  column: Object.freeze(["SELECT", "INSERT", "UPDATE", "REFERENCES"]),
  sequence: Object.freeze(["USAGE", "SELECT", "UPDATE"]),
  routine: Object.freeze(["EXECUTE"]),
});
export const K2_REVIEW_CONTROLS = Object.freeze([
  "sourceProvenanceVerified",
  "quarantineProvenanceVerified",
  "completeObjectScopeVerified",
  "ownerMappingReviewed",
  "securityRoutinePolicyReviewed",
  "roleMembershipsReviewed",
  "cloudflareRouteExclusionVerified",
  "appScopeNegativeTestsVerified",
]);
const RESTRICTED_ROUTINES = new Set([
  "public.appbasis_ulc_linz_purge_expired_security_events()",
]);
const ID = /^public\.[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*|\([a-z0-9_, .]*\))?$/;
const OWNER = /^[a-z_][a-z0-9_]{0,62}$/;
const ROLE_SET = new Set(K2_ROLES);

function manifest(rows, label, expectedCounts) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100000) {
    throw new Error(label + ": missing or oversized object-ACL inventory.");
  }
  const keys = new Map(), objects = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(label + ": malformed ACL record.");
    }
    const { kind, object, role, privilege, allowed, owner, securityDefiner,
      rlsEnabled, rlsForced, policyCount } = row;
    if (!Object.hasOwn(K2_PRIVILEGES, kind) || typeof object !== "string" ||
      !ID.test(object) || object.length > 220 || !ROLE_SET.has(role) ||
      !K2_PRIVILEGES[kind].includes(privilege) || typeof allowed !== "boolean" ||
      typeof owner !== "string" || !OWNER.test(owner) ||
      typeof securityDefiner !== "boolean" ||
      typeof rlsEnabled !== "boolean" || typeof rlsForced !== "boolean" ||
      !Number.isSafeInteger(policyCount) || policyCount < 0 || policyCount > 10000 ||
      (kind !== "routine" && securityDefiner) ||
      (kind !== "table" && (rlsEnabled || rlsForced || policyCount !== 0)) ||
      (rlsForced && !rlsEnabled)) {
      throw new Error(label + ": invalid or unsafe ACL metadata.");
    }
    const identity = kind + "|" + object;
    const key = identity + "|" + role + "|" + privilege;
    if (keys.has(key)) throw new Error(label + ": duplicate ACL record.");
    keys.set(key, allowed);
    const meta = { owner, securityDefiner, rlsEnabled, rlsForced, policyCount, kind, object };
    const seen = objects.get(identity);
    if (seen) {
      if (["owner", "securityDefiner", "rlsEnabled", "rlsForced", "policyCount"]
        .some(field => seen[field] !== meta[field])) {
        throw new Error(label + ": inconsistent object-level metadata.");
      }
      seen.rowCount += 1;
    } else {
      objects.set(identity, { ...meta, rowCount: 1 });
    }
  }
  const counts = { table: 0, column: 0, sequence: 0, routine: 0 };
  for (const info of objects.values()) {
    counts[info.kind] += 1;
    if (info.rowCount !== K2_ROLES.length * K2_PRIVILEGES[info.kind].length) {
      throw new Error(label + ": incomplete per-object role/privilege matrix.");
    }
  }
  if (!expectedCounts || typeof expectedCounts !== "object" || Array.isArray(expectedCounts)) {
    throw new Error(label + ": missing expected scope counts.");
  }
  for (const kind of Object.keys(K2_PRIVILEGES)) {
    if (!Number.isSafeInteger(expectedCounts[kind]) || expectedCounts[kind] < 0 ||
      counts[kind] !== expectedCounts[kind]) {
      throw new Error(label + ": wrong or incomplete object inventory scope.");
    }
  }
  if (counts.table < 1 || counts.routine < 1 || counts.sequence < 1 || counts.column < 1) {
    throw new Error(label + ": protected object families must all be reviewed.");
  }
  return { keys, objects, counts };
}
export function evaluateK2ObjectAclDrift({
  sourceRows, restoredRows, expectedCounts, controls,
} = {}) {
  const source = manifest(sourceRows, "source", expectedCounts);
  const restore = manifest(restoredRows, "restore", expectedCounts);
  const failures = new Set();
  for (const [key, expected] of source.keys) {
    if (!restore.keys.has(key)) {
      failures.add("RESTORE_OBJECT_OR_PERMISSION_MISSING");
    } else {
      const observed = restore.keys.get(key);
      if (expected === false && observed === true) failures.add("UNAUTHORIZED_PRIVILEGE_ESCALATION");
      if (expected === true && observed === false) failures.add("REQUIRED_PRIVILEGE_MISSING");
    }
  }
  for (const key of restore.keys.keys()) {
    if (!source.keys.has(key)) failures.add("UNEXPECTED_RESTORE_OBJECT_OR_PERMISSION");
  }
  for (const [key, before] of source.objects) {
    const after = restore.objects.get(key);
    if (!after) {
      failures.add("MISSING_RESTORE_OBJECT");
      continue;
    }
    if (before.owner !== after.owner) failures.add("OWNER_MAPPING_REQUIRES_APPROVAL");
    if (before.securityDefiner !== after.securityDefiner) failures.add("SECURITY_DEFINER_DRIFT");
    if (before.rlsEnabled !== after.rlsEnabled ||
      before.rlsForced !== after.rlsForced ||
      before.policyCount !== after.policyCount) failures.add("RLS_POLICY_DRIFT");
  }
  for (const [key, after] of restore.objects) {
    if (!source.objects.has(key)) failures.add("UNEXPECTED_RESTORE_OBJECT");
    if (after.kind === "routine" &&
      restore.keys.get(key + "|PUBLIC|EXECUTE") === true) {
      failures.add("PUBLIC_FUNCTION_EXECUTE_UNREVIEWED");
      if (after.securityDefiner || RESTRICTED_ROUTINES.has(after.object)) {
        failures.add("PUBLIC_PROTECTED_ROUTINE_EXECUTE");
      }
    }
    if (after.kind === "table" && after.rlsEnabled && after.policyCount === 0) {
      failures.add("RLS_ENABLED_WITHOUT_POLICY");
    }
  }
  const accepted = controls && typeof controls === "object" && !Array.isArray(controls)
    ? controls : {};
  for (const name of K2_REVIEW_CONTROLS) {
    if (accepted[name] !== true) failures.add("MISSING_" + name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase());
  }
  return Object.freeze({
    status: failures.size ? "BLOCK" : "READY_FOR_HUMAN_REVIEW",
    failures: Object.freeze([...failures].sort()),
    sourceObjectCounts: Object.freeze({ ...source.counts }),
    restoreObjectCounts: Object.freeze({ ...restore.counts }),
    appRestoreAuthorized: false,
    grantAuthorized: false,
    deployAuthorized: false,
    productionAuthorized: false,
  });
}

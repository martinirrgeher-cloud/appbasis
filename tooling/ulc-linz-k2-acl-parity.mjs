/**
 * K2-A02: Offline-only comparison of already collected PostgreSQL catalog summaries.
 * No database, filesystem, network, provider, secrets, DDL, DML or deployment I/O.
 * Aggregate equality NEVER proves object-by-object authorization equivalence.
 */
export const K2_ACL_FIELDS = Object.freeze([
  "tables_count",
  "explicit_acl_count",
  "application_select_count",
  "application_insert_count",
  "application_update_count",
  "application_delete_count",
  "backup_select_count",
  "rls_enabled_count",
  "rls_forced_count",
  "rls_policy_count",
  "sequence_count",
]);
export const K2_ACL_CONTROLS = Object.freeze([
  "independentEvidenceVerified",
  "sourceAndRestoreEndpointsDistinct",
  "perTableGrantsVerified",
  "roleMembershipsVerified",
  "ownerMappingReviewed",
  "sequenceAndFunctionGrantsVerified",
  "applicationScopeNegativeTestsVerified",
  "cloudflareRouteExclusionVerified",
]);
const TABLE_BOUNDED = new Set([
  "explicit_acl_count",
  "application_select_count",
  "application_insert_count",
  "application_update_count",
  "application_delete_count",
  "backup_select_count",
  "rls_enabled_count",
  "rls_forced_count",
]);
function requiredSummary(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be a catalog summary object.");
  }
  const summary = {};
  for (const field of K2_ACL_FIELDS) {
    const number = value[field];
    if (!Number.isSafeInteger(number) || number < 0 || number > 1000000) {
      throw new Error(label + " has an invalid metric: " + field);
    }
    summary[field] = number;
  }
  if (summary.tables_count < 1) {
    throw new Error(label + " cannot establish parity from an empty table inventory.");
  }
  for (const field of TABLE_BOUNDED) {
    if (summary[field] > summary.tables_count) {
      throw new Error(label + " has impossible catalog counts: " + field);
    }
  }
  if (summary.rls_forced_count > summary.rls_enabled_count) {
    throw new Error(label + " has forced RLS without enabled RLS.");
  }
  return Object.freeze(summary);
}
/**
 * Controls are independently reviewed operator evidence, not booleans
 * inferred from equal counts. Status never authorizes writes or go-live.
 */
export function evaluateK2AclParity({ source, restored, controls } = {}) {
  const a = requiredSummary(source, "source");
  const b = requiredSummary(restored, "restored");
  const approvals = controls && typeof controls === "object" && !Array.isArray(controls)
    ? controls : {};
  const mismatches = K2_ACL_FIELDS.filter(field => a[field] !== b[field]);
  const failures = [
    ...mismatches.map(field => "MISMATCH_" + field.toUpperCase()),
    ...K2_ACL_CONTROLS.filter(control => approvals[control] !== true)
      .map(control => "MISSING_" + control.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()),
  ];
  return Object.freeze({
    status: failures.length ? "BLOCK" : "READY_FOR_HUMAN_REVIEW",
    aggregateParity: mismatches.length === 0,
    failures: Object.freeze(failures),
    productionReady: false,
    appRestoreReady: false,
    grantAuthorized: false,
    deployAuthorized: false,
    providerWriteAuthorized: false,
  });
}

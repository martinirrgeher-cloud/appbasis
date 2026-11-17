/**
 * K2-A09. Offline-only review of Neon copy-on-write checkpoint branch metadata.
 * Neon rejected a snapshot from this NON-ROOT K2 branch (HTTP 400).
 * This is an ALTERNATIVE branch copy, NOT a Neon snapshot or external backup.
 *
 * It is intentionally impossible to authorize SQL/restore/merge/deploy here.
 */
export const K2_CHECKPOINT = Object.freeze({
  projectId: "cool-unit-46141580",
  source: "br-small-wind-b10p67j8",
  checkpoint: "br-solitary-violet-b1advl8z",
  sourceName: "ulc-k2-restore-quarantine-20261114",
  checkpointName: "ulc-k2-pre-rights-repair-checkpoint-20261117",
  parentLsn: "0/6EA7508",
});
const EXPECTED_DATABASE_DIGESTS = Object.freeze({
  appbasis_ulc_linz_preview: Object.freeze({
    object_count: 66, function_count: 2,
    object_digest: "38ef655c74e565d1675899073cea373f",
    function_digest: "ec8530627eb6290f2eee7bb982fa4810",
    owner: "appbasis_ulc_linz_preview_migration",
  }),
  neondb: Object.freeze({
    object_count: 2, function_count: 0,
    object_digest: "a789510860bbe7840b5768a941f1bc8c",
    function_digest: null,
    owner: "neondb_owner",
  }),
  ulc_linz_k2_restore_quarantine: Object.freeze({
    table_count: 62, sequence_count: 4, function_count: 2,
    old_owner_relations: 66, old_owner_functions: 2,
    identity_link_count: 4, reviewed_identity_link_count: 4,
    function_definition_digest: "f096a8e6786da42145aa56c2a6e61d87",
    public_function_execute_count: 0, app_function_execute_count: 0,
    explicit_relation_acl_count: 0,
    current_app_select_tables: 0, current_backup_select_tables: 0,
    owner: "ulc_linz_k2_restore_owner",
  }),
});
const NAMES = Object.keys(EXPECTED_DATABASE_DIGESTS).sort();
function rejected(...failureCodes) {
  return Object.freeze({
    status: "BLOCK", failures: Object.freeze(failureCodes),
    checkpointCatalogMatch: false,
    neonSnapshotCreated: false,
    externalBackupVerified: false,
    independentRecoveryRehearsalComplete: false,
    sqlWriteAllowed: false, restoreFinalizeAllowed: false,
    mergeAllowed: false, deployAllowed: false, appReady: false,
  });
}
function matchingPart(actual, reference, names = Object.keys(reference)) {
  return actual && typeof actual === "object" && !Array.isArray(actual) &&
    names.every(k => Object.hasOwn(actual, k) && actual[k] === reference[k]);
}
export function reviewK2Checkpoint({
  projectId, sourceBranch, checkpointBranch, sourceDbOwners,
  checkpointDbOwners, sourceCatalog, checkpointCatalog,
} = {}) {
  if (projectId !== K2_CHECKPOINT.projectId) return rejected("WRONG_PROJECT");
  if (!matchingPart(sourceBranch, {
    id: K2_CHECKPOINT.source, name: K2_CHECKPOINT.sourceName,
    default: false, current_state: "ready",
  })) return rejected("SOURCE_BRANCH_DRIFT");
  if (!matchingPart(checkpointBranch, {
    id: K2_CHECKPOINT.checkpoint,
    name: K2_CHECKPOINT.checkpointName,
    parent_id: K2_CHECKPOINT.source,
    parent_lsn: K2_CHECKPOINT.parentLsn,
    default: false, current_state: "ready",
  })) return rejected("CHECKPOINT_PARENT_OR_STATE_DRIFT");
  for (const [phase, owners, catalog] of [
    ["SOURCE", sourceDbOwners, sourceCatalog],
    ["CHECKPOINT", checkpointDbOwners, checkpointCatalog],
  ]) {
    if (!owners || typeof owners !== "object" || Array.isArray(owners) ||
        !catalog || typeof catalog !== "object" || Array.isArray(catalog) ||
        JSON.stringify(Object.keys(owners).sort()) !== JSON.stringify(NAMES) ||
        JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(NAMES)) {
      return rejected(phase + "_DB_SET_CHANGED");
    }
    for (const db of NAMES) {
      const expected = EXPECTED_DATABASE_DIGESTS[db];
      if (owners[db] !== expected.owner) return rejected(phase + "_DB_OWNER_CHANGED");
      if (!matchingPart(catalog[db], expected,
        Object.keys(expected).filter(x => x !== "owner"))) {
        return rejected(phase + "_CATALOG_FINGERPRINT_DRIFT");
      }
    }
  }
  return Object.freeze({
    status: "CHECKPOINT_BRANCH_METADATA_MATCH_ONLY",
    failures: Object.freeze([]),
    checkpointBranchId: K2_CHECKPOINT.checkpoint,
    parentBranchId: K2_CHECKPOINT.source,
    checkedDatabaseCount: NAMES.length,
    checkpointCatalogMatch: true,
    neonSnapshotCreated: false,
    externalBackupVerified: false,
    independentRecoveryRehearsalComplete: false,
    originalK2PermissionsStillUnrepaired: true,
    sqlWriteAllowed: false, restoreFinalizeAllowed: false,
    mergeAllowed: false, deployAllowed: false, appReady: false,
  });
}

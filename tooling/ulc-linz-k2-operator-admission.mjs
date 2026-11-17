/**
 * K2-A07: fail-closed evaluation of a real metadata-only operator preflight.
 * This evaluator neither executes SQL nor authorizes provider/database changes.
 * A positive result means catalog consistency ONLY, not safe runtime isolation.
 */
export const K2_ADMISSION_EXPECTED = Object.freeze({
 database_name:"ulc_linz_k2_restore_quarantine",
 executed_as:"ulc_linz_k2_restore_owner",
 table_count:62,
 sequence_count:4,
 function_count:2,
 old_owner_relations:66,
 old_owner_functions:2,
 explicit_relation_acl_count:0,
 identity_link_count:4,
 reviewed_identity_link_count:4,
 function_definition_digest:"f096a8e6786da42145aa56c2a6e61d87",
 security_definer_count:1,
 secured_definer_searchpath_count:1,
 public_function_execute_count:0,
 app_function_execute_count:0,
 neutral_owner_exists:0,
 elevated_restore_owner:1,
 required_roles_found:5,
 database_owned_public_schema:1,
 old_owner_schema_create:1,
 current_app_select_tables:0,
 current_backup_select_tables:0,
 restore_owner_neon_admin_memberships:1,
 unsafe_runtime_owner_memberships:0,
 other_database_sessions:0,
});
export function evaluateK2OperatorAdmission(row) {
 if (!row || typeof row!=="object" || Array.isArray(row))
  return Object.freeze({status:"BLOCK",failures:Object.freeze(["NO_CATALOG_EVIDENCE"]),
   databaseWriteAuthorized:false,appRestoreReady:false,productionReady:false});
 const expectedKeys=[...Object.keys(K2_ADMISSION_EXPECTED),"pg_version"].sort();
 const actualKeys=Object.keys(row).sort();
 const failures=[];
 if(JSON.stringify(actualKeys)!==JSON.stringify(expectedKeys)) failures.push("INCOMPLETE_OR_EXTRA_COLUMNS");
 for(const [key,value] of Object.entries(K2_ADMISSION_EXPECTED)) {
  if(!Object.hasOwn(row,key) || row[key]!==value) failures.push("DRIFT_"+key.toUpperCase());
 }
 if(!Number.isInteger(row.pg_version) || row.pg_version<180000 || row.pg_version>=190000)
  failures.push("UNREVIEWED_POSTGRES_MAJOR_VERSION");
 return Object.freeze({
  status:failures.length?"BLOCK":"CATALOG_MATCH_ONLY",
  failures:Object.freeze(failures),
  knownHighPrivilegeRestoreOwner:true,
  neutralOwnerMustBeCreatedUnderSeparateApproval:true,
  cloudflareDirectSecretValuesVerified:false,
  physicalBranchAndEndpointIndependentlyVerifiedForWrite:false,
  operatorRoleMembershipLifecycleApproved:false,
  futureMigrationsAndDefaultAclPolicyApproved:false,
  transactionRollbackAndPostCommitUndoReviewed:false,
  grantsAndOwnershipNotYetApplied:true,
  databaseWriteAuthorized:false,
  mergeAuthorized:false,
  deployAuthorized:false,
  appRestoreReady:false,
  productionReady:false,
 });
}

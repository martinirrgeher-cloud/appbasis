/**
 * K2-A04: deterministic offline-only restore permissions proposal.
 * The source contract is obtained from read-only pg_catalog evidence.
 * No database connection, network, execute, grant, write or deploy here.
 * Do not equate 839 direct source ACL entries with 373 effective rights gaps.
 */
export const K2_ROLES = Object.freeze({
  app: "appbasis_ulc_linz_preview_application",
  security: "appbasis_ulc_linz_preview_security_ingest",
  backup: "ulc_linz_k2_preview_backup",
  newOwner: "ulc_linz_k2_object_owner",
  oldOwner: "ulc_linz_k2_restore_owner",
  migration: "appbasis_ulc_linz_preview_migration",
});
const ALLOWED_ROLES = new Set([K2_ROLES.app,K2_ROLES.security,K2_ROLES.backup]);
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const FUNCTION = /^([a-z_][a-z0-9_]*)\(\)$/;
const ALLOWED_PRIVS = Object.freeze({
 table:new Set(["SELECT","INSERT","UPDATE","DELETE"]),
 sequence:new Set(["SELECT","USAGE","UPDATE"]),
 column:new Set(["INSERT"]),
});
const EXPECTED_GROUPS = {table:123,sequence:8,column:15};
const EXPECTED_ENTRIES = {
 app:{table:242,sequence:5,column:0},
 security:{table:0,sequence:1,column:15},
 backup:{table:62,sequence:4,column:0},
};
const FUNCTION_DEF = new Map([
 ["appbasis_ulc_linz_purge_expired_security_events()",true],
 ["ulc_linz_registration_calendar_guard()",false],
]);
function fail(message){throw Error("K2 restore plan blocked: "+message);}
function identifier(text){if(typeof text!=="string"||!IDENT.test(text))fail("invalid identifier");return '"'+text+'"';}
function objectName(kind,name){
 if(kind==="function"){
  const m=FUNCTION.exec(name||"");
  if(!m)fail("invalid function name");
  return '"public".'+identifier(m[1])+"()";
 }
 return '"public".'+identifier(name);
}
/** Strictly review an immutable, known-size source catalog snapshot. */
export function validateK2RestoreContract(snapshot){
 if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot)||
 snapshot.schemaVersion!==1||
 snapshot.sourceDatabase!=="appbasis_ulc_linz_preview"||
 snapshot.restoreDatabase!=="ulc_linz_k2_restore_quarantine"||
 snapshot.sourceOwner!==K2_ROLES.migration||
 snapshot.existingRestoreOwner!==K2_ROLES.oldOwner||
 snapshot.proposedQuarantineOwner!==K2_ROLES.newOwner)fail("source or target identity mismatch");
 const e=snapshot.expected||{};
 if(e.tables!==62||e.sequences!==4||e.functions!==2||
 e.protectedColumns!==26||e.directNonOwnerPrivilegeEntries!==329)
  fail("unreviewed inventory counts");
 if(!Array.isArray(snapshot.objects)||snapshot.objects.length!==68||
 !Array.isArray(snapshot.grants)||snapshot.grants.length!==146)
  fail("unreviewed catalog scope");
 const objectKeys=new Set(),tableNames=new Set();
 const count={table:0,sequence:0,function:0};
 for(const o of snapshot.objects){
  if(!o||!Object.hasOwn(count,o.kind))fail("unexpected object type");
  objectName(o.kind,o.name);
  const key=o.kind+"|"+o.name;
  if(objectKeys.has(key))fail("duplicate schema object");
  objectKeys.add(key);count[o.kind]++;
  if(o.kind==="table")tableNames.add(o.name);
  if(o.kind==="function"){
    if(!FUNCTION_DEF.has(o.name)||o.securityDefiner!==FUNCTION_DEF.get(o.name))
      fail("protected function definition mismatch");
  }else if(Object.hasOwn(o,"securityDefiner"))fail("unreviewed metadata");
 }
 if(count.table!==62||count.sequence!==4||count.function!==2)
  fail("unexpected object family counts");
 const groups={table:0,sequence:0,column:0};
 const entryCounts={app:{table:0,sequence:0,column:0},
  security:{table:0,sequence:0,column:0},backup:{table:0,sequence:0,column:0}};
 const keys=new Set();
 for(const g of snapshot.grants){
  if(!g||!Object.hasOwn(ALLOWED_PRIVS,g.kind)||!ALLOWED_ROLES.has(g.role)||
     !Array.isArray(g.privileges)||g.privileges.length===0||
     g.privileges.some(p=>!ALLOWED_PRIVS[g.kind].has(p))||
     new Set(g.privileges).size!==g.privileges.length)fail("unreviewed privilege");
  if(g.kind==="column"){
   const parts=typeof g.object==="string"?g.object.split("."):[];
   if(parts.length!==2||!IDENT.test(parts[0])||!IDENT.test(parts[1])||
      parts[0]!=="ulc_linz_security_event_log"||!tableNames.has(parts[0]))
     fail("unreviewed protected column");
  } else if(!objectKeys.has(g.kind+"|"+g.object))fail("grant for unknown object");
  const key=g.kind+"|"+g.object+"|"+g.role;
  if(keys.has(key))fail("duplicate grant group");
  keys.add(key);
  if(g.role===K2_ROLES.app &&
     (g.kind==="column"||g.object==="ulc_linz_security_event_log"))
     fail("application may not access security log");
  if(g.role===K2_ROLES.security &&
     (g.kind==="table"||
      (g.kind==="sequence"&&
       (g.object!=="ulc_linz_security_event_log_id_seq"||
        g.privileges.length!==1||g.privileges[0]!=="USAGE"))))
    fail("security log privilege exceeds reviewed scope");
  if(g.role===K2_ROLES.backup &&
     (g.kind==="column"||g.privileges.length!==1||g.privileges[0]!=="SELECT"))
    fail("backup privilege exceeds read-only scope");
  const role=g.role===K2_ROLES.app?"app":g.role===K2_ROLES.security?"security":"backup";
  entryCounts[role][g.kind]+=g.privileges.length;groups[g.kind]++;
 }
 for(const kind of Object.keys(groups))
  if(groups[kind]!==EXPECTED_GROUPS[kind])fail("unexpected grant groups");
 for(const role of Object.keys(entryCounts))
  for(const kind of Object.keys(groups))
   if(entryCounts[role][kind]!==EXPECTED_ENTRIES[role][kind])
    fail("unexpected grant entries");
 return Object.freeze({objectCounts:Object.freeze({...count}),
  grantGroupCounts:Object.freeze({...groups}),
  roleEntries:Object.freeze(entryCounts),
  privilegeEntries:329});
}
function toGrant(g){
 const privs=[...g.privileges].sort().join(", ");
 if(g.kind==="column"){
  const [table,column]=g.object.split(".");
  return "GRANT "+privs+" ("+identifier(column)+") ON TABLE "+
    objectName("table",table)+" TO "+identifier(g.role)+";";
 }
 return "GRANT "+privs+" ON "+(g.kind==="table"?"TABLE ":"SEQUENCE ")+
   objectName(g.kind,g.object)+" TO "+identifier(g.role)+";";
}
function toOwner(o){
 return "ALTER "+(o.kind==="table"?"TABLE":o.kind==="sequence"?"SEQUENCE":"FUNCTION")+
   " "+objectName(o.kind,o.name)+" OWNER TO "+identifier(K2_ROLES.newOwner)+";";
}
/** Returns a review-only sequence; NO apply function or default authorization. */
export function planK2RestoreRights(snapshot){
 const validated=validateK2RestoreContract(snapshot);
 const objects=[...snapshot.objects].sort((a,b)=>{
   const order={table:0,sequence:1,function:2};
   return order[a.kind]-order[b.kind] || a.name.localeCompare(b.name,"en");
 });
 const grants=[...snapshot.grants].sort((a,b)=>
   (a.kind+"|"+a.object+"|"+a.role).localeCompare(b.kind+"|"+b.object+"|"+b.role,"en"));
 const ownerStatements=objects.map(toOwner);
 const grantStages={
  application:grants.filter(g=>g.role===K2_ROLES.app).map(toGrant),
  securityIngest:grants.filter(g=>g.role===K2_ROLES.security).map(toGrant),
  backup:grants.filter(g=>g.role===K2_ROLES.backup).map(toGrant),
 };
 return Object.freeze({
  status:"REVIEW_ONLY", targetDatabase:snapshot.restoreDatabase,
  targetBranchMustBeIndependentlyConfirmed:true,
  oldOwnerRoleHasDangerousCreateRoleAndBypassRls:true,
  defaultAclMigrationPolicy:"REQUIRES_OPERATOR_DECISION",
  legacySourceDefaultAclOwnerMustNotBeCopied:true,
  runtimeAccessToNewOwnerMustBeDeniedAndIndependentlyVerified:true,
  isolatedOwnerProposal:Object.freeze({
   role:K2_ROLES.newOwner,canLogin:false,createRole:false,
   createDb:false,superuser:false,bypassRls:false,inherit:false,
   reachableFromRuntimeRoles:false,
  }),
  counts:Object.freeze({objects:68,grantGroups:146,privilegeEntries:329,
   ownerStatements:ownerStatements.length,
   applicationGrantStatements:grantStages.application.length,
   securityIngestGrantStatements:grantStages.securityIngest.length,
   backupGrantStatements:grantStages.backup.length}),
  phases:Object.freeze([
   Object.freeze({name:"Independent quarantine Worker/Neon isolation review",completed:false}),
   Object.freeze({name:"Dedicated isolated NOLOGIN owner and membership checks",completed:false}),
   Object.freeze({name:"Object owner migration; preserve SECURITY DEFINER/deny PUBLIC",completed:false,
      proposedStatements:Object.freeze(ownerStatements)}),
   Object.freeze({name:"App-only grants",completed:false,
      proposedStatements:Object.freeze(grantStages.application)}),
   Object.freeze({name:"Security-ingest and backup-only grants",completed:false,
      proposedStatements:Object.freeze([...grantStages.securityIngest,...grantStages.backup])}),
   Object.freeze({name:"Read-back direct/effective ACL, ownership, negative app tests",completed:false}),
  ]),
  databaseWriteAuthorized:false,mergeAuthorized:false,deployAuthorized:false,
  restoreReady:false,productionReady:false,
  audited:validated,
 });
}


/**
 * Checks the actual READ-ONLY, pre-repair K2 catalog state.
 * NOT a physical branch fingerprint; operator must verify Neon/Worker separately.
 */
export const K2_RESTORE_PREFLIGHT_EXPECTED = Object.freeze({
  exact_database_name:true,
  table_count:62,
  sequence_count:4,
  old_owner_object_count:66,
  relation_acl_count:0,
  routine_count:2,
  routine_old_owner_count:2,
  protected_definer_count:1,
  public_routine_execute_count:0,
  app_routine_execute_count:0,
  proposed_owner_exists_count:0,
  privileged_current_owner_count:1,
  app_select_tables:0,
});
export function evaluateK2RestorePreflight(row){
  if(!row||typeof row!=="object"||Array.isArray(row))
    return Object.freeze({status:"BLOCK",failures:Object.freeze(["MISSING_CATALOG_ROW"]),writeAuthorized:false});
  const failures=[];
  for(const [key,expected] of Object.entries(K2_RESTORE_PREFLIGHT_EXPECTED)){
    if(row[key]!==expected)failures.push("MISMATCH_"+key.toUpperCase());
  }
  return Object.freeze({
    status:failures.length?"BLOCK":"CATALOG_MATCH_ONLY",
    failures:Object.freeze(failures),
    physicalBranchIndependentlyVerified:false,
    cloudflareAccountWideIsolationVerified:false,
    writeAuthorized:false,
    deployAuthorized:false,
    appRestoreReady:false,
  });
}


/**
 * Read-only default-ACL/ownership evidence compared to the observed real
 * source and restore catalogs (2026-11-15). Evidence is NOT approval.
 * A NOLOGIN owner alone cannot guarantee isolation if runtime roles can
 * inherit or SET ROLE to it, or if privileged migration roles own functions.
 * Default privileges apply to the role which CREATES future objects; granting
 * defaults for the new NOLOGIN owner is not a substitute for a future DDL plan.
 */
export const K2_OWNER_FUTURE_ACL_EXPECTED = Object.freeze({
  source:Object.freeze({
    database_name:"appbasis_ulc_linz_preview",
    public_default_acl_configs:4,
    migration_backup_default_select_entries:2,
    explicit_public_function_default_exec:0,
    unsafe_runtime_owner_memberships:0,
    runtime_member_of_existing_owner:0,
    runtime_inherits_existing_owner:0,
    runtime_can_set_existing_owner:0,
    elevated_restore_owner:0,
    neutral_owner_exists:0,
    restricted_migration_owner:1,
  }),
  restore:Object.freeze({
    database_name:"ulc_linz_k2_restore_quarantine",
    public_default_acl_configs:2,
    migration_backup_default_select_entries:0,
    explicit_public_function_default_exec:0,
    unsafe_runtime_owner_memberships:0,
    runtime_member_of_existing_owner:0,
    runtime_inherits_existing_owner:0,
    runtime_can_set_existing_owner:0,
    elevated_restore_owner:1,
    neutral_owner_exists:0,
    restricted_migration_owner:1,
  }),
});
export function evaluateK2OwnerAndDefaultAclEvidence({source,restore}={}){
  const failures=[];
  for(const [label,value] of [["source",source],["restore",restore]]){
    const expected=K2_OWNER_FUTURE_ACL_EXPECTED[label];
    if(!value||typeof value!=="object"||Array.isArray(value)){
      failures.push("MISSING_"+label.toUpperCase()+"_CATALOG");continue;
    }
    for(const [field,correct] of Object.entries(expected)){
      if(value[field]!==correct)
        failures.push("DRIFT_"+label.toUpperCase()+"_"+field.toUpperCase());
    }
  }
  if(failures.length)return Object.freeze({
    status:"BLOCK",failures:Object.freeze(failures),grantAuthorized:false,
    ownerChangeAuthorized:false,deployAuthorized:false,productionReady:false,
  });
  return Object.freeze({
    status:"OBSERVED_GAPS_REQUIRE_REVIEW",
    failures:Object.freeze([
      "PRIVILEGED_SECURITY_DEFINER_OWNER",
      "NEUTRAL_NOLOGIN_OWNER_NOT_CREATED",
      "FUTURE_DDL_DEFAULT_ACL_POLICY_UNDECIDED",
      "DEFAULT_ACL_SOURCE_RESTORE_DIFFER",
      "ROLE_SET_AND_INHERIT_GRAPH_REQUIRES_INDEPENDENT_ATTESTATION",
    ]),
    restoreHasNoPublicFunctionExec:true,
    oldOwnerStillTooPrivileged:true,
    sourceBackupDefaultAclEntries:2,
    restoredBackupDefaultAclEntries:0,
    grantAuthorized:false,ownerChangeAuthorized:false,
    deployAuthorized:false,productionReady:false,
  });
}

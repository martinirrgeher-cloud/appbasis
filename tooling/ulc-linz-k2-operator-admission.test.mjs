import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {K2_ADMISSION_EXPECTED,evaluateK2OperatorAdmission} from "./ulc-linz-k2-operator-admission.mjs";

function current() {return {...K2_ADMISSION_EXPECTED,pg_version:180007};}
test("actual read-only K2 metadata allows only human review, never a write",()=>{
 const r=evaluateK2OperatorAdmission(current());
 assert.equal(r.status,"CATALOG_MATCH_ONLY");
 assert.deepEqual(r.failures,[]);
 for(const key of ["databaseWriteAuthorized","mergeAuthorized","deployAuthorized",
   "appRestoreReady","productionReady","operatorRoleMembershipLifecycleApproved",
   "cloudflareDirectSecretValuesVerified","transactionRollbackAndPostCommitUndoReviewed"])
  assert.equal(r[key],false,key);
 assert.equal(r.knownHighPrivilegeRestoreOwner,true);
 assert.equal(r.grantsAndOwnershipNotYetApplied,true);
});
test("every required observed catalog value is independently fail-closed",()=>{
 for(const [key,value] of Object.entries(K2_ADMISSION_EXPECTED)){
  const v=current();
  v[key]=typeof value==="string"?"wrong-source-or-target":value+1;
  const r=evaluateK2OperatorAdmission(v);
  assert.equal(r.status,"BLOCK",key);
  assert.ok(r.failures.includes("DRIFT_"+key.toUpperCase()),key);
  assert.equal(r.databaseWriteAuthorized,false);
 }
});
test("missing, extra or malformed catalog fields never pass",()=>{
 for(const row of [null,undefined,[],{},false]) 
  assert.equal(evaluateK2OperatorAdmission(row).status,"BLOCK");
 const missing=current();
 delete missing.old_owner_functions;
 assert.equal(evaluateK2OperatorAdmission(missing).status,"BLOCK");
 const extras={...current(),secret:"do not log"};
 assert.equal(evaluateK2OperatorAdmission(extras).status,"BLOCK");
 for(const pg_version of [undefined,150002,170002,190000,"180007",null,180007.5]){
  assert.equal(evaluateK2OperatorAdmission({...current(),pg_version}).status,"BLOCK");
 }
});
test("the exact live operator SQL is metadata-only and cannot create DB writes",()=>{
 const sql=readFileSync(new URL("./ulc-linz-k2-operator-admission-readonly.sql",import.meta.url),"utf8");
 assert.match(sql,/current_database\(\)/);
 assert.match(sql,/current_user/);
 assert.match(sql,/pg_catalog\.pg_auth_members/);
 assert.match(sql,/pg_catalog\.pg_depend/);
 assert.match(sql,/pg_catalog\.pg_stat_activity/);
 assert.match(sql,/reviewed_identity_link_count/);
 assert.match(sql,/function_definition_digest/);
 assert.match(sql,/security_definer_count/);
 assert.match(sql,/other_database_sessions/);
 assert.doesNotMatch(sql,/^\s*(?:BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|CALL|DO|COPY)\b/im);
 assert.ok(sql.trim().endsWith(";"));
});

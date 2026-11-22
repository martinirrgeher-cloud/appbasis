import test from "node:test";
import assert from "node:assert/strict";
import {evaluateNeonOwnerRoleGrant} from "./ulc-linz-k2-neon-role-auto-grant-gate.mjs";
const observed=[{
 role:"ulc_linz_k2_object_owner",
 member:"ulc_linz_k2_restore_owner",
 grantor:"cloud_admin",
 admin_option:true,inherit_option:false,set_option:false,
}];
test("real Neon PG18 grant is BLOCK until a new explicit exception",()=>{
 const result=evaluateNeonOwnerRoleGrant({observedMemberships:observed});
 assert.equal(result.status,"BLOCK");
 assert.deepEqual(result.failures,["NEON_CLOUD_ADMIN_AUTO_GRANT_REQUIRES_NEW_APPROVAL"]);
 assert.equal(result.databaseWriteAuthorized,false);
});
test("even explicit review cannot trigger SQL, merge, deployment or app release",()=>{
 const result=evaluateNeonOwnerRoleGrant({
  observedMemberships:observed,explicitOperatorExceptionApproved:true,
  exactK2TargetVerified:true,independentlyVerifiedRollbackCheckpoint:true,
 });
 assert.equal(result.status,"ADMIN_ONLY_AUTO_GRANT_REVIEWED_NOT_AUTHORIZED");
 for(const k of ["databaseWriteAuthorized","mergeAuthorized","deployAuthorized","appRestoreReady"])
  assert.equal(result[k],false,k);
});
test("wrong grantor, runtime membership, SET/INHERIT or absent checkpoint BLOCK",()=>{
 for(const v of [
  [],[...observed,...observed],
  [{...observed[0],grantor:"unexpected"}],
  [{...observed[0],member:"appbasis_ulc_linz_preview_application"}],
  [{...observed[0],set_option:true}],
  [{...observed[0],inherit_option:true}],
  [{...observed[0],admin_option:false}],
 ]){
  assert.equal(evaluateNeonOwnerRoleGrant({
   observedMemberships:v,explicitOperatorExceptionApproved:true,
   exactK2TargetVerified:true,independentlyVerifiedRollbackCheckpoint:true,
  }).status,"BLOCK");
 }
 assert.equal(evaluateNeonOwnerRoleGrant({
  observedMemberships:observed,explicitOperatorExceptionApproved:true,
  exactK2TargetVerified:true,independentlyVerifiedRollbackCheckpoint:false,
 }).status,"BLOCK");
});

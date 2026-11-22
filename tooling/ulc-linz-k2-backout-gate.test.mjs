import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewK2Backout,K2_BACKOUT_TARGET} from "./ulc-linz-k2-backout-gate.mjs";

const now="2026-11-17T21:00:00.000Z";
const snapshot={
 id:"snap-current-k2-prewrite",
 source_branch_id:K2_BACKOUT_TARGET.branchId,
 name:"k2-prewrite",manual:true,created_at:"2026-11-17T20:55:00.000Z",
 expires_at:"2026-11-24T21:00:00.000Z"
};
const input=(overrides={})=>({
 projectId:K2_BACKOUT_TARGET.projectId,
 branchId:K2_BACKOUT_TARGET.branchId,
 databases:[...K2_BACKOUT_TARGET.branchDatabases],
 snapshots:[snapshot],
 selectedSnapshotId:snapshot.id,
 nowIso:now,
 ...overrides,
});
test("current real Neon inventory has no snapshot of K2 (not a substitute)",()=>{
 const result=reviewK2Backout(input({
  snapshots:[{id:"snap-ancient-voice-b1y0mz7b",
   source_branch_id:"br-delicate-surf-b1eu6ikn",manual:true,created_at:"2026-11-08T13:42:40Z"}]
 }));
 assert.equal(result.status,"BLOCK");
 assert.deepEqual(result.failures,["SELECTED_SNAPSHOT_NOT_FOUND"]);
 assert.equal(result.dbWriteAuthorized,false);
});
test("fresh correct snapshot only allows metadata review, never writes",()=>{
 const result=reviewK2Backout(input());
 assert.equal(result.status,"SNAPSHOT_METADATA_MATCH_ONLY");
 assert.equal(result.k2SnapshotVerified,true);
 assert.equal(result.snapshotRestorationActuallyTested,false);
 for(const key of ["restoreToCurrentBranchAllowed","finalizeAllowed","dbWriteAuthorized",
  "mergeAuthorized","deployAuthorized","appReady"])assert.equal(result[key],false,key);
 assert.equal(result.branchWideRollbackAffectsThreeDatabases,true);
});
test("reject wrong branch, wrong 3-db set, absent snapshot, stale and expiring snapshots",()=>{
 const cases=[
  [{projectId:"wrong-project"},"WRONG_TARGET_BRANCH"],
  [{branchId:"br-delicate-surf-b1eu6ikn"},"WRONG_TARGET_BRANCH"],
  [{databases:["ulc_linz_k2_restore_quarantine"]},"BRANCH_DATABASE_SET_CHANGED"],
  [{databases:[]},"BRANCH_DATABASE_SET_CHANGED"],
  [{databases:[...K2_BACKOUT_TARGET.branchDatabases,"otherdb"]},"BRANCH_DATABASE_SET_CHANGED"],
  [{snapshots:undefined},"SNAPSHOT_INVENTORY_UNAVAILABLE"],
  [{snapshots:[]},"SELECTED_SNAPSHOT_NOT_FOUND"],
  [{selectedSnapshotId:""},"NO_EXPLICIT_K2_SNAPSHOT_SELECTED"],
  [{nowIso:"invalid"},"NOW_UNVERIFIED"],
  [{snapshots:[{...snapshot,source_branch_id:"br-delicate-surf-b1eu6ikn"}]},"SNAPSHOT_FROM_OTHER_BRANCH"],
  [{snapshots:[{...snapshot,manual:false}]},"SNAPSHOT_NOT_MANUAL"],
  [{snapshots:[{...snapshot,created_at:"2026-11-17T18:00:00.000Z"}]},"SNAPSHOT_STALE_OR_UNDATED"],
  [{snapshots:[{...snapshot,created_at:"2026-11-17T22:00:00.000Z"}]},"SNAPSHOT_STALE_OR_UNDATED"],
  [{snapshots:[{...snapshot,expires_at:"2026-11-17T21:30:00.000Z"}]},"SNAPSHOT_EXPIRES_TOO_SOON"],
 ];
 for(const [override,code] of cases){
  const result=reviewK2Backout(input(override));
  assert.equal(result.status,"BLOCK",code);
  assert.deepEqual(result.failures,[code]);
  assert.equal(result.dbWriteAuthorized,false);
 }
});
test("snapshot duplicates and malformed inputs do not pass",()=>{
 assert.equal(reviewK2Backout().status,"BLOCK");
 assert.equal(reviewK2Backout(input({snapshots:[snapshot,snapshot]})).status,"BLOCK");
 assert.equal(reviewK2Backout(input({snapshots:[null]})).status,"BLOCK");
});
test("backout gate is offline-only, no Neon/provider calls and never finalizes",()=>{
 const code=readFileSync(new URL("./ulc-linz-k2-backout-gate.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(code,/\bfetch\s*\(|\.query\(|\.unsafe\(|\bexec\s*\(/);
 assert.doesNotMatch(code,/"node:(?:net|tls|http|https|child_process)"/);
 assert.match(code,/restoreToCurrentBranchAllowed:false/);
 assert.match(code,/finalizeAllowed:false/);
});

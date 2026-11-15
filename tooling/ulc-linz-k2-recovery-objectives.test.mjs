import test from "node:test";
import assert from "node:assert/strict";
import { evaluateK2RecoveryObjectives as check } from "./ulc-linz-k2-recovery-objectives.mjs";
const ok = {
  now:"2026-11-15T04:00:00Z", recoveryPointAt:"2026-11-15T03:00:00Z",
  sourceSnapshotAt:"2026-11-15T02:59:00Z", restoreStartedAt:"2026-11-15T03:10:00Z",
  restoreFinishedAt:"2026-11-15T03:25:00Z", rpoMinutes:120, rtoMinutes:30,
  sourceVerified:true,restoreVerified:true,mediaVerified:true,
  roleAndRlsVerified:true,evidenceIndependent:true,
};
test("synthetic full evidence permits only human review",()=>{
 const r=check(ok);assert.equal(r.status,"READY_FOR_HUMAN_REVIEW");
 for(const k of ["productionReady","enableBackupAuthorized","restoreAuthorized","deployAuthorized"]) assert.equal(r[k],false);
});
test("missing each control blocks",()=>{
 for(const k of ["sourceVerified","restoreVerified","mediaVerified","roleAndRlsVerified","evidenceIndependent"]) {
  const r=check({...ok,[k]:false});assert.equal(r.status,"BLOCK");assert.ok(r.failures.length);
 }
});
test("RPO age beyond objective blocks",()=>assert.ok(check({...ok,recoveryPointAt:"2026-11-15T00:00:00Z",sourceSnapshotAt:"2026-11-14T23:59:00Z",restoreStartedAt:"2026-11-15T00:10:00Z"}).failures.includes("RPO_EXCEEDED")));
test("RTO duration beyond objective blocks",()=>assert.ok(check({...ok,restoreStartedAt:"2026-11-15T03:00:00Z",restoreFinishedAt:"2026-11-15T03:50:00Z"}).failures.includes("RTO_EXCEEDED")));
test("equal objective boundary passes",()=>{
 const r=check({...ok,rpoMinutes:60,rtoMinutes:15});assert.equal(r.status,"READY_FOR_HUMAN_REVIEW");
});
test("invalid or future chronology rejects",()=>{
 for(const patch of [
  {now:"2026-11-15T02:00:00Z"}, {sourceSnapshotAt:"2026-11-15T03:01:00Z"},
  {restoreStartedAt:"2026-11-15T02:00:00Z"}, {restoreFinishedAt:"2026-11-15T03:05:00Z"},
  {restoreFinishedAt:"2026-11-15T05:00:00Z"}
 ])assert.throws(()=>check({...ok,...patch}));
});
test("timezone offsets and noncanonical dates rejected",()=>{
 for(const value of ["2026-11-15T04:00:00+01:00","2026-02-30T04:00:00Z","2026-11-15","bad",null]) assert.throws(()=>check({...ok,now:value}));
});
test("missing or invalid objectives rejected",()=>{
 for(const value of [undefined,0,-1,1.5,Infinity,525601]) assert.throws(()=>check({...ok,rpoMinutes:value}));
});
test("no default approval from undefined evidence",()=>{
 const r=check({...ok,sourceVerified:undefined,mediaVerified:undefined});
 assert.equal(r.status,"BLOCK");assert.equal(r.productionReady,false);
});

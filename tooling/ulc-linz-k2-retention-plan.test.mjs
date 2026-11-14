import test from "node:test";
import assert from "node:assert/strict";
import { planK2Retention, K2_RETENTION_STATUS } from "./ulc-linz-k2-retention-plan.mjs";

const db = "appbasis_ulc_linz_preview";
const key = day => `appbasis/ulc-linz/pilot/db/${db}/daily/${day}.tar.aesgcm`;
const item = (day, extra = {}) => ({
  key: key(day), lastModified: day + "T01:00:00.000Z",
  verified: true, restoreTested: true, legalHold: false, ...extra,
});
const evaluate = (objects, extra = {}) => planK2Retention({
  databaseName: db, now: new Date("2026-11-15T12:00:00.000Z"), objects, ...extra,
});
test("never grants deletion or claims provider policy", () => {
  const result = evaluate([item("2026-10-01"), item("2026-10-02"), item("2026-11-14")]);
  assert.equal(result.status, K2_RETENTION_STATUS);
  assert.equal(result.dryRun, true);
  assert.equal(result.deleteAuthorized, false);
  assert.equal(result.inventoryComplete, false);
  assert.equal(result.providerLifecycleConfigured, false);
  assert.equal(result.candidates, 1);
  assert.deepEqual(result.entries.map(x=>x.decision), ["REVIEW_ONLY","KEEP","KEEP"]);
});
test("never drops the two newest verified recoverable copies", () => {
  const result = evaluate([item("2026-09-01"),item("2026-09-02"),item("2026-09-03")]);
  assert.equal(result.candidates, 1);
  assert.equal(result.entries[1].reason,"MINIMUM_RECOVERY_COPIES");
  assert.equal(result.entries[2].reason,"MINIMUM_RECOVERY_COPIES");
});
test("insufficient verified copies is fail closed", () => {
  const result = evaluate([item("2026-09-01"),item("2026-09-02",{restoreTested:false})]);
  assert.equal(result.candidates,0);
  assert.equal(result.entries[0].reason,"INSUFFICIENT_VERIFIED_COPIES");
});
test("legal and restore holds cannot become candidates", () => {
  const a=item("2026-09-01");
  const b=item("2026-09-02");
  const c=item("2026-09-03");
  const d=item("2026-09-04");
  const result=evaluate([a,b,c,d],{legalHoldKeys:[a.key],restoreReferencedKeys:[b.key]});
  assert.equal(result.candidates,0);
  assert.equal(result.entries[0].reason,"LEGAL_OR_RESTORE_HOLD");
  assert.equal(result.entries[1].reason,"LEGAL_OR_RESTORE_HOLD");
});
test("unknown hold status is not treated as false", () => {
  const result=evaluate([item("2026-09-01",{legalHold:undefined}),item("2026-09-02"),item("2026-09-03")]);
  assert.equal(result.candidates,0);
  assert.equal(result.entries[0].reason,"UNKNOWN_HOLD_STATUS");
});
test("out-of-scope and malformed keys are retained", () => {
  const result=evaluate([
    { ...item("2026-09-01"),key:"appbasis/other/pilot/db/foo/daily/2026-09-01.tar.aesgcm" },
    { ...item("2026-09-01"),key:key("2026-02-30") },
    item("2026-09-02"),item("2026-09-03"),
  ]);
  assert.equal(result.candidates,0);
  assert.equal(result.entries[0].reason,"OUT_OF_SCOPE");
  assert.equal(result.entries[1].reason,"INVALID_KEY");
});
test("duplicates, unknown provider timestamps, and future timestamps are retained", () => {
  const a=item("2026-09-01");
  const result=evaluate([a,a,item("2026-09-02",{lastModified:"invalid"}),item("2026-12-01"),item("2026-09-03")]);
  assert.equal(result.candidates,0);
  assert.equal(result.entries[1].reason,"DUPLICATE_INVENTORY");
  assert.equal(result.entries[2].reason,"UNVERIFIED_PROVIDER_TIMESTAMP");
  assert.equal(result.entries[3].reason,"INCONSISTENT_TIMESTAMP");
});
test("age uses lastModified and the exact UTC cutoff, not only the key date", () => {
  const result=evaluate([
    item("2026-09-01",{lastModified:"2026-11-14T00:00:00.000Z"}),
    item("2026-10-01"),item("2026-10-02"),item("2026-11-14"),
  ]);
  assert.equal(result.candidates,1);
  assert.equal(result.entries[0].reason,"WITHIN_RETENTION");
});
test("rejects malformed policy and inventory arguments", () => {
  assert.throws(()=>evaluate([],{days:0}),/window/);
  assert.throws(()=>evaluate([],{minimumRecoverableCopies:1}),/two/);
  assert.throws(()=>evaluate(null),/arrays/);
  assert.throws(()=>planK2Retention({databaseName:"neondb",objects:[],now:"2026-11-15"}),/evaluation time/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateK2RestoreEvidence as evaluate } from "./ulc-linz-k2-restore-evidence.mjs";
const hex = "a".repeat(64);
const snapshot = () => ({
  sourceGitSha: "b".repeat(40), backupKeyDigest: hex, quarantine: true,
  tables: [{ name: "user", rows: 5, digest: hex }, { name: "appbasis_athlete", rows: 3, digest: hex }],
  schema: Object.fromEntries(["columns", "indexes", "constraints", "sequences", "rls"].map(k => [k, hex])),
});
const controls = () => ({
  sourceEndpointDistinct: true, quarantineUnrouted: true, noLiveWrites: true,
  mediaRestoreVerified: true, legalRetentionApproved: true, deletionReconciliationVerified: true,
  roleChecks: true, rlsChecks: true,
  appChecks: Object.fromEntries(["identity", "permissions", "athletes", "training", "attendance", "catalog", "audit"].map(k => [k, true])),
});
const sample = () => ({ source: snapshot(), restored: snapshot(), controls: controls() });
test("complete synthetic evidence yields review only, never automatic promotion", () => {
  assert.deepEqual(evaluate(sample()), { decision: "READY_FOR_HUMAN_REVIEW", reason: "offline evidence complete; no deployment authorization" });
});
test("missing evidence blocks", () => assert.equal(evaluate({}).decision, "BLOCK"));
test("data count or digest mismatch blocks", () => {
  for (const field of ["rows", "digest"]) {
    const e = sample(); e.restored.tables[0][field] = field === "rows" ? 6 : "c".repeat(64);
    assert.equal(evaluate(e).decision, "BLOCK");
  }
});
test("missing and duplicate table blocks", () => {
  const e = sample(); e.restored.tables.pop(); assert.equal(evaluate(e).decision, "BLOCK");
  const d = sample(); d.restored.tables[1].name = "user"; assert.equal(evaluate(d).decision, "BLOCK");
});
test("schema or provenance drift blocks", () => {
  const e = sample(); e.restored.schema.rls = "c".repeat(64); assert.equal(evaluate(e).decision, "BLOCK");
  const p = sample(); p.restored.sourceGitSha = "c".repeat(40); assert.equal(evaluate(p).decision, "BLOCK");
});
test("isolation or live write uncertainty blocks", () => {
  for (const k of ["sourceEndpointDistinct", "quarantineUnrouted", "noLiveWrites"]) {
    const e = sample(); e.controls[k] = false; assert.equal(evaluate(e).decision, "BLOCK");
  }
});
test("media, legal and deletion proof remain mandatory", () => {
  for (const k of ["mediaRestoreVerified", "legalRetentionApproved", "deletionReconciliationVerified"]) {
    const e = sample(); delete e.controls[k]; assert.equal(evaluate(e).decision, "BLOCK");
  }
});
test("role and RLS checks cannot be inferred from pg_restore", () => {
  for (const k of ["roleChecks", "rlsChecks"]) {
    const e = sample(); e.controls[k] = false; assert.equal(evaluate(e).decision, "BLOCK");
  }
});
test("each app module check must be explicit", () => {
  for (const k of Object.keys(controls().appChecks)) {
    const e = sample(); delete e.controls.appChecks[k]; assert.equal(evaluate(e).decision, "BLOCK");
  }
});
test("malformed hashes, names and negative rows block", () => {
  const e = sample(); e.source.tables[0].rows = -1; assert.equal(evaluate(e).decision, "BLOCK");
  const f = sample(); f.source.tables[0].name = "../secret"; assert.equal(evaluate(f).decision, "BLOCK");
  const g = sample(); g.source.backupKeyDigest = "secret"; assert.equal(evaluate(g).decision, "BLOCK");
});

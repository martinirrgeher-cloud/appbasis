import test from "node:test";
import assert from "node:assert/strict";
import { planK2Retention } from "./ulc-linz-k2-retention-plan.mjs";
import { reconcileK2PrivateMedia } from "./ulc-linz-k2-media-inventory.mjs";
import { evaluateK2RestoreEvidence } from "./ulc-linz-k2-restore-evidence.mjs";
import { evaluateK2RecoveryObjectives } from "./ulc-linz-k2-recovery-objectives.mjs";
import { checkIntegrationInventory, EXPECTED, EXPECTED_HEADS, EXPECTED_BASE_SHA, EXPECTED_FILES } from "./ulc-linz-k2-pr-integration.mjs";

// This test intentionally imports source from SIX separate pinned draft heads.
// The CI stages allowlisted files in an ephemeral checkout without git merge,
// database access, provider authentication, or a production deployment.
const hex = "a".repeat(64);
const snapshot = () => ({
  sourceGitSha: "b".repeat(40), backupKeyDigest: hex, quarantine: true,
  tables: [{ name: "user", rows: 5, digest: hex }],
  schema: Object.fromEntries(["columns","indexes","constraints","sequences","rls"].map(k => [k,hex])),
});
const appChecks = () => Object.fromEntries(
  ["identity","permissions","athletes","training","attendance","catalog","audit"].map(k => [k,true]),
);
const controls = () => ({
  sourceEndpointDistinct: true, quarantineUnrouted: true, noLiveWrites: true,
  mediaRestoreVerified: true, legalRetentionApproved: true,
  deletionReconciliationVerified: true, roleChecks: true, rlsChecks: true,
  appChecks: appChecks(),
});
const recovery = () => ({
  evidenceRecordedAt:"2026-11-15T04:00:00Z",
  incidentAt:"2026-11-15T03:00:00Z",
  recoveryPointAt:"2026-11-15T02:45:00Z",
  sourceSnapshotAt:"2026-11-15T02:44:00Z",
  restoreStartedAt:"2026-11-15T03:05:00Z",
  restoreFinishedAt:"2026-11-15T03:20:00Z",
  serviceVerifiedAt:"2026-11-15T03:40:00Z",
  rpoMinutes:30, rtoMinutes:60,
  sourceVerified:true, restoreVerified:true, mediaVerified:true,
  roleAndRlsVerified:true, appAndRoutingVerified:true,
  humanAcceptanceVerified:true, evidenceIndependent:true,
});
const combined = () => ({
  source:snapshot(), restored:snapshot(), controls:controls(),
});

test("cross-package: retention NEVER implies deletion permission", () => {
  const db = "appbasis_ulc_linz_preview";
  const object = day => ({
    key:"appbasis/ulc-linz/pilot/db/" + db + "/daily/" + day + ".tar.aesgcm",
    lastModified:day + "T01:00:00Z",verified:true,restoreTested:true,legalHold:false,
  });
  const r = planK2Retention({
    databaseName:db,objects:[object("2026-09-01"),object("2026-09-02"),object("2026-09-03")],
    now:new Date("2026-11-15T12:00:00Z"),
  });
  assert.equal(r.candidates,1);
  assert.equal(r.deleteAuthorized,false);
  assert.equal(r.providerLifecycleConfigured,false);
});
test("cross-package: exact R2 inventory parity NEVER substitutes for actual media restore", () => {
  const media = [{ key:"exercise-catalog/ulc-linz/exercise-1/media-1",size:20,sha256:hex }];
  const m = reconcileK2PrivateMedia({
    metadata:media,objects:[...media],metadataSnapshot:"fence",
    objectSnapshot:"fence",versionFenceVerified:true,
  });
  assert.equal(m.verified,true);
  assert.equal(m.mediaRestoreVerified,false);
  const e=combined();
  e.controls.mediaRestoreVerified=m.mediaRestoreVerified;
  assert.equal(evaluateK2RestoreEvidence(e).decision,"BLOCK");
});
test("cross-package: SQL snapshot parity cannot substitute for role/RLS authorization", () => {
  const e=combined();
  e.controls.rlsChecks=false;
  assert.equal(evaluateK2RestoreEvidence(e).decision,"BLOCK");
  const r=evaluateK2RecoveryObjectives({...recovery(),roleAndRlsVerified:false});
  assert.equal(r.status,"BLOCK");
});
test("cross-package: legal retention authorization is independent of backup recovery", () => {
  const e=combined();
  e.controls.legalRetentionApproved=false;
  assert.equal(evaluateK2RestoreEvidence(e).decision,"BLOCK");
  assert.equal(evaluateK2RecoveryObjectives(recovery()).productionReady,false);
});
test("cross-package: fast database restore cannot misrepresent end-to-end RTO", () => {
  const r=evaluateK2RecoveryObjectives({...recovery(),serviceVerifiedAt:"2026-11-15T03:50:00Z",rtoMinutes:45});
  assert.equal(r.databaseRestoreMinutes,15);
  assert.equal(r.endToEndRecoveryMinutes,50);
  assert.equal(r.status,"BLOCK");
});
test("cross-package: full synthetic gates allow HUMAN REVIEW ONLY, never automatic go-live", () => {
  const restored=evaluateK2RestoreEvidence(combined());
  const rto=evaluateK2RecoveryObjectives(recovery());
  assert.equal(restored.decision,"READY_FOR_HUMAN_REVIEW");
  assert.equal(rto.status,"READY_FOR_HUMAN_REVIEW");
  assert.equal(rto.productionReady,false);
  assert.equal(rto.deployAuthorized,false);
  assert.equal(rto.enableBackupAuthorized,false);
});
test("cross-package: pinned six HEADs and same main base must all be present", () => {
  const fixture={pullRequests: EXPECTED.map(number=>({
    number,base:"main",baseSha:EXPECTED_BASE_SHA,draft:true,merged:false,mergeable:true,
    sha:EXPECTED_HEADS[number],files:[...EXPECTED_FILES[number]],
    checks:[{status:"completed",conclusion:"success",headSha:EXPECTED_HEADS[number]}],
  }))};
  assert.equal(checkIntegrationInventory(fixture).status,"READY_FOR_HUMAN_REVIEW");
  fixture.pullRequests[0].baseSha="c".repeat(40);
  assert.equal(checkIntegrationInventory(fixture).status,"BLOCK");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  ULC_PRODUCTION_ONBOARDING_SQL,
  evaluateUlcProductionOnboarding as evaluate,
  formatUlcProductionOnboardingSummary as format,
} from "./ulc-linz-production-onboarding-readonly.mjs";

const baseline = Object.freeze({
  tables: 69,
  trainingFences: 3,
  documentationFences: 2,
  activeGroups: 0,
  activeTrainers: 0,
  activeAthletes: 0,
  trainerGroupLinks: 0,
  activeTrainerLogins: 1,
  activeAdminLogins: 0,
  technicalAdmins: 1,
  eligibleTrainerCandidates: 0,
  sessions: 0,
  catalogItems: 0,
  trainingBlocks: 0,
  privateMediaMetadata: 0,
});
const ready = Object.freeze({
  ...baseline,
  activeGroups: 3, activeTrainers: 2, activeAthletes: 6,
  trainerGroupLinks: 4, eligibleTrainerCandidates: 1,
  catalogItems: 8, trainingBlocks: 2,
});
test("ULC: current real 69-table technical admin exists, but missing trainer/group/athlete and write actor block onboarding", () => {
  const result = evaluate(baseline);
  assert.equal(result.status, "ONBOARDING_BLOCKED");
  assert.deepEqual(result.blockers, [
    "GROUPS_NOT_INITIALIZED", "TRAINERS_OR_GROUP_ASSIGNMENTS_MISSING",
    "ATHLETES_NOT_INITIALIZED", "NO_ELIGIBLE_TRAINER_WRITE_CANDIDATE",
  ]);
  assert.equal(result.counts.technicalAdmins, 1);
  assert.equal(result.counts.eligibleTrainerCandidates, 0);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(result.productionWritesAuthorized, false);
  assert.equal(result.liveWorkerBindingsVerified, false);
  assert.equal(result.privateMediaBackupVerified, false);
  assert.ok(Object.isFrozen(result.blockers));
  assert.ok(Object.isFrozen(result.counts));
  const summary = format(result);
  assert.match(summary, /ONBOARDING_BLOCKED/);
  assert.match(summary, /Technischer Administrator.*1/);
  assert.doesNotMatch(summary, /secret|passwort|pg_conn|uuid|identity_id|email/i);
});
test("ULC: populated baseline is still review-required, never a deployment or privacy approval", () => {
  const result = evaluate(ready);
  assert.equal(result.status, "ONBOARDING_BASELINE_PRESENT_REVIEW_REQUIRED");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(result.moduleSmokePassed, false);
  assert.equal(result.crossOwnerRestoreVerified, false);
  assert.deepEqual(result.warnings, ["PRIVATE_MEDIA_PROVIDER_INVENTORY_NOT_VERIFIED"]);
});
test("ULC: missing admin or malformed schema blocks even with active coaches and groups", () => {
  for (const change of [
    { technicalAdmins: 0 }, { technicalAdmins: 2 },
    { tables: 68 }, { trainingFences: 2 }, { documentationFences: 1 },
    { eligibleTrainerCandidates: 0 },
  ]) {
    const result = evaluate({ ...ready, ...change });
    assert.equal(result.status, "ONBOARDING_BLOCKED");
    assert.ok(result.blockers.length > 0);
  }
});
test("ULC: existing media metadata flags unverified media scope, no fake backup PASS", () => {
  const result = evaluate({ ...ready, privateMediaMetadata: 1 });
  assert.deepEqual(result.warnings, ["REAL_PRIVATE_MEDIA_BACKUP_NOT_VERIFIED"]);
  assert.equal(result.privateMediaBackupVerified, false);
});
test("ULC: extra keys, floats, negative, missing fields and personal rows fail closed", () => {
  for (const wrong of [
    null, [], {}, { ...ready, activeGroups: -1 },
    { ...ready, activeTrainers: NaN },
    { ...ready, activeAthletes: 2.5 },
    { ...ready, technicalAdmins: undefined },
    { ...ready, email: "sensitive@example.org" },
    Object.fromEntries(Object.entries(ready).filter(([k]) => k !== "sessions")),
  ]) assert.throws(() => evaluate(wrong), /counters missing/);
});
test("ULC: only aggregate constant SELECT and safe GitHub workflow without writes or user values", () => {
  assert.match(ULC_PRODUCTION_ONBOARDING_SQL, /^SELECT jsonb_build_object\(/);
  assert.match(ULC_PRODUCTION_ONBOARDING_SQL, /eligibleTrainerCandidates/);
  assert.match(ULC_PRODUCTION_ONBOARDING_SQL, /technicalAdmins/);
  assert.match(ULC_PRODUCTION_ONBOARDING_SQL, /appbasis_permission_principal_revoke/);
  assert.doesNotMatch(ULC_PRODUCTION_ONBOARDING_SQL, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|GRANT|ALTER|DROP|CREATE)\s+(?:TABLE|INTO|FROM|ON|ROLE)/i);
  assert.doesNotMatch(ULC_PRODUCTION_ONBOARDING_SQL, /SELECT\s+(?:\*|email|name|identity_id)\s+FROM/i);
  const workflow = readFileSync(
    new URL("../.github/workflows/ulc-linz-production-onboarding-preflight.yml", import.meta.url), "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: ulc-linz-k2-backup/);
  assert.match(workflow, /default_transaction_read_only=on/);
  assert.match(workflow, /ulc-linz-k2-backup-plan\.mjs source/);
  assert.match(workflow, /ulc-linz-production-onboarding-readonly\.mjs sql/);
  assert.match(workflow, /ulc-linz-production-onboarding-readonly\.mjs assess/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(workflow, /aws s3api (?:put|delete)|wrangler deploy|neonctl|pg_restore|pg_dump/);
});
test("ULC: CLI safely prints only blockers, never source-input identity strings", () => {
  const output = execFileSync(
    process.execPath, [new URL("./ulc-linz-production-onboarding-readonly.mjs", import.meta.url).pathname, "assess"],
    { input: JSON.stringify(baseline), encoding: "utf8" },
  );
  const result = JSON.parse(output);
  assert.equal(result.status, "ONBOARDING_BLOCKED");
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(Object.hasOwn(result, "counts"), false);
  assert.equal(Object.hasOwn(result, "name"), false);
});

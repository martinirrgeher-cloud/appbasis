import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

import {
  validateG04V17StagedPrivacyContracts,
  validateG04V17MigrationEvidence,
  verifyG04V17ActivationReadiness,
  G04V17ReadinessError,
} from "./ulc-linz-g04-v17-activation-readiness.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const files = [
  "m5-data-inventory.json", "m5-export-contract.json",
  "m5-data-inventory.v17-proposed.json", "m5-export-contract.v17-proposed.json",
  "g04-v17-calendar-inventory-proposal.json", "g04-v17-preview-activation-evidence.json",
].map((name) => resolve(root, "apps/ulc-linz/privacy", name));
const load = async () => {
  const records = await Promise.all(files.map((path) => readFile(path, "utf8")));
  const [v16Inventory,v16Export,v17Inventory,v17Export,proposal,evidence] =
    records.map((raw) => JSON.parse(raw));
  return { v16Inventory,v16Export,v17Inventory,v17Export,proposal,evidence,
    canonicalOwner: ULC_LINZ_LIFECYCLE_DATABASE_OWNER };
};
const copy = (x) => structuredClone(x);

test("G-04.2d v17 proposals classify exactly 66 tables while canonical v16 stays 64", async () => {
  const input = await load();
  assert.equal(input.v16Inventory.persistentTables.length,64);
  assert.equal(input.v16Export.excludedTables.length,62);
  assert.equal(input.canonicalOwner.schemaVersion,16);
  assert.equal(input.canonicalOwner.migrations.length,16);
  const v = validateG04V17StagedPrivacyContracts(input);
  assert.deepEqual(v, {
    schemaVersion:17, persistentTables:66, excludedCalendarTables:2,
    classification:"staged-not-active", controllerApprovalRequired:true,
  });
  assert.equal(input.v17Export.excludedPrivacyClasses.at(-1),
    "training-calendar-configuration");
  assert.equal(input.v17Inventory.staging.activation,"blocked");
  assert.equal(input.v17Export.staging.activation,"blocked");
});

test("G-04.2d denies missing, mislabeled, exported, duplicate or premature v17 tables", async () => {
  const original=await load();
  const mutated=[
    (x)=>x.v17Inventory.persistentTables.pop(),
    (x)=>x.v17Inventory.persistentTables.push(copy(x.v17Inventory.persistentTables.at(-1))),
    (x)=>x.v17Inventory.persistentTables.at(-1).privacyClass="trainer-master-data",
    (x)=>x.v17Inventory.persistentTables.at(-1).retentionPolicy="indefinite",
    (x)=>x.v17Inventory.persistentTables[0].privacyClass="unexpected",
    (x)=>x.v17Export.excludedTables.pop(),
    (x)=>x.v17Export.excludedTables.at(-1).table="some_other_table",
    (x)=>x.v17Export.datasets[0].sourceTables.push(x.v17Export.excludedTables.at(-1)),
    (x)=>x.v17Export.excludedPrivacyClasses.pop(),
    (x)=>x.v17Inventory.persistentOwners.find(o=>o.id==="ulc-linz-lifecycle").schemaVersion=16,
    (x)=>x.v17Inventory.staging.activation="enabled",
    (x)=>x.v17Export.staging.controllerApproval="approved",
    (x)=>x.canonicalOwner={...x.canonicalOwner,schemaVersion:17},
  ];
  for (const change of mutated) {
    const x=copy(original);
    change(x);
    assert.throws(()=>validateG04V17StagedPrivacyContracts(x),
      G04V17ReadinessError);
  }
});

const NOW = new Date("2026-11-08T12:00:00.000Z");
const evidence = () => ({
  schemaVersion:1,application:"ulc-linz",
  environment:"generated-preview-ulc-linz",
  sourceDatabase:"appbasis_ulc_linz_preview",sourceSchemaVersion:16,
  targetSchemaVersion:17,status:"approved-for-isolated-preview-v17",
  privacyDecision:{
    status:"approved",
    controllerDecisionRef:"https://github.com/martinirrgeher-cloud/appbasis/issues/530#issuecomment-1000000001",
    retentionDecisionRef:"https://github.com/martinirrgeher-cloud/appbasis/issues/530#issuecomment-1000000002",
    exportDecisionRef:"https://github.com/martinirrgeher-cloud/appbasis/issues/530#issuecomment-1000000003",
  },
  preMigrationBackup:{
    status:"verified",evidenceRef:"https://github.com/martinirrgeher-cloud/appbasis/actions/runs/11111111",
    backupSha256:"a".repeat(64),completedAt:"2026-11-08T10:15:00Z",
    sourceDatabase:"appbasis_ulc_linz_preview",
  },
  isolatedRestore:{
    status:"verified",evidenceRef:"https://github.com/martinirrgeher-cloud/appbasis/actions/runs/22222222",
    verifiedBackupSha256:"a".repeat(64),completedAt:"2026-11-08T11:15:00Z",
    restoreDatabase:"appbasis_ulc_linz_g04_restore_rehearsal",
  },
  migrationAuthorization:{
    status:"approved",approvalRef:"https://github.com/martinirrgeher-cloud/appbasis/issues/530#issuecomment-1000000004",
  },
  productionApproved:false,
});

test("G-04.2d migration evidence defaults blocked: no real snapshot or restore is asserted", async () => {
  const x=await load();
  assert.equal(x.evidence.status,"blocked-pending-independent-operator-evidence");
  assert.equal(x.evidence.privacyDecision.status,"pending");
  assert.equal(x.evidence.preMigrationBackup.status,"pending");
  assert.equal(x.evidence.isolatedRestore.status,"pending");
  assert.equal(x.evidence.migrationAuthorization.status,"pending");
  assert.throws(()=>validateG04V17MigrationEvidence(x.evidence,{now:NOW}),
    G04V17ReadinessError);
  await assert.rejects(verifyG04V17ActivationReadiness({repositoryRoot:root,now:NOW}),
    G04V17ReadinessError);
});

test("G-04.2d evidence parser accepts complete metadata but does not claim backup verification", () => {
  assert.deepEqual(validateG04V17MigrationEvidence(evidence(),{now:NOW}),{
    status:"metadata-ready-requires-independent-source-verification",
    environment:"generated-preview-ulc-linz",
    schemaVersion:17,
    productionApproved:false,
  });
});

test("G-04.2d rejects wrong target, missing controller, stale, unmatched or unverified recovery", () => {
  const invalid=[
    (x)=>x.environment="production",
    (x)=>x.productionApproved=true,
    (x)=>x.privacyDecision.status="pending",
    (x)=>x.privacyDecision.retentionDecisionRef=null,
    (x)=>x.preMigrationBackup.status="pending",
    (x)=>x.preMigrationBackup.completedAt="2026-11-06T10:15:00Z",
    (x)=>x.preMigrationBackup.backupSha256="bad",
    (x)=>x.isolatedRestore.verifiedBackupSha256="b".repeat(64),
    (x)=>x.isolatedRestore.restoreDatabase=x.sourceDatabase,
    (x)=>x.isolatedRestore.completedAt="2026-11-08T09:15:00Z",
    (x)=>x.isolatedRestore.evidenceRef=x.preMigrationBackup.evidenceRef,
    (x)=>x.migrationAuthorization.status="pending",
    (x)=>x.migrationAuthorization.approvalRef=null,
    (x)=>x.preMigrationBackup.completedAt="2026-11-09T10:15:00Z",
  ];
  for (const change of invalid) {
    const data=evidence();
    change(data);
    assert.throws(()=>validateG04V17MigrationEvidence(data,{now:NOW}),
      G04V17ReadinessError);
  }
});

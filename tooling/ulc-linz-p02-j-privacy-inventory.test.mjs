import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const json=async path=>JSON.parse(await readFile(
  new URL("../"+path,import.meta.url),"utf8"));

test("P02-J privacy/export release candidates classify all 69 schema tables once without approving retention",async()=>{
  const [v17,e17,inv,exp,manifest]=await Promise.all([
    json("apps/ulc-linz/privacy/m5-data-inventory.v17-proposed.json"),
    json("apps/ulc-linz/privacy/m5-export-contract.v17-proposed.json"),
    json("apps/ulc-linz/release/p02-j-m5-data-inventory.v18.candidate.json"),
    json("apps/ulc-linz/release/p02-j-m5-export-contract.v18.candidate.json"),
    json("apps/ulc-linz/release/p02-j-appbasis.database.v18.candidate.json"),
  ]);
  assert.equal(v17.persistentTables.length,66);
  assert.equal(e17.excludedTables.length,64);
  assert.equal(inv.persistentTables.length,69);
  assert.equal(exp.excludedTables.length,67);
  assert.deepEqual(inv.persistentTables.slice(0,66),v17.persistentTables,
    "preserve all previously classified records unchanged");
  assert.deepEqual(exp.excludedTables.slice(0,64),e17.excludedTables);
  assert.deepEqual(inv.persistentOwners,manifest.owners);
  assert.deepEqual(exp.datasets,e17.datasets);
  assert.deepEqual(exp.runtimeModules,e17.runtimeModules);
  assert.deepEqual(exp.credentialFieldNames,e17.credentialFieldNames);
  assert.deepEqual(exp.canonicalFormat,e17.canonicalFormat);

  const added=inv.persistentTables.slice(66);
  assert.deepEqual(added.map(x=>x.id),[
    "appbasis_exercise_catalog_favorite_deletion",
    "appbasis_exercise_catalog_usage_subject",
    "ulc_linz_training_subject_deletion",
  ]);
  assert.deepEqual(exp.excludedTables.slice(64),
    added.map(x=>({owner:x.owner,table:x.id,privacyClass:x.privacyClass})));
  for(const item of added){
    assert.equal(item.retentionPolicy.includes("pending"),true);
    assert.equal(item.deletionEvidence.startsWith("fail-closed-"),true);
    assert.equal(item.retentionEvidence.startsWith("fail-closed-"),true);
  }
  assert.equal(inv.staging.controllerApproval,"pending");
  assert.equal(inv.staging.allOwnerRestoreApproval,"pending");
  assert.equal(inv.staging.activation,"blocked");
  assert.equal(inv.staging.productionReady,false);
  assert.equal(exp.staging.controllerApproval,"pending");
  assert.equal(exp.staging.activation,"blocked");
  assert.equal(exp.staging.productionReady,false);
  assert.equal(inv.scope,"staged-v18-release-candidate-not-approved-or-active");

  function key(owner,id){return owner+":"+id;}
  const declared=inv.persistentTables.map(t=>key(t.owner,t.id));
  const excluded=exp.excludedTables.map(t=>key(t.owner,t.table));
  const exported=exp.datasets.flatMap(d=>d.sourceTables.map(t=>key(t.owner,t.table)));
  assert.equal(new Set(declared).size,69);
  assert.equal(new Set([...excluded,...exported]).size,69);
  assert.deepEqual([...declared].sort(),[...excluded,...exported].sort());
  assert.equal(exported.length,2);
  assert.equal(excluded.length,67);
  assert.equal(exp.excludedPrivacyClasses.includes("training-usage-subject-attribution"),true);
});

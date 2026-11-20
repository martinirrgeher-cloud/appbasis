import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateUlcP3ReleaseFromRepository,
  evaluateUlcP3ReleaseInventory,
  formatUlcP3ReleaseInventory,
} from "./ulc-linz-p3-release-inventory.mjs";

const root=resolve(new URL("../",import.meta.url).pathname);
const read=async path=>JSON.parse(await readFile(new URL("../"+path,import.meta.url),"utf8"));
async function fixtures(){
  const sources=await Promise.all([
    "apps/ulc-linz/appbasis.database.json",
    "apps/ulc-linz/privacy/m5-data-inventory.json",
    "apps/ulc-linz/privacy/p01-operator-retention-candidate.json",
    "apps/ulc-linz/appbasis.production.json",
    "apps/ulc-linz/privacy/m5-provider-compliance-inventory.json",
    "apps/ulc-linz/privacy/athlete-deletion-recovery-policy.json",
  ].map(read));
  const ids=["countdown","athletes","exercise-catalog","training-blocks","training-plans","training-documentation"];
  const modules=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await read("modules/"+id+"/appbasis.production.json")])));
  const [manifest,inventory,historicalP01,app,provider,recovery]=sources;
  return {manifest,inventory,historicalP01,app,modules,provider,recovery};
}
test("P3-D current source gives exactly 69 tables, 44 migrations and eight owners, distinct from historic P01",async()=>{
  const result=await evaluateUlcP3ReleaseFromRepository(root);
  assert.equal(result.currentTables,69);
  assert.equal(result.declaredMigrations,44);
  assert.equal(result.declaredOwners,8);
  assert.equal(result.historicalP01Tables,66);
  assert.deepEqual(result.additionalSinceP01,[
    "appbasis_exercise_catalog_favorite_deletion",
    "appbasis_exercise_catalog_usage_subject",
    "ulc_linz_training_subject_deletion",
  ]);
  assert.equal(result.byOwner.reduce((a,r)=>a+r.tableCount,0),69);
  assert.deepEqual(result.blockedModules,["exercise-catalog","training-blocks","training-documentation"]);
  assert.deepEqual(result.blockedCrossCutting,["applicationLifecycle","privacy"]);
  assert.equal(result.providerAccountEvidence,"open");
});
test("even an otherwise complete local report cannot issue deployment, production data or retention authorization",async()=>{
  const result=await evaluateUlcP3ReleaseFromRepository(root);
  assert.equal(result.fullPersonalDataRelease,"BLOCKED");
  assert.equal(result.isolatedTechnicalPilot,"OPERATOR_APPROVAL_REQUIRED");
  for(const key of ["permitsMerge","permitsDeployment","permitsProductionData","permitsRetentionPurge"])
    assert.equal(result[key],false);
  assert.equal(Object.isFrozen(result),true);
  const text=formatUlcP3ReleaseInventory(result);
  assert.match(text,/historischer 66-Tabellen-Vorschlag/);
  assert.match(text,/69 Tabellen \/ 8 Daten-Owner \/ 44 Migrationen/);
  assert.match(text,/App mit echten Personen-\/Kinderdaten \| \*\*BLOCKED\*\*/);
  assert.match(text,/ohne neue Echtdaten/);
  assert.doesNotMatch(text,/passwort|secret|password|token\s*=/i);
});
test("a newly introduced untracked table or missing canonical owner fails closed",async()=>{
  const a=await fixtures();
  a.inventory.persistentTables.pop();
  assert.throws(()=>evaluateUlcP3ReleaseInventory(a),/current 69-table/);
  const b=await fixtures();
  b.manifest.owners.pop();
  assert.throws(()=>evaluateUlcP3ReleaseInventory(b),/all eight canonical data owners/);
});
test("no silent reinterpretation of the old 66-table operator proposal as current legal policy",async()=>{
  const a=await fixtures();
  a.historicalP01.legalApproval=true;
  assert.throws(()=>evaluateUlcP3ReleaseInventory(a),/historical/);
  const b=await fixtures();
  b.historicalP01.runtimeActive=true;
  assert.throws(()=>evaluateUlcP3ReleaseInventory(b),/historical/);
  const c=await fixtures();
  c.historicalP01.tableGroups[0].tables.push("invented_table");
  assert.throws(()=>evaluateUlcP3ReleaseInventory(c),/historical/);
});
test("missing provider scope, shortened source authority and introduced object storage never pass",async()=>{
  const a=await fixtures();
  a.provider.providerScope[0].appSpecificProductionEvidence="verified";
  assert.equal(evaluateUlcP3ReleaseInventory(a).providerAccountEvidence,"open");
  const bad=await fixtures();
  bad.provider.providerScope.pop();
  assert.throws(()=>evaluateUlcP3ReleaseInventory(bad),/provider account/);
  const b=await fixtures();
  b.recovery.currentSourceAuthority.markerRetentionDays=70;
  assert.throws(()=>evaluateUlcP3ReleaseInventory(b),/35-day/);
  const c=await fixtures();
  c.inventory.objectStorage.status="configured";
  assert.throws(()=>evaluateUlcP3ReleaseInventory(c),/private-media/);
});
test("missing app module or unexpected module reference cannot be declared ready",async()=>{
  const a=await fixtures();
  a.app.modules.pop();
  assert.throws(()=>evaluateUlcP3ReleaseInventory(a),/all six module/);
  const b=await fixtures();
  delete b.modules["training-documentation"];
  assert.throws(()=>evaluateUlcP3ReleaseInventory(b),/all six module/);
});

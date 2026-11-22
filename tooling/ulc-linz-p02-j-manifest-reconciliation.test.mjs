import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildUlc69ManifestProposal,
  classifyUlc69ManifestState,
  loadUlc69ManifestProposal,
  NEW_MIGRATIONS,
  SOURCE_CANDIDATES,
  ULC69_CATALOG_SQL,
} from "./ulc-linz-p02-j-manifest-reconciliation.mjs";

async function source(path){
  return readFile(new URL("../"+path,import.meta.url),"utf8");
}
async function json(path){return JSON.parse(await source(path));}

const baseline=Object.freeze({
  public_tables:66,
  calendar_rule_exists:true,
  calendar_exception_exists:true,
  catalog_marker_exists:false,
  catalog_attribution_exists:false,
  catalog_attribution_index_exists:false,
  training_marker_exists:false,
  training_fence_function_exists:false,
  installed_fence_triggers:0,
  active_fence_triggers:0,
  app_can_access_training_marker:false,
});
const ready=Object.freeze({
  ...baseline,public_tables:69,
  catalog_marker_exists:true,
  catalog_attribution_exists:true,
  catalog_attribution_index_exists:true,
  training_marker_exists:true,
  training_fence_function_exists:true,
  installed_fence_triggers:3,
  active_fence_triggers:3,
});

test("P1 publishes 44 owner migrations while retaining original review candidates",async()=>{
  const manifest=await json("apps/ulc-linz/appbasis.database.json");
  const module=await json("modules/exercise-catalog/appbasis.module.json");
  const appCandidate=await json("apps/ulc-linz/release/p02-j-appbasis.database.v18.candidate.json");
  const modCandidate=await json("apps/ulc-linz/release/p02-j-exercise-catalog.v5.candidate.json");
  const planned=await loadUlc69ManifestProposal();
  assert.equal(manifest.owners.flatMap(owner=>owner.migrations).length,47);
  const blocks=manifest.owners.find(owner=>owner.id==="training-blocks");
  assert.equal(blocks.schemaVersion,7);
  assert.equal(blocks.migrations.at(-1),
    "modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql");
  assert.equal(manifest.owners.find(owner=>owner.id==="ulc-linz-lifecycle").schemaVersion,19);
  assert.equal(manifest.owners.find(owner=>owner.id==="exercise-catalog").schemaVersion,6);
  assert.equal(module.database.schemaVersion,6);
  assert.deepEqual(appCandidate,planned.app);
  assert.deepEqual(modCandidate,planned.module);
  assert.equal(planned.expectedTables,69);
  assert.equal(planned.proposedMigrations,44);
  assert.equal(planned.candidateOnly,false);
  assert.equal(planned.published,true);
  assert.equal(planned.mayApplyToExistingPreview,false);
  assert.equal(planned.providerWritesAllowed,false);

  const currentFiles=manifest.owners.flatMap(owner=>owner.migrations);
  const originalFiles=planned.app.owners.flatMap(owner=>owner.migrations);
  const targetFiles=appCandidate.owners.flatMap(owner=>owner.migrations);
  assert.equal(currentFiles.length,47);
  assert.deepEqual(currentFiles.filter(path=>originalFiles.includes(path)),originalFiles);
  assert.deepEqual(targetFiles.filter(path=>originalFiles.includes(path)),originalFiles);
  assert.deepEqual(targetFiles,originalFiles);
  assert.deepEqual(targetFiles.filter(path=>Object.values(NEW_MIGRATIONS).includes(path)).sort(),
    Object.values(NEW_MIGRATIONS).sort());
  assert.equal(appCandidate.owners.find(o=>o.id==="ulc-linz-lifecycle").schemaVersion,18);
  assert.equal(appCandidate.owners.find(o=>o.id==="exercise-catalog").schemaVersion,5);
  assert.equal(modCandidate.database.migrations.length,5);
  assert.equal(new Set(targetFiles).size,44);
  for(const [kind,path] of Object.entries(SOURCE_CANDIDATES)){
    const sql=await source(path);
    assert.match(sql,/CREATE (?:TABLE|FUNCTION)/i,kind+" source DDL");
    if(kind!=="calendar")assert.match(sql,/CANDIDATE|REVIEW ONLY/i);
  }
  for(const [kind,path] of Object.entries(NEW_MIGRATIONS)){
    assert.equal(originalFiles.includes(path),true,kind+" must be registered");
  }
});

test("P02-J rejects unexpected upstream manifest edits instead of guessing a version",async()=>{
  const app=await json("apps/ulc-linz/appbasis.database.json");
  const module=await json("modules/exercise-catalog/appbasis.module.json");
  for(const altered of [
    {...app,application:"other"},
    {...app,owners:app.owners.slice(1)},
    {...app,owners:app.owners.map(o=>o.id==="ulc-linz-lifecycle"?{...o,schemaVersion:17}:o)},
    {...app,owners:app.owners.map(o=>o.id==="exercise-catalog"?{...o,migrations:[...o.migrations,NEW_MIGRATIONS.catalog]}:o)},
  ])assert.throws(()=>buildUlc69ManifestProposal(altered,module),/BLOCKED/);
  assert.throws(()=>buildUlc69ManifestProposal(app,{
    ...module,database:{...module.database,schemaVersion:4},
  }),/BLOCKED/);
});

test("P02-J classifies strict 66 and 69, forbids replay even on complete installation",()=>{
  const a=classifyUlc69ManifestState(baseline);
  assert.deepEqual(a,{
    state:"preview-66-requires-reviewed-upgrade",
    alreadyInstalled:false,automaticSqlReplayAllowed:false,productionReady:false,
  });
  const b=classifyUlc69ManifestState(ready);
  assert.deepEqual(b,{
    state:"preview-69-already-installed",
    alreadyInstalled:true,automaticSqlReplayAllowed:false,productionReady:false,
  });
  for(const changed of [
    {public_tables:68},{public_tables:64},{public_tables:70},
    {training_marker_exists:false},{catalog_marker_exists:false},
    {catalog_attribution_exists:false},{catalog_attribution_index_exists:false},
    {calendar_rule_exists:false},{calendar_exception_exists:false},
    {training_fence_function_exists:false},
    {installed_fence_triggers:2},{active_fence_triggers:2},
    {active_fence_triggers:0},{active_fence_triggers:4},
    {app_can_access_training_marker:true},{public_tables:"69"},
    {calendar_rule_exists:null},
  ]){
    assert.throws(()=>classifyUlc69ManifestState({...ready,...changed}),/BLOCKED/);
  }
  assert.throws(()=>classifyUlc69ManifestState(null),/BLOCKED/);
  assert.throws(()=>classifyUlc69ManifestState({}),/BLOCKED/);
  assert.throws(()=>classifyUlc69ManifestState({
    ...baseline,training_marker_exists:true,
  }),/BLOCKED/);
});

test("P02-J inventory probe queries only pg catalog and effective privileges",()=>{
  assert.match(ULC69_CATALOG_SQL,/^SELECT/m);
  assert.match(ULC69_CATALOG_SQL,/pg_catalog\.pg_trigger/);
  assert.match(ULC69_CATALOG_SQL,/trigger|fence/);
  assert.match(ULC69_CATALOG_SQL,/tgenabled IN/);
  assert.match(ULC69_CATALOG_SQL,/tgfoid=to_regprocedure/);
  assert.match(ULC69_CATALOG_SQL,/has_table_privilege\(current_user/);
  const structure=ULC69_CATALOG_SQL.replace(/'(?:''|[^'])*'/g,"''")
    .replace(/--[^\n]*/g,"");
  assert.doesNotMatch(structure,/\b(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
});

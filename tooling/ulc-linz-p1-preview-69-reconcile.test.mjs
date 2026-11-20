import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertUlcPreview69ReconcileRows,
  verifyUlcPreview69ReconcileCredentials,
  UlcPreview69ReconcileError,
} from "./ulc-linz-p1-preview-69-reconcile.mjs";

const metadata=Object.freeze({
  public_tables:69,
  calendar_rule_exists:true,calendar_exception_exists:true,
  catalog_marker_exists:true,catalog_attribution_exists:true,
  catalog_attribution_index_exists:true,
  training_marker_exists:true,training_fence_function_exists:true,
  installed_fence_triggers:3,active_fence_triggers:3,
  app_can_access_training_marker:false,
});
const principal=Object.freeze([{
  database_name:"appbasis_ulc_linz_preview",
  principal_name:"appbasis_ulc_linz_preview_application",
}]);
test("P1 accepts precisely the complete Preview 69 state, without migration replay",()=>{
  assert.deepEqual(assertUlcPreview69ReconcileRows(principal,[metadata]),{
    status:"preview-69-already-installed",
    schemaTables:69,migrationSqlApplied:false,
    workerDeploymentApproved:false,productionApproved:false,
  });
});
test("P1 rejects production, incomplete schema, disabled fences, and marker rights",()=>{
  for(const p of [
    null,[],[{database_name:"neondb",principal_name:"ulc_linz_application"}],
    [{database_name:"appbasis_ulc_linz_preview",principal_name:"appbasis_ulc_linz_preview_migration"}],
    [...principal,...principal],
  ]) assert.throws(()=>assertUlcPreview69ReconcileRows(p,[metadata]),UlcPreview69ReconcileError);
  for(const drift of [
    {public_tables:66},{public_tables:68},{public_tables:70},
    {training_marker_exists:false},{catalog_marker_exists:false},
    {catalog_attribution_index_exists:false},{calendar_rule_exists:false},
    {installed_fence_triggers:2},{active_fence_triggers:2},
    {app_can_access_training_marker:true},
  ]) assert.throws(()=>assertUlcPreview69ReconcileRows(principal,[{...metadata,...drift}]),UlcPreview69ReconcileError);
  assert.throws(()=>assertUlcPreview69ReconcileRows(principal,[]),UlcPreview69ReconcileError);
});
test("P1 rejects unauthenticated/mismatched DB credentials without connecting",()=>{
  for(const input of [
    undefined,{},{migrationDatabaseUrl:"postgres://wrong",applicationDatabaseUrl:"postgres://wrong",securityLogDatabaseUrl:"postgres://wrong"},
    {migrationDatabaseUrl:"postgresql://ulc_linz_application:any@localhost:5432/neondb?sslmode=require"},
  ]) assert.throws(()=>verifyUlcPreview69ReconcileCredentials(input),UlcPreview69ReconcileError);
});

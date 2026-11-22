import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewK2Checkpoint,K2_CHECKPOINT} from "./ulc-linz-k2-checkpoint-branch-gate.mjs";

function evidence() {
 const ownerNames={
  appbasis_ulc_linz_preview:"appbasis_ulc_linz_preview_migration",
  neondb:"neondb_owner",
  ulc_linz_k2_restore_quarantine:"ulc_linz_k2_restore_owner",
 };
 const fingerprint={
  appbasis_ulc_linz_preview:{
   object_count:66,function_count:2,
   object_digest:"38ef655c74e565d1675899073cea373f",
   function_digest:"ec8530627eb6290f2eee7bb982fa4810",
  },
  neondb:{
   object_count:2,function_count:0,
   object_digest:"a789510860bbe7840b5768a941f1bc8c",
   function_digest:null,
  },
  ulc_linz_k2_restore_quarantine:{
   table_count:62,sequence_count:4,function_count:2,
   old_owner_relations:66,old_owner_functions:2,
   identity_link_count:4,reviewed_identity_link_count:4,
   function_definition_digest:"f096a8e6786da42145aa56c2a6e61d87",
   public_function_execute_count:0,app_function_execute_count:0,
   explicit_relation_acl_count:0,
   current_app_select_tables:0,current_backup_select_tables:0,
  }
 };
 return {
  projectId:K2_CHECKPOINT.projectId,
  sourceBranch:{id:K2_CHECKPOINT.source,name:K2_CHECKPOINT.sourceName,default:false,current_state:"ready"},
  checkpointBranch:{id:K2_CHECKPOINT.checkpoint,name:K2_CHECKPOINT.checkpointName,parent_id:K2_CHECKPOINT.source,parent_lsn:K2_CHECKPOINT.parentLsn,default:false,current_state:"ready"},
  sourceDbOwners:{...ownerNames},
  checkpointDbOwners:{...ownerNames},
  sourceCatalog:structuredClone(fingerprint),
  checkpointCatalog:structuredClone(fingerprint),
 };
}
test("validated child branch is a metadata-matched fallback, never a snapshot or release",()=>{
 const r=reviewK2Checkpoint(evidence());
 assert.equal(r.status,"CHECKPOINT_BRANCH_METADATA_MATCH_ONLY");
 assert.deepEqual(r.failures,[]);
 assert.equal(r.checkpointBranchId,"br-solitary-violet-b1advl8z");
 assert.equal(r.checkedDatabaseCount,3);
 assert.equal(r.checkpointCatalogMatch,true);
 for(const k of ["neonSnapshotCreated","externalBackupVerified",
  "independentRecoveryRehearsalComplete","sqlWriteAllowed",
  "restoreFinalizeAllowed","mergeAllowed","deployAllowed","appReady"])
  assert.equal(r[k],false,k);
});
test("wrong project, source, parent, checkpoint name, LSN or state always blocks",()=>{
 const edits=[
  x=>x.projectId="wrong-project",
  x=>x.sourceBranch.id="br-delicate-surf-b1eu6ikn",
  x=>x.sourceBranch.current_state="suspended",
  x=>x.checkpointBranch.parent_id="br-delicate-surf-b1eu6ikn",
  x=>x.checkpointBranch.id="br-another",
  x=>x.checkpointBranch.parent_lsn="0/123",
  x=>x.checkpointBranch.default=true,
  x=>x.checkpointBranch.current_state="init",
 ];
 for(const edit of edits){
  const x=evidence();edit(x);
  const result=reviewK2Checkpoint(x);
  assert.equal(result.status,"BLOCK");
  assert.equal(result.sqlWriteAllowed,false);
 }
});
test("different database name, owner or per-object privileges blocks",()=>{
 const edits=[
  x=>delete x.sourceDbOwners.neondb,
  x=>delete x.checkpointDbOwners.appbasis_ulc_linz_preview,
  x=>x.sourceDbOwners.neondb="other",
  x=>x.checkpointDbOwners.ulc_linz_k2_restore_quarantine="newowner",
  x=>delete x.checkpointCatalog.neondb,
  x=>x.sourceCatalog.appbasis_ulc_linz_preview.object_digest="different",
  x=>x.checkpointCatalog.neondb.object_count=3,
  x=>x.checkpointCatalog.ulc_linz_k2_restore_quarantine.current_app_select_tables=61,
  x=>x.sourceCatalog.ulc_linz_k2_restore_quarantine.public_function_execute_count=1,
 ];
 for(const edit of edits){
  const x=evidence();edit(x);
  const result=reviewK2Checkpoint(x);
  assert.equal(result.status,"BLOCK");
  assert.equal(result.sqlWriteAllowed,false);
 }
});
test("no provider access, destructive SQL or restore/finalize instructions are executable",()=>{
 const source=readFileSync(new URL("./ulc-linz-k2-checkpoint-branch-gate.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/(\bfetch\s*\(|\bexec\s*\(|\.query\s*\(|require\s*\()/);
 assert.doesNotMatch(source,/from\s+["']node:(?:child_process|http|https|net|tls)/);
 assert.match(source,/sqlWriteAllowed:\s*false/);
 assert.match(source,/restoreFinalizeAllowed:\s*false/);
 assert.match(source,/neonSnapshotCreated:\s*false/);
});

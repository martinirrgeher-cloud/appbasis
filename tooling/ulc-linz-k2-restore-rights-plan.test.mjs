import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { K2_ROLES, validateK2RestoreContract, planK2RestoreRights } from "./ulc-linz-k2-restore-rights-plan.mjs";

const file = readFileSync(new URL("./ulc-linz-k2-restore-privilege-contract.json", import.meta.url));
const EXPECTED_SOURCE_GIT_BLOB = "c9ca9fdc7280d4f6671515b6e6ddb7002636c2dc";
const blobHash = createHash("sha1").update("blob " + file.length + "\0").update(file).digest("hex");
const source = JSON.parse(file.toString("utf8"));
const copy = () => structuredClone(source);

test("read-only source contract exact Git blob was independently verified", () => {
  assert.equal(blobHash, EXPECTED_SOURCE_GIT_BLOB);
  assert.equal(source.capturedUtc,"2026-11-15");
  assert.equal(validateK2RestoreContract(copy()).privilegeEntries,329);
});

test("full real-source snapshot yields 68 owners and 329 non-owner grants in 146 groups", () => {
 const plan = planK2RestoreRights(copy());
 assert.equal(plan.status,"REVIEW_ONLY");
 assert.deepEqual(plan.counts,{
   objects:68,grantGroups:146,privilegeEntries:329,ownerStatements:68,
   applicationGrantStatements:64,securityIngestGrantStatements:16,backupGrantStatements:66,
 });
 assert.equal(plan.audited.objectCounts.table,62);
 assert.equal(plan.audited.objectCounts.sequence,4);
 assert.equal(plan.audited.objectCounts.function,2);
 for(const k of ["databaseWriteAuthorized","mergeAuthorized","deployAuthorized","restoreReady","productionReady"])
   assert.equal(plan[k],false);
 for(const phase of plan.phases)assert.equal(phase.completed,false);
 assert.equal(plan.targetDatabase,"ulc_linz_k2_restore_quarantine");
 assert.equal(plan.targetBranchMustBeIndependentlyConfirmed,true);
});

test("a dedicated NOLOGIN owner is proposed instead of privileging current BYPASSRLS owner",()=>{
 const plan=planK2RestoreRights(copy());
 assert.deepEqual(plan.isolatedOwnerProposal,{
   role:"ulc_linz_k2_object_owner",canLogin:false,createRole:false,
   createDb:false,superuser:false,bypassRls:false,inherit:false,
   reachableFromRuntimeRoles:false,
 });
 const changes=plan.phases[2].proposedStatements;
 assert.equal(changes.length,68);
 assert.equal(changes.filter(x=>x.startsWith("ALTER TABLE ")).length,62);
 assert.equal(changes.filter(x=>x.startsWith("ALTER SEQUENCE ")).length,4);
 assert.equal(changes.filter(x=>x.startsWith("ALTER FUNCTION ")).length,2);
 assert.ok(changes.every(x=>x.endsWith('OWNER TO "ulc_linz_k2_object_owner";')));
 assert.ok(changes.some(x=>x.includes('"appbasis_ulc_linz_purge_expired_security_events"()')));
 assert.ok(changes.every(x=>!x.includes('OWNER TO "ulc_linz_k2_restore_owner"')));
});

test("grants are strictly object-specific, no privileges to migration, public or function execute",()=>{
 const plan=planK2RestoreRights(copy());
 const lines=[...plan.phases[3].proposedStatements,...plan.phases[4].proposedStatements];
 assert.equal(lines.length,146);
 assert.ok(lines.every(x=>x.startsWith("GRANT ")));
 assert.ok(lines.every(x=>x.includes('"public"."') && x.endsWith(";")));
 assert.ok(lines.every(x=>!/\bALL\b|\bPUBLIC\b|\bEXECUTE\b|\bTRUNCATE\b|\bTRIGGER\b|\bREFERENCES\b/.test(x)));
 assert.ok(lines.every(x=>!x.includes(K2_ROLES.migration)));
 assert.ok(lines.every(x=>!x.includes(K2_ROLES.newOwner)));
 assert.ok(lines.every(x=>!x.includes("GRANT OPTION")));
 assert.ok(lines.every(x=>!x.includes("ON FUNCTION")));
 assert.ok(lines.every(x=>!x.includes("ulc_linz_k2_restore_owner")));
 assert.equal(new Set(lines).size,lines.length);
});

test("app has no security-event log table or column access; backup remains read only",()=>{
 const plan=planK2RestoreRights(copy());
 const app=plan.phases[3].proposedStatements;
 const security=plan.phases[4].proposedStatements.filter(x=>x.includes(K2_ROLES.security));
 const backup=plan.phases[4].proposedStatements.filter(x=>x.includes(K2_ROLES.backup));
 assert.equal(app.length,64);
 assert.ok(app.every(x=>!x.includes('"ulc_linz_security_event_log"')));
 assert.ok(security.every(x=>x.startsWith("GRANT INSERT (")||
   x==='GRANT USAGE ON SEQUENCE "public"."ulc_linz_security_event_log_id_seq" TO "appbasis_ulc_linz_preview_security_ingest";'));
 assert.ok(backup.every(x=>x.startsWith("GRANT SELECT ON ")));
 assert.ok(backup.every(x=>!x.includes("GRANT SELECT (")));
});

test("manifest tampering with unexpected role, privileges or object causes BLOCK",()=>{
 const cases=[
  s=>{s.grants[0].role="PUBLIC";},
  s=>{s.grants[0].role="appbasis_ulc_linz_preview_migration";},
  s=>{s.grants[0].privileges.push("DELETE");},
  s=>{s.grants[0].privileges.push("INSERT");},
  s=>{s.grants[0].object="ulc_linz_security_event_log.other;DROP ROLE r";},
  s=>{s.grants[0].object="another_table.id";},
  s=>{s.grants[0].kind="function";},
  s=>{s.grants[0].privileges=["EXECUTE"];},
  s=>{s.grants[0].privileges=[];},
  s=>{s.grants[0].privileges=["INSERT","INSERT"];},
  s=>{s.grants[0].role=K2_ROLES.backup;},
  s=>{s.grants[0].role=K2_ROLES.app;},
  s=>{s.objects[0].name="function(); DROP TABLE x";},
  s=>{s.objects[0].securityDefiner=false;},
  s=>{s.objects[0].kind="table";},
  s=>{s.expected.directNonOwnerPrivilegeEntries=330;},
  s=>{s.restoreDatabase="appbasis_ulc_linz_preview";},
  s=>{s.proposedQuarantineOwner="ulc_linz_k2_restore_owner";},
  s=>{s.grants.pop();},
  s=>{s.objects.pop();},
 ];
 for(const change of cases){const s=copy();change(s);assert.throws(()=>validateK2RestoreContract(s),/K2 restore plan blocked/);}
});

test("duplicate object/group or source privilege escalation fail",()=>{
 const first=copy();first.objects[1]={...first.objects[0]};
 assert.throws(()=>planK2RestoreRights(first),/duplicate/);
 const second=copy();second.grants[1]={...second.grants[0]};
 assert.throws(()=>planK2RestoreRights(second),/duplicate/);
 const third=copy();const app=third.grants.find(g=>g.role===K2_ROLES.app&&g.kind==="table");
 app.object="ulc_linz_security_event_log";
 assert.throws(()=>planK2RestoreRights(third),/security log|scope/);
});

test("plan functions have no provider or SQL execution code paths",()=>{
 const code=readFileSync(new URL("./ulc-linz-k2-restore-rights-plan.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(code,/from ["']node:(?:fs|http|https|net|tls|child_process)/);
 assert.doesNotMatch(code,/\.unsafe\(|\.query\(|\bfetch\s*\(/);
 assert.doesNotMatch(code,/^\s*(?:await\s+)?(?:runSql|executeSql|applyGrants)\(/m);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  K2_ROLES, K2_PRIVILEGES, K2_REVIEW_CONTROLS, evaluateK2ObjectAclDrift as check,
} from "./ulc-linz-k2-acl-object-drift.mjs";
const scopes = [
  { kind:"table", object:"public.sample_table", owner:"preview_owner" },
  { kind:"column", object:"public.ulc_linz_security_event_log.app_id", owner:"preview_owner" },
  { kind:"sequence", object:"public.sample_id_seq", owner:"preview_owner" },
  { kind:"routine", object:"public.appbasis_ulc_linz_purge_expired_security_events()", owner:"preview_owner", securityDefiner:true },
  { kind:"routine", object:"public.ulc_linz_registration_calendar_guard()", owner:"preview_owner" },
];
const expectedCounts = {table:1,column:1,sequence:1,routine:2};
const good = () => Object.fromEntries(K2_REVIEW_CONTROLS.map(k=>[k,true]));
function fixture() {
  const sourceRows = scopes.flatMap(scope => K2_ROLES.flatMap(role =>
    K2_PRIVILEGES[scope.kind].map(privilege=>({
      ...scope, role, privilege, securityDefiner:scope.securityDefiner ?? false,
      allowed:(scope.kind==="table" && role===K2_ROLES[1] && ["SELECT","INSERT","UPDATE","DELETE"].includes(privilege)) ||
        (scope.kind==="table" && role===K2_ROLES[3] && privilege==="SELECT") ||
        (scope.kind==="column" && role===K2_ROLES[2] && privilege==="INSERT") ||
        (scope.kind==="sequence" && role===K2_ROLES[1] && privilege==="USAGE"),
      rlsEnabled:false, rlsForced:false, policyCount:0,
    }))));
  return {sourceRows,restoredRows:sourceRows.map(r=>({...r})),expectedCounts,controls:good()};
}
function setAllRows(rows, pred, mutate) {
  for (const row of rows) if (pred(row)) mutate(row);
}
test("confirmed K2-shaped ACL loss and 2 PUBLIC function exposures are blocked",()=>{
  const f=fixture();
  f.restoredRows.forEach(r=>{
    r.owner="quarantine_owner";
    r.allowed = r.kind==="routine";
  });
  const res=check(f);
  assert.equal(res.status,"BLOCK");
  for(const code of ["OWNER_MAPPING_REQUIRES_APPROVAL","PUBLIC_FUNCTION_EXECUTE_UNREVIEWED",
    "PUBLIC_PROTECTED_ROUTINE_EXECUTE","UNAUTHORIZED_PRIVILEGE_ESCALATION",
    "REQUIRED_PRIVILEGE_MISSING"]) assert.ok(res.failures.includes(code),code);
  assert.equal(res.appRestoreAuthorized,false);
  assert.equal(res.grantAuthorized,false);
});
test("object identity and exact permission parity never grant automatic production rights",()=>{
  const r=check(fixture());
  assert.equal(r.status,"READY_FOR_HUMAN_REVIEW");
  assert.deepEqual(r.failures,[]);
  for(const key of ["appRestoreAuthorized","grantAuthorized","deployAuthorized","productionAuthorized"])
    assert.equal(r[key],false);
});
test("missing, false, or textual operator controls block",()=>{
  for(const key of K2_REVIEW_CONTROLS)for(const bad of [undefined,false,"true"]){
    const f=fixture();f.controls[key]=bad;
    assert.equal(check(f).status,"BLOCK",key);
  }
});
test("security-definer PUBLIC EXECUTE blocks regardless of whether source allowed it",()=>{
  const f=fixture();
  setAllRows(f.sourceRows,r=>r.kind==="routine"&&r.role==="PUBLIC",r=>{r.allowed=true;});
  setAllRows(f.restoredRows,r=>r.kind==="routine"&&r.role==="PUBLIC",r=>{r.allowed=true;});
  const result=check(f);
  assert.ok(result.failures.includes("PUBLIC_PROTECTED_ROUTINE_EXECUTE"));
});
test("a new PUBLIC function privilege is classified as escalation",()=>{
  const f=fixture();
  setAllRows(f.restoredRows,r=>r.kind==="routine"&&r.role==="PUBLIC",r=>{r.allowed=true;});
  assert.ok(check(f).failures.includes("UNAUTHORIZED_PRIVILEGE_ESCALATION"));
});
test("missing app table grant is detected",()=>{
  const f=fixture();
  setAllRows(f.restoredRows,r=>r.kind==="table"&&r.role===K2_ROLES[1]&&r.privilege==="SELECT",r=>{r.allowed=false;});
  assert.ok(check(f).failures.includes("REQUIRED_PRIVILEGE_MISSING"));
});
test("owner change requires review even if every privilege matches",()=>{
  const f=fixture();f.restoredRows.forEach(r=>r.owner="quarantine_owner");
  assert.ok(check(f).failures.includes("OWNER_MAPPING_REQUIRES_APPROVAL"));
});
test("security-definer and RLS policy drift cannot be silently ignored",()=>{
  const f=fixture();
  setAllRows(f.restoredRows,r=>r.kind==="routine"&&r.object.includes("purge_expired"),r=>{r.securityDefiner=false;});
  assert.ok(check(f).failures.includes("SECURITY_DEFINER_DRIFT"));
  const f2=fixture();
  setAllRows(f2.restoredRows,r=>r.kind==="table",r=>{r.rlsEnabled=true;r.policyCount=1;});
  assert.ok(check(f2).failures.includes("RLS_POLICY_DRIFT"));
});
test("RLS enabled without a policy is blocked separately",()=>{
  const f=fixture();
  setAllRows(f.restoredRows,r=>r.kind==="table",r=>{r.rlsEnabled=true;});
  assert.ok(check(f).failures.includes("RLS_ENABLED_WITHOUT_POLICY"));
});
test("duplicate records and incomplete per-object matrix fail closed",()=>{
  const f=fixture();
  f.restoredRows.push({...f.restoredRows[0]});
  assert.throws(()=>check(f),/duplicate/);
  const f2=fixture();f2.restoredRows.pop();
  assert.throws(()=>check(f2),/incomplete/);
});
test("missing object and unexpected object blocked even when counts match",()=>{
  const f=fixture();
  setAllRows(f.restoredRows,r=>r.kind==="table",r=>{r.object="public.rogue_table";});
  const res=check(f);
  assert.ok(res.failures.includes("MISSING_RESTORE_OBJECT"));
  assert.ok(res.failures.includes("UNEXPECTED_RESTORE_OBJECT"));
});
test("wrong object family scope fails, not a false PASS",()=>{
  const f=fixture();f.expectedCounts={...expectedCounts,table:62};
  assert.throws(()=>check(f),/scope/);
});
test("unsupported role, object/SQL, privilege, and malformed evidence rejected",()=>{
  for(const change of [
    {role:"superuser"},{object:"public.x;DROP TABLE y"},{privilege:"GRANT"},
    {allowed:"true"},{owner:"bad owner"},{securityDefiner:null},
    {rlsEnabled:"false"},{policyCount:-1},
  ]) {
    const f=fixture();Object.assign(f.restoredRows[0],change);
    assert.throws(()=>check(f),/invalid or unsafe/);
  }
  assert.throws(()=>check({}),/inventory/);
});
test("mixed object metadata and impossible forced RLS fail closed",()=>{
  const f=fixture();f.restoredRows[0].owner="different_owner";
  assert.throws(()=>check(f),/inconsistent/);
  const f2=fixture();
  setAllRows(f2.restoredRows,r=>r.kind==="table",r=>{r.rlsForced=true;});
  assert.throws(()=>check(f2),/invalid or unsafe/);
});
test("results expose reasons and aggregate counts, never raw object identifiers",()=>{
  const f=fixture();
  setAllRows(f.restoredRows,r=>r.kind==="routine"&&r.role==="PUBLIC",r=>{r.allowed=true;});
  const output=JSON.stringify(check(f));
  assert.doesNotMatch(output,/appbasis_ulc_linz_purge|sample_table|preview_owner/);
  assert.deepEqual(check(f).sourceObjectCounts,expectedCounts);
});
test("catalog inventory is a single read-only query with no data rows",()=>{
  const sql=readFileSync(new URL("./ulc-linz-k2-acl-object-readonly.sql",import.meta.url),"utf8");
  assert.match(sql,/pg_catalog\.pg_proc/);
  assert.match(sql,/pg_catalog\.pg_class/);
  assert.match(sql,/has_column_privilege/);
  assert.match(sql,/pg_catalog\.aclexplode/);
  assert.match(sql,/\bFROM inventory\b/);
  assert.doesNotMatch(sql,/^\s*(?:GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|CALL|DO|COPY)\b/im);
  assert.equal(sql.trim().endsWith(";"),true);
});

test("direct ACL inventory is a separate strictly read-only PostgreSQL catalog query",()=>{
  const sql=readFileSync(new URL("./ulc-linz-k2-acl-direct-readonly.sql",import.meta.url),"utf8");
  assert.match(sql,/\bpg_catalog\.aclexplode\(c\.relacl\)/);
  assert.match(sql,/\bpg_catalog\.aclexplode\(a\.attacl\)/);
  assert.match(sql,/\bpg_catalog\.aclexplode\(p\.proacl\)/);
  assert.match(sql,/\bpg_catalog\.pg_namespace\b/);
  assert.match(sql,/\bCOUNT\(\*\)/);
  assert.doesNotMatch(sql,/^\s*(?:GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|CALL|DO|COPY)\b/im);
  assert.equal(sql.trim().endsWith(";"),true);
});

test("unexecuted quarantine function-revoke candidate is strictly bounded",()=>{
  const sql=readFileSync(
    new URL("./ulc-linz-k2-quarantine-function-revoke-proposal.sql",import.meta.url),
    "utf8",
  );
  assert.match(sql,/NOT AUTHORIZED FOR EXECUTION/);
  assert.match(sql,/current_database\(\) <> 'ulc_linz_k2_restore_quarantine'/);
  assert.match(sql,/table_count <> 62/);
  assert.match(sql,/p\.prosecdef/);
  assert.match(sql,/unreviewed function grants/);
  assert.match(sql,/PUBLIC still has function EXECUTE/);
  assert.match(sql,/\bBEGIN;/);
  assert.match(sql,/\bCOMMIT;/);
  const statements=sql.split("\n").map(line=>line.trim()).filter(line=>/^REVOKE\b/.test(line));
  assert.deepEqual(statements,[
    "REVOKE EXECUTE ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() FROM PUBLIC;",
    "REVOKE EXECUTE ON FUNCTION public.ulc_linz_registration_calendar_guard() FROM PUBLIC;",
  ]);
  assert.doesNotMatch(sql,/^\s*(?:GRANT|ALTER|DROP|CREATE|TRUNCATE|INSERT|UPDATE|DELETE|CALL|COPY)\b/im);
  assert.doesNotMatch(sql,/^\s*REVOKE\s+(?!EXECUTE\s+ON\s+FUNCTION)/im);
  assert.doesNotMatch(sql,/DO\s*\$\$.*\bEXECUTE\b/si);
});

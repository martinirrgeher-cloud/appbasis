import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import test from "node:test";
import {
  diagnoseExactProductionHyperdrive,
  diagnoseExistingPrivateProductionRefresh,
  pilotOriginFingerprint,
} from "./ulc-linz-m6-reconciliation-audit.mjs";

const original = Object.freeze({scheme:"postgres",host:"ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",port:5432,database:"neondb",user:"ulc_linz_application",password:"never-print-this"});
const correct = Object.freeze({
  id:"hyperdrive-id-not-printed",name:"appbasis-ulc-linz-production-db",
  origin:{scheme:"postgresql",host:original.host,port:5432,database:"neondb",user:original.user,password:"must-never-appear"},
  caching:{disabled:true},
});
const evaluate=(configs)=>diagnoseExactProductionHyperdrive(configs,{name:correct.name,origin:original});

test("Hyperdrive diagnostic reports exact matched identity without provider credentials",()=>{
  const results=evaluate([correct]);
  assert.equal(results.length,8);
  assert.ok(results.every(r=>r.status==="PASS"));
  const output=JSON.stringify(results);
  for(const secret of [original.password,correct.origin.password,correct.origin.user,correct.origin.host,correct.id])
    assert.ok(!output.includes(secret),"leaked "+secret);
});
test("Hyperdrive diagnostic distinguishes missing, duplicate and malformed configurations",()=>{
  assert.equal(evaluate([])[0].detail,"Dedicated Hyperdrive is absent");
  assert.equal(evaluate([correct,correct])[0].detail,"Dedicated Hyperdrive is duplicated");
  const malformed=evaluate([{...correct,origin:null}]);
  assert.equal(malformed.find(x=>x.name==="Configuration and origin shape")?.status,"BLOCKED");
  assert.equal(diagnoseExactProductionHyperdrive(null,{name:correct.name,origin:original})[0].status,"BLOCKED");
});
test("Hyperdrive diagnostic gives individually actionable, sanitized drift signals",()=>{
  for(const [field,value,label] of [
    ["host","other.neon.tech","Exact direct Neon host"],
    ["port",6432,"Exact PostgreSQL port"],
    ["database","other_database","Exact database"],
    ["user","foreign_user","Exact dedicated SQL login role"],
    ["scheme","http","PostgreSQL scheme"],
  ]){
    const bad={...correct,origin:{...correct.origin,[field]:value}};
    const findings=evaluate([bad]);
    assert.equal(findings.find(x=>x.name===label)?.status,"BLOCKED",field);
    assert.ok(!JSON.stringify(findings).includes(String(value)),"provider value leaked: "+field);
  }
  const caching=evaluate([{...correct,caching:{disabled:false}}]);
  assert.equal(caching.find(x=>x.name==="Query cache disabled")?.status,"BLOCKED");
});
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const worker={name:"appbasis-ulc-linz-production",subdomain:{enabled:false,previews_enabled:false},references:{domains:[]},deployed_on:"2026-11-20"};
const secret="abcdefghijklmnopqrstuvwxyz0123456789EXAMPLE";
const fingerprint=pilotOriginFingerprint("appbasis-ulc-linz-production","example");
const digest=createHmac("sha256",secret).update("appbasis:ulc-linz:production:better-auth-secret:v1").digest("hex");
const oldSha="1".repeat(40),newSha="2".repeat(40);
const versions=[{id,annotations:{"workers/tag":"ulc-linz-production-runtime-v1",
  "workers/message":"AppBasis ulc-linz production runtime "+oldSha+" auth-hmac:"+digest+" origin-hmac:"+fingerprint}}];
const deployments={deployments:[{versions:[{version_id:id,percentage:100}]},...Array.from({length:9},()=>({versions:[{version_id:id,percentage:100}]}))]};
const scripts=[{id:"appbasis-ulc-linz-production",routes:[]}];
const check=(overrides={})=>diagnoseExistingPrivateProductionRefresh({
  worker,versions,deployments,scripts,githubSha:newSha,authSecret:secret,pilotOriginFingerprint:fingerprint,...overrides
});

test("already deployed closed Worker with 10 historical deployments is correctly treated as refresh candidate",()=>{
  const findings=check();
  assert.equal(findings[0].status,"PASS");
  assert.equal(findings[1].status,"WARN");
  assert.equal(findings[1].name,"Exact current main Worker version");
  assert.ok(!JSON.stringify(findings).includes(secret));
});
test("refresh preflight blocks public ingress, unexpected active version and authorization secret drift",()=>{
  assert.equal(check({worker:{...worker,subdomain:{enabled:true,previews_enabled:false}}})[0].status,"BLOCKED");
  assert.equal(check({deployments:{deployments:[{versions:[{version_id:id,percentage:60}]}]}})[0].status,"BLOCKED");
  assert.equal(check({authSecret:"z".repeat(40)})[0].status,"BLOCKED");
  assert.equal(check({scripts:[{id:worker.name,routes:["/public"]}]})[0].status,"BLOCKED");
  assert.equal(check({versions:[]})[0].status,"BLOCKED");
});
test("canonical pilot-origin digest is deterministic and refuses malformed account names",()=>{
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(pilotOriginFingerprint("appbasis-ulc-linz-production","example"),fingerprint);
  assert.throws(()=>pilotOriginFingerprint("appbasis-ulc-linz-production","UPPER CASE"));
});

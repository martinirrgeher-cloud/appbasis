import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { reconcileUlcLinzApplicationHyperdriveRole } from "./ulc-linz-m6-application-hyperdrive-role-reconcile.mjs";

const ACCOUNT="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WORKER="appbasis-ulc-linz-production";
const APP_HYPERDRIVE="appbasis-ulc-linz-production-db";
const HOST="ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const DB_URL="postgresql://ulc_linz_application:password-not-to-print@"+
  HOST+"/neondb?sslmode=require";
const base={
  accountId:ACCOUNT,apiToken:"write-token-secret",readToken:"read-token-secret",
  databaseUrl:DB_URL,
  confirmation:"RECONCILE-ULC-APPLICATION-HYPERDRIVE-ROLE",
  branchRef:"refs/heads/main",apply:true,
};
const response=(result,status=200)=>new Response(
  JSON.stringify({success:status===200,result}),
  {status,headers:{"content-type":"application/json"}},
);

function provider(overrides={}){
  let config={
    id:"app-hd-immutable-id",name:APP_HYPERDRIVE,
    origin:{scheme:"postgresql",host:HOST,port:5432,database:"neondb",user:"wrong_sql_role"},
    caching:{disabled:true},
  };
  if(overrides.config)config={...config,...overrides.config};
  let writes=0;
  const calls=[];
  const mock=async(url,options)=>{
    const u=new URL(url),method=options?.method??"GET";
    calls.push({path:u.pathname,method,token:options?.headers?.Authorization});
    if(method==="PUT"){
      writes++;
      if(overrides.failPut)return response(null,403);
      assert.equal(u.pathname.endsWith("/hyperdrive/configs/app-hd-immutable-id"),true);
      const payload=JSON.parse(options.body);
      assert.equal(payload.name,APP_HYPERDRIVE);
      assert.equal(payload.origin.user,"ulc_linz_application");
      assert.equal(payload.origin.password,"password-not-to-print");
      config={...config,origin:{...payload.origin},caching:payload.caching};
      return response(config);
    }
    assert.equal(method,"GET");
    if(u.pathname.endsWith("/workers/workers/"+WORKER)){
      return response({name:WORKER,subdomain:{enabled:overrides.publicWorker===true,previews_enabled:false},references:{domains:[]}});
    }
    if(u.pathname.endsWith("/workers/scripts/"+WORKER+"/deployments"))
      return response({deployments:[{versions:[{version_id:"id",percentage:100}]}]});
    if(u.pathname.endsWith("/workers/scripts"))
      return response([{id:WORKER,routes:overrides.publicRoute?["public"]:[]}]);
    if(u.pathname.endsWith("/hyperdrive/configs")){
      return response(overrides.duplicate?[config,config]:[config]);
    }
    throw new Error("Unexpected provider path "+u.pathname);
  };
  return {mock,calls,get writes(){return writes;}};
}

test("only one existing Application Hyperdrive PUT corrects the wrong SQL role and verifies GET readback",async()=>{
  const providerMock=provider();
  const result=await reconcileUlcLinzApplicationHyperdriveRole({...base,fetchImpl:providerMock.mock});
  assert.deepEqual(result,{status:"reconciled-and-verified",changed:true});
  assert.equal(providerMock.writes,1);
  assert.deepEqual(providerMock.calls.filter(x=>x.method==="PUT").map(x=>x.path),
    ["/client/v4/accounts/"+ACCOUNT+"/hyperdrive/configs/app-hd-immutable-id"]);
  assert.ok(providerMock.calls.filter(x=>x.method==="GET").every(x=>x.token==="Bearer read-token-secret"));
  assert.ok(providerMock.calls.filter(x=>x.method==="PUT").every(x=>x.token==="Bearer write-token-secret"));
  assert.equal(JSON.stringify(result).includes("password-not-to-print"),false);
});
test("correct role is idempotent and performs no provider writes",async()=>{
  const providerMock=provider({config:{origin:{
    scheme:"postgresql",host:HOST,port:5432,database:"neondb",user:"ulc_linz_application",
  }}});
  const result=await reconcileUlcLinzApplicationHyperdriveRole({...base,fetchImpl:providerMock.mock});
  assert.deepEqual(result,{status:"already-correct",changed:false});
  assert.equal(providerMock.writes,0);
});
test("refuses missing approval before any network request",async()=>{
  for(const override of [
    {apply:false},
    {confirmation:"WRONG"},
    {branchRef:"refs/heads/something-else"},
    {readToken:""},
    {apiToken:""},
    {databaseUrl:"postgresql://other:secret@example.test/neondb"},
  ]){
    const p=provider();
    await assert.rejects(
      reconcileUlcLinzApplicationHyperdriveRole({...base,...override,fetchImpl:p.mock}),
      /blocked by a protected prerequisite/,
    );
    assert.equal(p.calls.length,0);
  }
});
test("refuses unrelated origin drift and duplicates, no PUT",async()=>{
  for(const override of [
    {config:{origin:{scheme:"postgresql",host:"wrong.neon.tech",port:5432,database:"neondb",user:"wrong_sql_role"}}},
    {config:{caching:{disabled:false}}},
    {duplicate:true},
  ]){
    const p=provider(override);
    await assert.rejects(
      reconcileUlcLinzApplicationHyperdriveRole({...base,fetchImpl:p.mock}),
      /blocked by a protected prerequisite/,
    );
    assert.equal(p.writes,0);
  }
});
test("refuses any public Worker route or workers.dev ingress, no PUT",async()=>{
  for(const override of [{publicWorker:true},{publicRoute:true}]){
    const p=provider(override);
    await assert.rejects(
      reconcileUlcLinzApplicationHyperdriveRole({...base,fetchImpl:p.mock}),
      /blocked by a protected prerequisite/,
    );
    assert.equal(p.writes,0);
  }
});
test("write token must actually authorize PUT; permission failure is not hidden as success",async()=>{
  const p=provider({failPut:true});
  await assert.rejects(
    reconcileUlcLinzApplicationHyperdriveRole({...base,fetchImpl:p.mock}),
    /blocked by a protected prerequisite/,
  );
  assert.equal(p.writes,1);
});
test("workflow is manual, exact-confirmation and only runs on main without deployment",async()=>{
  const workflow=await readFile(
    new URL("../.github/workflows/m6-ulc-application-hyperdrive-role-reconcile.yml",import.meta.url),
    "utf8");
  const script=await readFile(
    new URL("./ulc-linz-m6-application-hyperdrive-role-reconcile.mjs",import.meta.url),
    "utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/RECONCILE-ULC-APPLICATION-HYPERDRIVE-ROLE/);
  assert.match(workflow,/environment: m4-dr/);
  assert.match(workflow,/secrets\.CLOUDFLARE_API_WRITE_TOKEN/);
  assert.match(workflow,/secrets\.ULC_LINZ_PRODUCTION_CLOUDFLARE_API_TOKEN/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow,/wrangler (?:deploy|versions deploy|versions upload)|contents: write/);
  assert.doesNotMatch(script,/method:\s*"(POST|DELETE|PATCH)"/);
  assert.match(script,/method: "PUT"/);
});

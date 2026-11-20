// Production M6 aggregated READ-ONLY diagnostic: prints no credentials, provider bodies or personal data.
import { createHmac, createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import {
  diagnoseExactProductionHyperdrive,
  diagnoseExistingPrivateProductionRefresh,
} from "./ulc-linz-m6-reconciliation-audit.mjs";
import {
  parseUlcLinzProductionDatabaseUrl,
  parseUlcLinzSecurityLogIngestDatabaseUrl,
  resolveUlcLinzProductionHyperdrive,
  resolveUlcLinzProductionSecurityLogHyperdrive,
} from "./ulc-linz-m6-production-hyperdrive.mjs";

const e = process.env, workerName = "appbasis-ulc-linz-production";
const rows = [];
const note = (area, name, state, reason = "") => rows.push({area,name,state,reason});
const required = [
  "CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN",
  "ULC_LINZ_PRODUCTION_DATABASE_URL","ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL",
  "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET"
];
for (const key of required) note("Initial secrets",key,e[key] ? "PASS" : "BLOCKED", e[key] ? "present" : "missing");

let app, log;
try { app = parseUlcLinzProductionDatabaseUrl(e.ULC_LINZ_PRODUCTION_DATABASE_URL); note("Database contract","Application URL","PASS"); }
catch { note("Database contract","Application URL","BLOCKED","wrong direct host, database or credential format"); }
try { log = parseUlcLinzSecurityLogIngestDatabaseUrl(e.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL); note("Database contract","Security ingest URL","PASS"); }
catch { note("Database contract","Security ingest URL","BLOCKED","wrong direct host, database or credential format"); }
if (app && log) note("Database contract","Distinct SQL roles",app.user !== log.user ? "PASS":"BLOCKED");
const auth = e.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET || "";
const authOk = auth.length >= 32 && auth.trim() === auth;
note("Auth","Better Auth secret shape",authOk ? "PASS":"BLOCKED");

const contract = JSON.parse(await readFile(new URL("../apps/ulc-linz/appbasis.production.json",import.meta.url),"utf8"));
note("Application","Production contract",contract.status==="ready"?"PASS":"BLOCKED","status="+contract.status);
for (const name of contract.modules) {
  const mod=JSON.parse(await readFile(new URL("../modules/"+name+"/appbasis.production.json",import.meta.url),"utf8"));
  note("Application module",name,mod.status==="ready"?"PASS":"BLOCKED","status="+mod.status);
}
for (const [name,state] of Object.entries(contract.crossCutting||{}))
  note("Application service",name,state==="verified"?"PASS":"BLOCKED","status="+state);

async function cfGet(name,path) {
  if (!e.CLOUDFLARE_ACCOUNT_ID || !e.CLOUDFLARE_API_TOKEN) {
    note("Cloudflare API",name,"BLOCKED","credentials missing");return null;
  }
  try {
    const u="https://api.cloudflare.com/client/v4/accounts/"+e.CLOUDFLARE_ACCOUNT_ID+path;
    const response=await fetch(u,{method:"GET",headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(18000)});
    if (!response.ok) {note("Cloudflare API",name,"BLOCKED","HTTP "+response.status);return null;}
    const data=await response.json();
    if (data?.success!==true) {note("Cloudflare API",name,"BLOCKED","provider response non-success");return null;}
    note("Cloudflare API",name,"PASS");
    return data.result;
  } catch {note("Cloudflare API",name,"BLOCKED","transport or response error");return null;}
}
const [subdomain,worker,versions,deployments,scripts,hyperdrives]=await Promise.all([
  cfGet("Account workers.dev subdomain","/workers/subdomain"),
  cfGet("Worker object","/workers/workers/"+workerName),
  cfGet("Worker versions","/workers/workers/"+workerName+"/versions?page=1&per_page=100"),
  cfGet("Worker deployments","/workers/scripts/"+workerName+"/deployments"),
  cfGet("Script and route inventory","/workers/scripts"),
  cfGet("All Hyperdrive configs (first page)","/hyperdrive/configs?page=1&per_page=100"),
]);
if(worker!==null) {
  note("Worker private state","Exact name",worker?.name===workerName?"PASS":"BLOCKED");
  note("Worker private state","workers.dev ingress disabled",worker?.subdomain?.enabled===false?"PASS":"BLOCKED",
    worker?.subdomain?.enabled===false?"disabled":"not confirmed disabled");
  note("Worker private state","Preview URLs disabled",worker?.subdomain?.previews_enabled===false?"PASS":"BLOCKED");
  const hasDeployed=Object.hasOwn(worker??{},"deployed_on");
  note("Worker private state","deployed_on explicitly null",hasDeployed&&worker.deployed_on===null?"PASS":"BLOCKED",
    !hasDeployed?"field absent":worker.deployed_on===null?"null":"non-null");
  const domains=worker?.references?.domains;
  note("Worker private state","No custom domains",Array.isArray(domains)&&domains.length===0?"PASS":"BLOCKED",
    "count="+(Array.isArray(domains)?domains.length:"invalid/missing"));
}
if(deployments!==null){
  const ds=deployments?.deployments;
  note("Worker private state","Zero existing deployments (initial path)",Array.isArray(ds)&&ds.length===0?"PASS":"BLOCKED",
    "count="+(Array.isArray(ds)?ds.length:"invalid/missing")+"; if already deployed inspect refresh path");
}
if(scripts!==null){
  const matches=Array.isArray(scripts)?scripts.filter(x=>x?.id===workerName):[];
  const routes=matches.length===1?matches[0].routes:null;
  note("Worker private state","No public worker routes",
    matches.length===1&&(routes==null||Array.isArray(routes)&&routes.length===0)?"PASS":"BLOCKED",
    "matchingWorkers="+matches.length+" routes="+(Array.isArray(routes)?routes.length:routes==null?"absent":"invalid"));
}
let originHash="";
if(typeof subdomain?.subdomain==="string" && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain.subdomain))
  originHash=createHash("sha256").update("https://"+workerName+"."+subdomain.subdomain+".workers.dev").digest("hex");
note("Worker version","Canonical pilot origin",originHash?"PASS":"BLOCKED");
if(versions!==null){
  if(!Array.isArray(versions))note("Worker version","Version list format","BLOCKED");
  else{
    const historical=/^AppBasis ulc-linz production runtime [0-9a-f]{40} auth-hmac:[0-9a-f]{64}(?: origin-hmac:[0-9a-f]{64})?$/;
    const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const recognized=versions.every(x=>id.test(x?.id??"")&&x?.annotations?.["workers/tag"]==="ulc-linz-production-runtime-v1"&&historical.test(x?.annotations?.["workers/message"]??""));
    note("Worker version","Recognized version history",recognized?"PASS":"BLOCKED","count="+versions.length);
    if(authOk&&originHash&&e.GITHUB_SHA){
      const digest=createHmac("sha256",auth).update("appbasis:ulc-linz:production:better-auth-secret:v1").digest("hex");
      const msg="AppBasis ulc-linz production runtime "+e.GITHUB_SHA+" auth-hmac:"+digest+" origin-hmac:"+originHash;
      const current=versions.filter(x=>x?.annotations?.["workers/message"]===msg).length;
      note("Worker version","Current-SHA prepared version",current>1?"BLOCKED":current===1?"PASS":"WARN",
        current===0?"not yet uploaded (configuration step creates it)":"matching="+current);
    }
  }
}
if(worker!==null&&versions!==null&&deployments!==null&&scripts!==null&&
   authOk&&originHash&&e.GITHUB_SHA){
  for(const check of diagnoseExistingPrivateProductionRefresh({
    worker,versions,deployments,scripts,githubSha:e.GITHUB_SHA,
    authSecret:auth,pilotOriginFingerprint:originHash,
  })) note("Existing Worker refresh path",check.name,check.status,check.detail);
}
if(hyperdrives!==null&&app&&log){
  // A 100-result first page may conceal later matching resources; do not claim absence.
  if(!Array.isArray(hyperdrives)||hyperdrives.length>=100){
    note("Hyperdrive diagnostics","Complete provider inventory","BLOCKED","Invalid or possibly truncated first page");
  }else{
    for(const [name,origin,label] of [
      ["appbasis-ulc-linz-production-db",app,"Application"],
      ["appbasis-ulc-linz-production-security-log",log,"Security log"],
    ]) for(const check of diagnoseExactProductionHyperdrive(hyperdrives,{name,origin}))
      note("Hyperdrive diagnostics / "+label,check.name,check.status,check.detail);
  }
}
if(app&&log&&e.CLOUDFLARE_API_TOKEN&&e.CLOUDFLARE_ACCOUNT_ID){
  const common={accountId:e.CLOUDFLARE_ACCOUNT_ID,apiToken:e.CLOUDFLARE_API_TOKEN};
  for(const [label,url,resolver] of [
    ["Application Hyperdrive",e.ULC_LINZ_PRODUCTION_DATABASE_URL,resolveUlcLinzProductionHyperdrive],
    ["Security-log Hyperdrive",e.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL,resolveUlcLinzProductionSecurityLogHyperdrive],
  ]){
    try{
      const result=await resolver({...common,databaseUrl:url});
      note("Hyperdrive",label,typeof result?.id==="string"&&result.id.length?"PASS":"BLOCKED","exact origin and credentials configuration checked");
    }catch{
      note("Hyperdrive",label,"BLOCKED","missing exact resource, credential drift or insufficient Read access");
    }
  }
}else note("Hyperdrive","Dedicated bindings","BLOCKED","prerequisite credentials missing");
const esc=x=>String(x).replaceAll("|","\\|").replaceAll("\n"," ");
const n=state=>rows.filter(x=>x.state===state).length;
const report=[
  "## ULC M6: consolidated read-only readiness",
  "",
  "Commit: "+(e.GITHUB_SHA||"not available"),
  "PASS="+n("PASS")+", BLOCKED="+n("BLOCKED")+", WARN="+n("WARN"),
  "No Cloudflare writes, worker deployment, SQL changes, permission changes or secret updates.",
  "",
  "| Area | Check | Status | Sanitized observation |",
  "|---|---|---|---|",
  ...rows.map(r=>"| "+esc(r.area)+" | "+esc(r.name)+" | "+r.state+" | "+esc(r.reason||"—")+" |"),
  "",
];
for(const r of rows)console.log("["+r.state+"] "+r.area+" / "+r.name+(r.reason?" : "+r.reason:""));
if(e.GITHUB_STEP_SUMMARY)await appendFile(e.GITHUB_STEP_SUMMARY,report.join("\n")+"\n");
if(n("BLOCKED"))process.exitCode=1;

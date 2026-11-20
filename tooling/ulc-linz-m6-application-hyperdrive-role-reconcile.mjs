/**
 * One-purpose, operator-confirmed P3 repair of the EXISTING ULC Application
 * Hyperdrive's wrong PostgreSQL role. All other provider settings must already
 * match the canonical production URL. Does not modify the Worker, security-log
 * Hyperdrive, Neon or public routes. Never logs credential strings/provider bodies.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const WORKER_NAME = "appbasis-ulc-linz-production";
const TARGET_NAME = "appbasis-ulc-linz-production-db";
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const REQUIRED_CONFIRMATION = "RECONCILE-ULC-APPLICATION-HYPERDRIVE-ROLE";

function reject() {
  throw new Error("ULC Application Hyperdrive role reconciliation was blocked by a protected prerequisite.");
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function getJson(fetchImpl, url, token) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(18000),
    });
    if (!(response instanceof Response) || !response.ok) reject();
    const doc = await response.json();
    if (doc?.success !== true) reject();
    return doc;
  } catch { reject(); }
}
async function putJson(fetchImpl, url, token, body) {
  try {
    const response = await fetchImpl(url, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(18000),
    });
    if (!(response instanceof Response) || !response.ok) reject();
    const doc = await response.json();
    if (doc?.success !== true || !record(doc.result)) reject();
    return doc.result;
  } catch { reject(); }
}

function sameOriginExceptRole(config, expected) {
  if (!record(config) || !record(config.origin) || !record(config.caching)) return false;
  const x=config.origin;
  return config.name===TARGET_NAME &&
    typeof config.id==="string" && config.id.length>0 && config.id.length<=256 &&
    !/[\s\u0000-\u001f\u007f]/u.test(config.id) &&
    (x.scheme==="postgres" || x.scheme==="postgresql") &&
    x.host?.toLowerCase()===expected.host &&
    Number(x.port??5432)===expected.port &&
    x.database===expected.database &&
    typeof x.user==="string" && x.user.length>0 &&
    config.caching.disabled===true;
}
async function listConfigs(fetchImpl, accountUrl, token) {
  const collected=[];
  for(let page=1;page<=100;page++){
    const doc=await getJson(fetchImpl,
      accountUrl + "/hyperdrive/configs?page="+page+"&per_page=100",token);
    if(!Array.isArray(doc.result)) reject();
    collected.push(...doc.result);
    if(collected.length>10000) reject();
    const reported=doc.result_info?.total_count;
    if(Number.isInteger(reported) && reported>=0){
      if(collected.length>=reported) return collected;
    } else if(doc.result.length<100) return collected;
  }
  reject();
}
function target(configs) {
  const matches=configs.filter(x=>x?.name===TARGET_NAME);
  if(matches.length!==1) reject();
  return matches[0];
}
async function requireClosedExistingWorker(fetchImpl,accountUrl,token) {
  const [worker,scripts,deployments]=await Promise.all([
    getJson(fetchImpl,accountUrl+"/workers/workers/"+WORKER_NAME,token),
    getJson(fetchImpl,accountUrl+"/workers/scripts",token),
    getJson(fetchImpl,accountUrl+"/workers/scripts/"+WORKER_NAME+"/deployments",token),
  ]);
  const w=worker.result;
  if(w?.name!==WORKER_NAME ||
    w?.subdomain?.enabled!==false ||
    w?.subdomain?.previews_enabled!==false ||
    !Array.isArray(w?.references?.domains) ||
    w.references.domains.length!==0) reject();
  const matches=Array.isArray(scripts.result)
    ? scripts.result.filter(x=>x?.id===WORKER_NAME) : [];
  if(matches.length!==1) reject();
  const routes=matches[0].routes;
  if(routes!==null && routes!==undefined &&
    (!Array.isArray(routes)||routes.length!==0)) reject();
  if(!Array.isArray(deployments.result?.deployments) ||
    deployments.result.deployments.length<1) reject();
}

export async function reconcileUlcLinzApplicationHyperdriveRole({
  accountId, apiToken, readToken, databaseUrl, confirmation, branchRef, apply=false,
  fetchImpl=globalThis.fetch,
}={}){
  // No provider request at all without positive operator approval.
  if(apply!==true || confirmation!==REQUIRED_CONFIRMATION ||
    branchRef!=="refs/heads/main" ||
    typeof accountId!=="string" || !ACCOUNT_ID.test(accountId) ||
    typeof apiToken!=="string" || !apiToken || /\s/.test(apiToken) ||
    typeof readToken!=="string" || !readToken || /\s/.test(readToken) ||
    typeof fetchImpl!=="function") reject();
  let expected;
  try { expected=parseUlcLinzProductionDatabaseUrl(databaseUrl); }
  catch { reject(); }
  if(expected.user!=="ulc_linz_application" || expected.database!=="neondb") reject();
  const accountUrl="https://api.cloudflare.com/client/v4/accounts/"+accountId;
  await requireClosedExistingWorker(fetchImpl,accountUrl,readToken);
  let config=target(await listConfigs(fetchImpl,accountUrl,readToken));
  if(!sameOriginExceptRole(config,expected)) reject();

  if(config.origin.user===expected.user){
    return Object.freeze({status:"already-correct",changed:false});
  }

  // Re-read immediately before the ONLY permitted write, denying unexpected drift.
  const latest=target(await listConfigs(fetchImpl,accountUrl,readToken));
  if(!sameOriginExceptRole(latest,expected) ||
    latest.id!==config.id ||
    latest.origin.user!==config.origin.user) reject();
  config=latest;

  const payload={
    name:TARGET_NAME,
    origin:{
      scheme:expected.scheme,
      host:expected.host,
      port:expected.port,
      database:expected.database,
      user:expected.user,
      password:expected.password,
    },
    caching:{disabled:true},
  };
  const updated=await putJson(fetchImpl,
    accountUrl+"/hyperdrive/configs/"+encodeURIComponent(config.id),apiToken,payload);
  if(updated.id!==config.id || !sameOriginExceptRole(updated,expected) ||
    updated.origin.user!==expected.user) reject();

  const readBack=target(await listConfigs(fetchImpl,accountUrl,readToken));
  if(readBack.id!==config.id ||
    !sameOriginExceptRole(readBack,expected) ||
    readBack.origin.user!==expected.user) reject();
  return Object.freeze({status:"reconciled-and-verified",changed:true});
}
function main() {
  return typeof process.argv[1]==="string" &&
    import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
}
if(main()){
  try{
    const result=await reconcileUlcLinzApplicationHyperdriveRole({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken:process.env.CLOUDFLARE_API_WRITE_TOKEN,
      readToken:process.env.ULC_LINZ_PRODUCTION_CLOUDFLARE_API_TOKEN,
      databaseUrl:process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
      confirmation:process.env.ULC_HYPERDRIVE_ROLE_CONFIRMATION,
      branchRef:process.env.GITHUB_REF,
      apply:process.env.ULC_LINZ_APPLY_APPLICATION_HYPERDRIVE_ROLE==="1",
    });
    console.log("ULC application Hyperdrive role: "+result.status);
  }catch{
    console.error("ULC application Hyperdrive role repair BLOCKED; no follow-up deployment authorized.");
    process.exitCode=1;
  }
}

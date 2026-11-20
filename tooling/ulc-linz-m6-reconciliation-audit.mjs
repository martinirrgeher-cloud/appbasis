// Pure, provider-output-free diagnostics for existing private Cloudflare production.
// These functions report ONLY check names and PASS/BLOCKED, never URLs or credentials.
import { createHash, createHmac } from "node:crypto";
import { evaluateUlcLinzPrivateRuntimeRefreshState } from "./ulc-linz-m6-private-runtime-refresh.mjs";

const ok = (name, value, blockedReason) =>
  Object.freeze({name, status: value ? "PASS" : "BLOCKED", detail: value ? "" : blockedReason});

export function diagnoseExactProductionHyperdrive(configurations, {name, origin}) {
  if (typeof name !== "string" || !name || !origin || typeof origin !== "object") {
    throw new Error("Expected exact Hyperdrive audit inputs.");
  }
  if (!Array.isArray(configurations)) {
    return Object.freeze([ok("Complete Hyperdrive inventory",false,"Provider inventory unavailable or truncated")]);
  }
  const matches=configurations.filter(x=>x?.name===name);
  const checks=[ok("Exactly one named Hyperdrive",matches.length===1,
    matches.length===0?"Dedicated Hyperdrive is absent":"Dedicated Hyperdrive is duplicated")];
  if(matches.length!==1) return Object.freeze(checks);
  const config=matches[0], remote=config.origin, valid=remote&&typeof remote==="object"&&!Array.isArray(remote);
  checks.push(ok("Configuration and origin shape",valid&&typeof config.id==="string"&&config.id.length>0,
    "Malformed Hyperdrive metadata"));
  if(!valid) return Object.freeze(checks);
  // Compare booleans only. Never echo hosts, users, database names, passwords or origin objects.
  checks.push(ok("Exact direct Neon host",typeof remote.host==="string"&&remote.host.toLowerCase()===origin.host,
    "Hyperdrive targets a different host"));
  checks.push(ok("Exact PostgreSQL port",Number(remote.port??5432)===origin.port,
    "Hyperdrive uses a different port"));
  checks.push(ok("Exact database",remote.database===origin.database,
    "Hyperdrive selects a different database"));
  checks.push(ok("Exact dedicated SQL login role",remote.user===origin.user,
    "Hyperdrive credential role differs from the selected production role"));
  checks.push(ok("PostgreSQL scheme",
    (remote.scheme==="postgres"||remote.scheme==="postgresql")&&origin.scheme==="postgres",
    "Hyperdrive scheme does not match PostgreSQL"));
  checks.push(ok("Query cache disabled",config.caching?.disabled===true,
    "Hyperdrive cache is not provably disabled"));
  return Object.freeze(checks);
}

export function diagnoseExistingPrivateProductionRefresh({
  worker,versions,deployments,scripts,githubSha,authSecret,pilotOriginFingerprint,
}) {
  if(!worker||!versions||!deployments||!scripts||typeof githubSha!=="string"||
     typeof authSecret!=="string"||typeof pilotOriginFingerprint!=="string"){
    return Object.freeze([ok("Refresh prerequisites present",false,"Incomplete read-only provider inventory")]);
  }
  if(authSecret.length<32||!/^[0-9a-f]{64}$/.test(pilotOriginFingerprint)){
    return Object.freeze([ok("Refresh fingerprints",false,"Invalid runtime secret or pilot-origin fingerprint")]);
  }
  const secretFingerprint=createHmac("sha256",authSecret)
    .update("appbasis:ulc-linz:production:better-auth-secret:v1").digest("hex");
  try {
    const current=evaluateUlcLinzPrivateRuntimeRefreshState({
      workerResponse:{success:true,result:worker},
      versionsResponse:{success:true,result:versions},
      deploymentsResponse:{success:true,result:deployments},
      scriptsResponse:{success:true,result:scripts},
      githubSha,
      authSecretFingerprint:secretFingerprint,
      pilotOriginFingerprint,
    });
    return Object.freeze([
      ok("Existing private deployment trusted by refresh contract",true,""),
      Object.freeze({name:"Exact current main Worker version",status:current.uploadRequired?"WARN":"PASS",
        detail:current.uploadRequired?"Current version must be prepared by approved refresh-config workflow":""}),
      Object.freeze({name:"Current version is active privately",
        status:current.uploadRequired?"WARN":current.currentDeployment?"PASS":"WARN",
        detail:current.uploadRequired?"No exact current version":current.currentDeployment?"":"Approved private refresh-deploy step required"}),
    ]);
  }catch {
    return Object.freeze([ok("Existing private deployment trusted by refresh contract",
      false,"Refresh safety contract rejected Worker/version/deployment provenance; do not deploy or reset")]);
  }
}

// We use the exact SHA-256 pilot-origin construction of the canonical M6 workflows.
export function pilotOriginFingerprint(workerName,subdomain) {
  if(typeof workerName!=="string"||!/^[a-z0-9][a-z0-9-]*$/.test(workerName)||
    typeof subdomain!=="string"||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)){
    throw new Error("Canonical pilot origin inputs invalid.");
  }
  return createHash("sha256").update("https://"+workerName+"."+subdomain+".workers.dev").digest("hex");
}

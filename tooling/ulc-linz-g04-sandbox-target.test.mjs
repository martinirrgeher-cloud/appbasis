import assert from "node:assert/strict";
import test from "node:test";
import {
  G046_SANDBOX, validateG046SandboxOrigins, renderG046SandboxConfig,
} from "./ulc-linz-g04-sandbox-target.mjs";

const pg = (host,role,db="appbasis_ulc_linz_preview",ssl="verify-full") =>
  "postgresql://" + role + ":fake-test-password@" + host + ":5432/" + db + "?sslmode=" + ssl;
const urls=()=>({
  applicationDatabaseUrl:pg(G046_SANDBOX.directHost,G046_SANDBOX.applicationRole),
  securityLogDatabaseUrl:pg(G046_SANDBOX.directHost,G046_SANDBOX.securityRole),
});
const baseURL="https://appbasis-ulc-linz-g04-sandbox.test-account.workers.dev";
const ids={applicationHyperdriveId:"test-g046-app-hyperdrive-id",securityLogHyperdriveId:"test-g046-security-hyperdrive-id"};

test("G-04.6 credentials accept only exact sandbox branch endpoint and distinct least-privileged roles",()=>{
  assert.deepEqual(validateG046SandboxOrigins(urls()),{
    sandboxProjectId:"cool-unit-46141580",
    sandboxBranchId:"br-falling-hat-b1lmifga",
    sourceAndSandboxEndpointsDistinct:true,
    database:"appbasis_ulc_linz_preview",
    authorizedToMigrateSource:false,authorizedToDeploySource:false,
    authorizedToDeploySandbox:false,
  });
});

test("G-04.6 refuses original Preview, production, pooled, wrong role and non-TLS targets",()=>{
  const bad=[
    x=>{x.applicationDatabaseUrl=pg(G046_SANDBOX.sourceDirectHost,G046_SANDBOX.applicationRole);},
    x=>{x.securityLogDatabaseUrl=pg(G046_SANDBOX.sourceDirectHost,G046_SANDBOX.securityRole);},
    x=>{x.applicationDatabaseUrl=pg(G046_SANDBOX.directHost,G046_SANDBOX.applicationRole,"production");},
    x=>{x.applicationDatabaseUrl=pg(G046_SANDBOX.directHost+"-pooler",G046_SANDBOX.applicationRole);},
    x=>{x.applicationDatabaseUrl=pg(G046_SANDBOX.directHost,"appbasis_ulc_linz_preview_application");},
    x=>{x.securityLogDatabaseUrl=pg(G046_SANDBOX.directHost,G046_SANDBOX.applicationRole);},
    x=>{x.securityLogDatabaseUrl=pg(G046_SANDBOX.directHost,G046_SANDBOX.securityRole,"appbasis_ulc_linz_restore");},
    x=>{x.applicationDatabaseUrl=pg(G046_SANDBOX.directHost,G046_SANDBOX.applicationRole,undefined,"disable");},
    x=>{x.applicationDatabaseUrl+= "&database=other";},
    x=>{x.securityLogDatabaseUrl+= "#tail";},
    x=>{delete x.applicationDatabaseUrl;},
  ];
  for(const change of bad){
    const v=urls();
    change(v);
    assert.throws(()=>validateG046SandboxOrigins(v),/G-04.6 blocked/);
  }
});

test("G-04.6 renders a new Worker, not the existing Preview or production Worker",()=>{
  const config=renderG046SandboxConfig({
    ...urls(),...ids,baseURL,
    buildSha:"a".repeat(40),
  });
  assert.equal(config.name,G046_SANDBOX.workerName);
  assert.equal(config.main,"./worker/preview-g04-sandbox.ts");
  assert.equal(config.vars.APPBASIS_BASE_URL,baseURL);
  assert.equal(config.vars.APPBASIS_GENERATED_APP_ID,"ulc-linz");
  assert.equal(config.vars.APPBASIS_RUNTIME_ENVIRONMENT,"generated-preview-ulc-linz");
  assert.equal(config.vars.APPBASIS_REGISTRATION_CALENDAR_V17,"enabled");
  assert.equal(config.vars.APPBASIS_G046_SANDBOX_BRANCH_ID,G046_SANDBOX.branchId);
  assert.deepEqual(config.hyperdrive.map(x=>x.id),Object.values(ids));
  assert.deepEqual(config.secrets.required,["BETTER_AUTH_SECRET"]);
  assert.equal(JSON.stringify(config).includes("fake-test-password"),false);
});

test("G-04.6 rejects wrong Worker origin and hyperdrive ID collisions",()=>{
  const good={...urls(),...ids,baseURL};
  const bad=[
    x=>{x.baseURL="https://appbasis-generated-ulc-linz-preview.test-account.workers.dev";},
    x=>{x.baseURL="https://appbasis-ulc-linz-g04-sandbox.test-account.workers.dev.extra";},
    x=>{x.baseURL="http://appbasis-ulc-linz-g04-sandbox.test-account.workers.dev";},
    x=>{x.baseURL=baseURL+"/path";},
    x=>{x.applicationHyperdriveId=x.securityLogHyperdriveId;},
    x=>{x.applicationHyperdriveId="";},
    x=>{x.securityLogDatabaseUrl=pg(G046_SANDBOX.sourceDirectHost,G046_SANDBOX.securityRole);},
  ];
  for(const change of bad) {
    const x={...good};change(x);
    assert.throws(()=>renderG046SandboxConfig(x));
  }
});

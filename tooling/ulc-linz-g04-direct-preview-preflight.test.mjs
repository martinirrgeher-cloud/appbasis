import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECT_G04_PREVIEW,
  validateG04ExistingPreviewCredentials,
  assertG04ExistingPreviewRuntimeRow,
  verifyG04ExistingPreviewRuntime,
} from "./ulc-linz-g04-direct-preview-preflight.mjs";

const direct=({host=DIRECT_G04_PREVIEW.host,db=DIRECT_G04_PREVIEW.database,
  user,ssl="require"}={})=>
  "postgresql://"+user+":synthetic-secret@"+host+":5432/"+db+"?sslmode="+ssl;
const credentials=()=>({
  migrationDatabaseUrl:direct({user:DIRECT_G04_PREVIEW.migrationRole}),
  applicationDatabaseUrl:direct({user:DIRECT_G04_PREVIEW.applicationRole}),
  securityLogDatabaseUrl:direct({user:DIRECT_G04_PREVIEW.securityRole}),
});
const ok=()=>({
  database_name:DIRECT_G04_PREVIEW.database,
  principal_name:DIRECT_G04_PREVIEW.applicationRole,
  runtime_least_privilege:true,rule_table:true,exception_table:true,
  guard_function:true,guard_trigger:true,guard_public_execute:false,
  rule_read:true,rule_insert:true,rule_update:true,
  exception_read:true,exception_insert:true,exception_update:true,
  app_security_log_read:false,app_security_log_write:false,
});

test("G-04 direct v17 accepts only existing Preview source and distinct roles",()=>{
  assert.deepEqual(validateG04ExistingPreviewCredentials(credentials()),{
    target:"existing-ulc-preview",sourceHostVerified:true,
    targetSchemaVersion:17,productionApproved:false,
  });
});

test("G-04 direct v17 refuses sandbox, production, pooler, wrong account and weak TLS",()=>{
  const mutations=[
    x=>{x.migrationDatabaseUrl=direct({host:"ep-empty-frog-b187iuwz.c-5.eu-central-1.aws.neon.tech",user:DIRECT_G04_PREVIEW.migrationRole});},
    x=>{x.applicationDatabaseUrl=direct({host:"ep-empty-frog-b187iuwz.c-5.eu-central-1.aws.neon.tech",user:DIRECT_G04_PREVIEW.applicationRole});},
    x=>{x.securityLogDatabaseUrl=direct({host:"ep-green-resonance-b19c78rm-pooler.c-5.eu-central-1.aws.neon.tech",user:DIRECT_G04_PREVIEW.securityRole});},
    x=>{x.migrationDatabaseUrl=direct({db:"production",user:DIRECT_G04_PREVIEW.migrationRole});},
    x=>{x.applicationDatabaseUrl=direct({user:DIRECT_G04_PREVIEW.migrationRole});},
    x=>{x.securityLogDatabaseUrl=direct({user:DIRECT_G04_PREVIEW.applicationRole});},
    x=>{x.applicationDatabaseUrl=direct({user:DIRECT_G04_PREVIEW.applicationRole,ssl:"disable"});},
    x=>{x.applicationDatabaseUrl+="&database=production";},
    x=>{x.securityLogDatabaseUrl+="#other";},
    x=>{delete x.applicationDatabaseUrl;},
  ];
  for(const mutate of mutations){
    const x=credentials();mutate(x);
    assert.throws(()=>validateG04ExistingPreviewCredentials(x),
      /G-04 direct Preview preflight blocked/);
  }
});

test("G-04 direct v17 requires guarded tables and all runtime privileges",()=>{
  assert.deepEqual(assertG04ExistingPreviewRuntimeRow(ok()),{
    status:"ready-for-existing-preview-deploy",schemaVersion:17,
    productionApproved:false,
  });
  const invalid=[
    x=>{x.database_name="production";},
    x=>{x.principal_name="appbasis_ulc_linz_preview_migration";},
    x=>{x.runtime_least_privilege=false;},
    x=>{x.rule_table=false;},
    x=>{x.exception_table=false;},
    x=>{x.guard_function=false;},
    x=>{x.guard_trigger=false;},
    x=>{x.guard_public_execute=true;},
    x=>{x.rule_read=false;},
    x=>{x.rule_insert=false;},
    x=>{x.rule_update=false;},
    x=>{x.exception_read=false;},
    x=>{x.exception_insert=false;},
    x=>{x.exception_update=false;},
    x=>{x.app_security_log_read=true;},
    x=>{x.app_security_log_write=true;},
  ];
  for(const mutate of invalid){
    const x=ok();mutate(x);
    assert.throws(()=>assertG04ExistingPreviewRuntimeRow(x),
      /G-04 direct Preview preflight blocked/);
  }
});

test("G-04 live preflight uses supplied application role and closes its connection",async()=>{
  const uris=credentials();
  let connected=false,closed=false;
  const output=await verifyG04ExistingPreviewRuntime(uris,{
    databaseFactory:url=>{
      assert.equal(url,uris.applicationDatabaseUrl);
      connected=true;
      return {client:{
        unsafe:async sql=>{
          assert.match(sql,/ulc_linz_registration_calendar_guard_trg/);
          return [ok()];
        },
        end:async()=>{closed=true;},
      }};
    },
  });
  assert.deepEqual(output,{
    status:"ready-for-existing-preview-deploy",schemaVersion:17,
    productionApproved:false,
  });
  assert.equal(connected,true);assert.equal(closed,true);
});

test("G-04 live preflight fails closed if schema is missing and still closes DB",async()=>{
  let closed=false;
  await assert.rejects(()=>verifyG04ExistingPreviewRuntime(credentials(),{
    databaseFactory:()=>({client:{
      unsafe:async()=>[{...ok(),guard_trigger:false}],
      end:async()=>{closed=true;},
    }}),
  }),/G-04 direct Preview preflight blocked/);
  assert.equal(closed,true);
});

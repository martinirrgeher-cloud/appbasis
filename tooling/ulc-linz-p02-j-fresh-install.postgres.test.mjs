import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  loadUlc69ManifestProposal,
  NEW_MIGRATIONS,
  SOURCE_CANDIDATES,
} from "./ulc-linz-p02-j-manifest-reconciliation.mjs";

const DATABASE_URL=process.env.DATABASE_URL;
if(DATABASE_URL){
  const u=new URL(DATABASE_URL);
  if(!["localhost","127.0.0.1","::1"].includes(u.hostname)||
    u.username!=="postgres"||u.port!=="5432"||
    u.pathname!=="/appbasis_identity_e2e"){
    throw new Error("P02-J only accepts disposable localhost PostgreSQL 18.");
  }
}
function statements(sql){
  return sql.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean);
}
test("P02-J 44-migration candidate installs clean 69-table SQL from empty PG18; rollback is atomic",{
  skip:!DATABASE_URL,timeout:180000,
},async()=>{
  const suffix=randomUUID().replaceAll("-","").slice(0,12);
  const dbName="ulc_p02_j_"+suffix;
  const u=new URL(DATABASE_URL);
  u.pathname="/"+dbName;
  const admin=createPostgresDatabase(DATABASE_URL);
  let isolated=null;
  let created=false;
  try{
    const v=await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(v[0]?.server_version_num)>=180000);
    const proposed=await loadUlc69ManifestProposal();
    assert.equal(proposed.published,true);
    assert.equal(proposed.candidateOnly,false);
    assert.equal(proposed.proposedMigrations,44);
    const paths=proposed.app.owners.flatMap(o=>o.migrations);
    assert.equal(paths.length,44);
    const future={}; // Canonical SQL published: no test-fixture substitution.
    const files=[];
    for(const target of paths){
      const source=future[target]??target;
      if(typeof source!=="string"||!source.startsWith("modules/")&&
          !source.startsWith("apps/")&&!source.startsWith("packages/")){
        throw new Error("P02-J unknown migration source");
      }
      const text=await readFile(new URL("../"+source,import.meta.url),"utf8");
      const parsed=statements(text);
      assert.ok(parsed.length>=1,target+" migration has no SQL");
      files.push({source,parsed});
    }
    assert.equal(new Set(paths).size,44);
    assert.equal(files.filter(x=>x.source===NEW_MIGRATIONS.catalog).length,1);
    assert.equal(files.filter(x=>x.source===NEW_MIGRATIONS.fence).length,1);
    await admin.client.unsafe("CREATE DATABASE "+dbName);
    created=true;
    isolated=createPostgresDatabase(u.toString());
    const count=async()=>Number((await isolated.client.unsafe(
      "SELECT count(*)::int AS n FROM pg_catalog.pg_tables WHERE schemaname='public'"
    ))[0]?.n);
    assert.equal(await count(),0);

    await assert.rejects(isolated.client.begin(async tx=>{
      for(const file of files){
        for(const sql of file.parsed)await tx.unsafe(sql);
      }
      throw new Error("SYNTHETIC_P02_J_ABORT");
    }),/SYNTHETIC_P02_J_ABORT/);
    assert.equal(await count(),0,"all 44 migrations must roll back atomically");

    await isolated.client.begin(async tx=>{
      for(const file of files){
        for(const sql of file.parsed)await tx.unsafe(sql);
      }
    });
    assert.equal(await count(),69);
    const results=await isolated.client.unsafe(
      "SELECT " +
      "to_regclass('public.ulc_linz_registration_calendar_rule') IS NOT NULL AS calendar, "+
      "to_regclass('public.appbasis_exercise_catalog_favorite_deletion') IS NOT NULL AS favorite_marker, "+
      "to_regclass('public.appbasis_exercise_catalog_usage_subject') IS NOT NULL AS usage_subject, "+
      "to_regclass('public.ulc_linz_training_subject_deletion') IS NOT NULL AS training_marker, "+
      "(SELECT count(*)::int FROM pg_catalog.pg_trigger "+
      "WHERE tgname IN ('ulc_linz_training_attendance_subject_fence',"+
      "'ulc_linz_training_registration_subject_fence',"+
      "'ulc_linz_training_registration_change_subject_fence') "+
      "AND NOT tgisinternal) AS active_candidate_fences"
    );
    assert.deepEqual(results[0],{
      calendar:true,favorite_marker:true,usage_subject:true,
      training_marker:true,active_candidate_fences:3,
    });
    // This is a disposable future release candidate, not a deploy or grant.
    assert.equal(proposed.providerWritesAllowed,false);
    assert.equal(proposed.mayApplyToExistingPreview,false);
  }finally{
    if(isolated)await isolated.client.end().catch(()=>{});
    if(created)await admin.client.unsafe("DROP DATABASE "+dbName+" WITH (FORCE)");
    await admin.client.end().catch(()=>{});
  }
});

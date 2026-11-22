import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

// Two independent PostgreSQL connections contend in a newly created LOCAL
// disposable 69-table DB. This does NOT touch Neon, Cloudflare, or test data.
const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  const u = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname) ||
      u.username !== "postgres" || u.port !== "5432" ||
      u.pathname !== "/appbasis_identity_e2e") {
    throw new Error("P24 lock-order test only accepts the disposable localhost PG18 CI source.");
  }
}
const ORG = "p24-lock-test-org";
const SUBJECT = "p24-lock-test-athlete";
const PRINCIPAL = "p24-lock-test-principal";
const NEIGHBOR = "p24-lock-test-neighbor";
const EXERCISE = "p24-lock-test-exercise";
const BLOCK = "p24-lock-test-block";
const SESSION = "p24-lock-test-session";
const split = sql => sql.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes,no) => {resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
const retry = async (promise, message) => {
  await assert.rejects(promise,error => {
    assert.equal(error.code, "55P03", message);
    assert.match(error.message, /concurrent.*(?:erasure|deletion).*retry/i);
    return true;
  });
};
async function holdThenProbe(client, prepare, probe, finish) {
  const locked=deferred();
  const release=deferred();
  const holder=client.begin(async tx => {
    await prepare(tx);
    locked.resolve();
    await release.promise;
    if (finish) await finish(tx);
  });
  // Propagate an unexpected setup error rather than leave the test stuck.
  holder.catch(error=>locked.reject(error));
  await locked.promise;
  try { await probe(); }
  finally {
    release.resolve();
    await holder;
  }
}

test("P24: canonical athlete row and favorite advisory locks fail fast under direct UPDATE; reverse order succeeds without deadlock",{
  skip:!DATABASE_URL,
  timeout:145_000,
},async()=>{
  const database="ulc_p24_lock_"+randomUUID().replaceAll("-","").slice(0,12);
  const dest=new URL(DATABASE_URL);dest.pathname="/"+database;
  const admin=createPostgresDatabase(DATABASE_URL);
  let owner=null, writer=null, created=false;
  try {
    const version=await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(version[0]?.server_version_num)>=180000);
    await admin.client.unsafe("CREATE DATABASE "+database);
    created=true;
    owner=createPostgresDatabase(dest.toString());
    writer=createPostgresDatabase(dest.toString());
    const query=(sql,params=[])=>owner.client.unsafe(sql,params);
    const manifest=JSON.parse(await readFile(
      new URL("../apps/ulc-linz/appbasis.database.json",import.meta.url),"utf8",
    ));
    const migrations=manifest.owners.flatMap(o=>o.migrations);
    assert.equal(manifest.owners.length,8);
    assert.equal(migrations.length, 46);
    for(const path of migrations) {
      const sql=await readFile(new URL("../"+path,import.meta.url),"utf8");
      for(const stmt of split(sql)) await query(stmt);
    }
    for(const path of [
      "../apps/ulc-linz/proposals/p24-personal-favorites-deadlock-safe.candidate.sql",
      "../apps/ulc-linz/proposals/p24-source-owner-training-fence-deadlock-safe.candidate.sql",
    ]){
      const sql=await readFile(new URL(path,import.meta.url),"utf8");
      for(const stmt of split(sql)) await query(stmt);
    }
    const schema=await query("SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'");
    assert.equal(schema[0]?.count,69);
    const fences=await query(
      "SELECT pg_get_functiondef('public.ulc_p24_personal_favorite_write_fence()'::regprocedure) AS favorite,"+
      " pg_get_functiondef('public.ulc_linz_training_subject_write_fence()'::regprocedure) AS training",
    );
    assert.match(fences[0].favorite,/pg_try_advisory_xact_lock/);
    assert.match(fences[0].training,/FOR SHARE NOWAIT/);
    assert.match(fences[0].training,/pg_try_advisory_xact_lock/);

    await query("INSERT INTO appbasis_athlete(id,organization_id,first_name,last_name) VALUES ($1,$2,'Synthetic','Athlete')",[SUBJECT,ORG]);
    await query("INSERT INTO ulc_linz_training_session(id,organization_id,module_id,group_id,session_date) VALUES ($1,$2,'u12','lock-test-group','2026-11-20')",[SESSION,ORG]);
    await query("INSERT INTO ulc_linz_training_attendance(organization_id,session_id,athlete_id,status) VALUES ($1,$2,$3,'present')",[ORG,SESSION,SUBJECT]);
    await query("INSERT INTO appbasis_exercise_catalog_item(id,organization_id,name,category_key) VALUES ($1,$2,'Synthetic exercise','basic')",[EXERCISE,ORG]);
    await owner.client.begin(async tx => {
      await tx.unsafe("INSERT INTO appbasis_training_block(id,organization_id) VALUES ($1,$2)",[BLOCK,ORG]);
      await tx.unsafe("INSERT INTO appbasis_training_block_revision(organization_id,block_id,revision,name) VALUES ($1,$2,1,'Synthetic block')",[ORG,BLOCK]);
    });
    for(const principal of [PRINCIPAL,NEIGHBOR]) {
      await query("INSERT INTO appbasis_exercise_catalog_favorite(organization_id,principal_id,exercise_id) VALUES ($1,$2,$3)",[ORG,principal,EXERCISE]);
      await query("INSERT INTO appbasis_training_block_favorite(organization_id,principal_id,block_id) VALUES ($1,$2,$3)",[ORG,principal,BLOCK]);
    }
    // A regression that blocks instead of returning NOWAIT should fail
    // rather than stall CI. The 55P03 message must come from OUR trigger.
    await writer.client.unsafe("SET statement_timeout = '2000ms'");
    await writer.client.unsafe("SET lock_timeout = '800ms'");

    // Eraser first (canonical favorite owner): advisory lock is held before
    // its future DELETE. Existing tuple direct SQL UPDATE must never wait.
    await holdThenProbe(owner.client,
      tx => tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array($1::text,$2::text)::text,0))",[ORG,PRINCIPAL]),
      async()=>{
        await retry(writer.client.unsafe(
          "UPDATE appbasis_exercise_catalog_favorite SET created_at=created_at+interval '1 second' WHERE organization_id=$1 AND principal_id=$2",
          [ORG,PRINCIPAL],
        ),"catalog UPDATE must reject concurrent erasure immediately");
        await retry(writer.client.unsafe(
          "UPDATE appbasis_training_block_favorite SET created_at=created_at+interval '1 second' WHERE organization_id=$1 AND principal_id=$2",
          [ORG,PRINCIPAL],
        ),"block UPDATE must reject concurrent erasure immediately");
      },
      async tx=>{
        await tx.unsafe("INSERT INTO appbasis_exercise_catalog_favorite_deletion(organization_id,principal_id,completed_at,purge_after) VALUES ($1,$2,'2026-11-20T12:00:00Z','2026-12-25T12:00:00Z')",[ORG,PRINCIPAL]);
        await tx.unsafe("INSERT INTO appbasis_training_block_favorite_deletion(organization_id,principal_id,completed_at,purge_after) VALUES ($1,$2,'2026-11-20T12:00:00Z','2026-12-25T12:00:00Z')",[ORG,PRINCIPAL]);
        await tx.unsafe("DELETE FROM appbasis_exercise_catalog_favorite WHERE organization_id=$1 AND principal_id=$2",[ORG,PRINCIPAL]);
        await tx.unsafe("DELETE FROM appbasis_training_block_favorite WHERE organization_id=$1 AND principal_id=$2",[ORG,PRINCIPAL]);
      },
    );
    for(const table of ["appbasis_exercise_catalog_favorite","appbasis_training_block_favorite"]) {
      const rows=await query("SELECT count(*)::int AS count FROM "+table+" WHERE organization_id=$1 AND principal_id=$2",[ORG,PRINCIPAL]);
      assert.equal(rows[0]?.count,0);
    }

    // ULC app-owned marker/deletion transaction takes the subject advisory
    // lock before deleting attendance. Direct attendance UPDATE must return
    // retryable 55P03 rather than wait with its own tuple lock held.
    await holdThenProbe(owner.client,
      tx => tx.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text || chr(31) || $2::text,0))",
        [ORG,SUBJECT],
      ),
      async()=>{
        await retry(writer.client.unsafe(
          "UPDATE ulc_linz_training_attendance SET status='excused' WHERE organization_id=$1 AND athlete_id=$2",
          [ORG,SUBJECT],
        ),"app-owned training UPDATE must reject concurrent erasure immediately");
      },
    );

    // Source ATHLETES eraser first: it holds the parent row FOR UPDATE.
    // A direct child attendance UPDATE already holds its own tuple lock;
    // it must NOWAIT instead of forming a cross-table lock cycle.
    await holdThenProbe(owner.client,
      tx => tx.unsafe("SELECT id FROM appbasis_athlete WHERE id=$1 AND organization_id=$2 FOR UPDATE",[SUBJECT,ORG]),
      async()=>{
        await assert.rejects(writer.client.unsafe(
          "UPDATE ulc_linz_training_attendance SET status='excused' WHERE organization_id=$1 AND athlete_id=$2",
          [ORG,SUBJECT],
        ),error=>{
          assert.equal(error.code,"55P03");
          assert.match(error.message,/could not obtain lock on row/i);
          return true;
        });
      },
      async tx=>{
        await tx.unsafe("INSERT INTO appbasis_athletes_deletion(entity_type,entity_id,organization_id,completed_at,purge_after) VALUES ('athlete',$1,$2,'2026-11-20T12:00:00Z','2026-12-25T12:00:00Z')",[SUBJECT,ORG]);
        await tx.unsafe("DELETE FROM appbasis_athlete WHERE id=$1 AND organization_id=$2",[SUBJECT,ORG]);
      },
    );
    await assert.rejects(writer.client.unsafe(
      "UPDATE ulc_linz_training_attendance SET status='excused' WHERE organization_id=$1 AND athlete_id=$2",
      [ORG,SUBJECT],
    ),/active canonical athlete/i);

    // Writer first: a legal update owns row + matching advisory lock;
    // canonical delete waits until it commits, then deletes. No deadlock.
    const writerReady=deferred(),writerRelease=deferred();
    const firstWriter=writer.client.begin(async tx=>{
      await tx.unsafe(
        "UPDATE appbasis_exercise_catalog_favorite SET created_at=created_at+interval '1 second' WHERE organization_id=$1 AND principal_id=$2",
        [ORG,NEIGHBOR],
      );
      writerReady.resolve();
      await writerRelease.promise;
    });
    firstWriter.catch(e=>writerReady.reject(e));
    await writerReady.promise;
    let deleteJob;
    try {
      deleteJob=owner.client.begin(async tx=>{
        await tx.unsafe("SET LOCAL statement_timeout = '3000ms'");
        await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array($1::text,$2::text)::text,0))",[ORG,NEIGHBOR]);
        await tx.unsafe("INSERT INTO appbasis_exercise_catalog_favorite_deletion(organization_id,principal_id,completed_at,purge_after) VALUES ($1,$2,'2026-11-20T12:00:00Z','2026-12-25T12:00:00Z')",[ORG,NEIGHBOR]);
        await tx.unsafe("DELETE FROM appbasis_exercise_catalog_favorite WHERE organization_id=$1 AND principal_id=$2",[ORG,NEIGHBOR]);
      });
    }finally{writerRelease.resolve();await firstWriter;}
    await deleteJob;
    const final=await query("SELECT count(*)::int AS count FROM appbasis_exercise_catalog_favorite WHERE organization_id=$1 AND principal_id=$2",[ORG,NEIGHBOR]);
    assert.equal(final[0]?.count,0);
  }finally{
    await Promise.all([owner?.client.end().catch(()=>{}),writer?.client.end().catch(()=>{})]);
    if(created)await admin.client.unsafe("DROP DATABASE "+database+" WITH (FORCE)");
    await admin.client.end().catch(()=>{});
  }
});

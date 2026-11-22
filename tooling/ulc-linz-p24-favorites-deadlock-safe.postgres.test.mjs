import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

// REVIEW ONLY: exactly one disposable database on local PostgreSQL 18.
// Never connect to Neon, Cloudflare, a preview or an existing pilot database.
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p24-favorite-org";
const OTHER = "p24-favorite-other-org";
const DELETED = "p24-deleted-principal";
const NEIGHBOR = "p24-neighbor-principal";
const CATALOG_FAVORITE = "appbasis_exercise_catalog_favorite";
const BLOCK_FAVORITE = "appbasis_training_block_favorite";
const CANDIDATE = "../apps/ulc-linz/proposals/p24-personal-favorites-deadlock-safe.candidate.sql";
if (DATABASE_URL) {
  const u = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname) ||
      u.username !== "postgres" || u.port !== "5432" ||
      u.pathname !== "/appbasis_identity_e2e") {
    throw new Error("P2-P4 personal favorite fence proof requires disposable localhost PG18 only.");
  }
}
const split = text => text.split("--> statement-breakpoint").map(x => x.trim()).filter(Boolean);

test("P24: direct favorite SQL bypass before deadlock-safe candidate; both owners reject resurrection after candidate", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  const dbName = "ulc_p24_fav_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const url = new URL(DATABASE_URL);
  url.pathname = "/" + dbName;
  const admin = createPostgresDatabase(DATABASE_URL);
  let db = null;
  let created = false;
  const query = (sql, params = []) => db.client.unsafe(sql, params);
  const mark = async (table, org, principal) => query(
    "INSERT INTO " + table + " (organization_id,principal_id,completed_at,purge_after) " +
    "VALUES ($1,$2,'2026-11-20T12:00:00Z','2026-12-25T12:00:00Z')",
    [org, principal],
  );
  // The block owner has a DEFERRABLE current-revision FK; seed the block and
  // its first revision atomically, as the real service does.
  const seedBlock = async (org, block) => db.client.begin(async tx => {
    await tx.unsafe(
      "INSERT INTO appbasis_training_block(id,organization_id) VALUES ($1,$2)",
      [block,org],
    );
    await tx.unsafe(
      "INSERT INTO appbasis_training_block_revision " +
      "(organization_id,block_id,revision,name) VALUES ($1,$2,1,'Synthetic favorite block')",
      [org,block],
    );
  });
  const insertFavorite = async (table, org, principal, item) => query(
    "INSERT INTO " + table + " (organization_id,principal_id," +
      (table === CATALOG_FAVORITE ? "exercise_id" : "block_id") +
      ") VALUES ($1,$2,$3)", [org, principal, item],
  );
  const updateFavorite = async (table, org, principal) => query(
    "UPDATE " + table + " SET created_at=created_at + interval '1 second' " +
    "WHERE organization_id=$1 AND principal_id=$2", [org, principal],
  );
  const rowsFor = async (table, org, principal) => {
    const rows = await query(
      "SELECT COUNT(*)::int AS total FROM " + table +
      " WHERE organization_id=$1 AND principal_id=$2", [org, principal],
    );
    return rows[0]?.total;
  };
  try {
    const server = await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(server[0]?.server_version_num) >= 180000);
    await admin.client.unsafe("CREATE DATABASE " + dbName);
    created = true;
    db = createPostgresDatabase(url.toString());
    const manifest = JSON.parse(await readFile(
      new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url), "utf8",
    ));
    const current = manifest.owners.flatMap(o => o.migrations);
    assert.equal(current.length, 47);
    assert.equal(current.at(current.indexOf("modules/exercise-catalog/migrations/0005_appbasis_exercise_catalog_subject_deletion_write_fence.sql")), "modules/exercise-catalog/migrations/0005_appbasis_exercise_catalog_subject_deletion_write_fence.sql");
    // Historical P24 compares pre-published catalog SQL with its own
    // unregistered candidate. Remove ONLY the exact v6 append from the
    // disposable database, never from the canonical production manifest.
    const paths = current.filter(path => path !== "modules/exercise-catalog/migrations/0005_appbasis_exercise_catalog_subject_deletion_write_fence.sql");
    assert.equal(paths.length, 46);
    assert.equal(new Set(paths).size, 46);
    for (const path of paths) {
      const sql = await readFile(new URL("../" + path, import.meta.url), "utf8");
      for (const statement of split(sql)) await query(statement);
    }
    const total = await query("SELECT COUNT(*)::int AS total FROM pg_tables WHERE schemaname='public'");
    assert.equal(total[0]?.total, 69);

    for (const [org, item, block] of [[ORG,"p24-exercise","p24-block"],[OTHER,"p24-foreign-exercise","p24-foreign-block"]]) {
      await query(
        "INSERT INTO appbasis_exercise_catalog_item " +
        "(id,organization_id,name,category_key) VALUES ($1,$2,'Synthetic favorite test','basic')",
        [item, org],
      );
      await seedBlock(org,block);
    }
    // Preexisting rows demonstrate the UPDATE bypass, while two new rows
    // demonstrate the direct-SQL INSERT bypass before candidate activation.
    await insertFavorite(CATALOG_FAVORITE, ORG, DELETED, "p24-exercise");
    await insertFavorite(BLOCK_FAVORITE, ORG, DELETED, "p24-block");
    await mark("appbasis_exercise_catalog_favorite_deletion", ORG, DELETED);
    await mark("appbasis_training_block_favorite_deletion", ORG, DELETED);
    await updateFavorite(CATALOG_FAVORITE, ORG, DELETED);
    await updateFavorite(BLOCK_FAVORITE, ORG, DELETED);
    // Fresh (second) favorite requires a distinct exercise/block. The
    // repository guard would reject; the direct SQL currently accepts it.
    await query(
      "INSERT INTO appbasis_exercise_catalog_item " +
      "(id,organization_id,name,category_key) VALUES ('p24-second-exercise',$1,'Another synthetic exercise','basic')",
      [ORG],
    );
    await seedBlock(ORG,"p24-second-block");
    await insertFavorite(CATALOG_FAVORITE,ORG,DELETED,"p24-second-exercise");
    await insertFavorite(BLOCK_FAVORITE,ORG,DELETED,"p24-second-block");
    await query(
      "DELETE FROM appbasis_exercise_catalog_favorite WHERE organization_id=$1 AND principal_id=$2 AND exercise_id='p24-second-exercise'",
      [ORG,DELETED],
    );
    await query(
      "DELETE FROM appbasis_training_block_favorite WHERE organization_id=$1 AND principal_id=$2 AND block_id='p24-second-block'",
      [ORG,DELETED],
    );

    // Candidate-only, never written to an active runtime. Existing repository
    // paths and existing markers remain completely unchanged.
    const ddl = await readFile(new URL(CANDIDATE, import.meta.url), "utf8");
    assert.equal(split(ddl).length, 4);
    for (const statement of split(ddl)) await query(statement);
    const after = await query("SELECT COUNT(*)::int AS total FROM pg_tables WHERE schemaname='public'");
    assert.equal(after[0]?.total,69);

    for (const [table, item] of [
      [CATALOG_FAVORITE,"p24-second-exercise"],
      [BLOCK_FAVORITE,"p24-second-block"],
    ]) {
      await assert.rejects(insertFavorite(table,ORG,DELETED,item),/deletion marker/i);
      await assert.rejects(updateFavorite(table,ORG,DELETED),/deletion marker/i);
      assert.equal(await rowsFor(table,ORG,DELETED),1);
    }
    // Normal authorized usage and other organizations remain unaffected.
    await insertFavorite(CATALOG_FAVORITE,ORG,NEIGHBOR,"p24-exercise");
    await insertFavorite(BLOCK_FAVORITE,ORG,NEIGHBOR,"p24-block");
    await insertFavorite(CATALOG_FAVORITE,OTHER,DELETED,"p24-foreign-exercise");
    await insertFavorite(BLOCK_FAVORITE,OTHER,DELETED,"p24-foreign-block");
    for(const table of [CATALOG_FAVORITE,BLOCK_FAVORITE]) {
      assert.equal(await rowsFor(table,ORG,NEIGHBOR),1);
      assert.equal(await rowsFor(table,OTHER,DELETED),1);
      await assert.rejects(query(
        "UPDATE "+table+" SET principal_id=$1 WHERE organization_id=$2 AND principal_id=$3",
        [DELETED,ORG,NEIGHBOR],
      ),/ownership is immutable/i);
    }
    const guards = await query(
      "SELECT rel.relname AS relation, tg.tgenabled AS enabled " +
      "FROM pg_trigger tg JOIN pg_class rel ON rel.oid=tg.tgrelid " +
      "WHERE NOT tg.tgisinternal AND tg.tgfoid=" +
      "'public.ulc_p24_personal_favorite_write_fence()'::regprocedure ORDER BY rel.relname",
    );
    assert.deepEqual(guards.map(x=>x.relation),[CATALOG_FAVORITE,BLOCK_FAVORITE]);
    assert.ok(guards.every(x=>x.enabled==="O"));
    const functionAcl = await query(
      "SELECT p.prosecdef AS security_definer, " +
      "EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a " +
      "WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute " +
      "FROM pg_proc p WHERE p.oid='public.ulc_p24_personal_favorite_write_fence()'::regprocedure",
    );
    assert.equal(functionAcl[0]?.security_definer,true);
    assert.equal(functionAcl[0]?.public_execute,false);
  } finally {
    if(db) await db.client.end().catch(()=>{});
    if(created) await admin.client.unsafe("DROP DATABASE "+dbName+" WITH (FORCE)");
    await admin.client.end().catch(()=>{});
  }
});

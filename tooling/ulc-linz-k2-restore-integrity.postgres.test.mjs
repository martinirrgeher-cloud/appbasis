import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { ulcRestoreIntegritySql } from "./ulc-linz-k2-backup-plan.mjs";

// This test MUST NOT connect to Preview, production Neon, or a restored
// quarantine. It creates and drops a disposable DB on the CI localhost PG18.
const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  const u = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname) ||
      u.port !== "5432" || u.username !== "postgres" ||
      u.pathname !== "/appbasis_identity_e2e") {
    throw new Error("K2 restore structure E2E requires isolated CI PostgreSQL 18.");
  }
}
const statements = text => text.split("--> statement-breakpoint").map(x => x.trim()).filter(Boolean);

test("K2 restore: complete 69-table eight-owner schema PASS; missing fences, invalid constraints and missing owner fail", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  const dbName = "ulc_k2_integrity_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const target = new URL(DATABASE_URL);
  target.pathname = "/" + dbName;
  const admin = createPostgresDatabase(DATABASE_URL);
  let db = null;
  let created = false;
  const query = (sql, parameters=[]) => db.client.unsafe(sql,parameters);
  const verified = async () => {
    const rows = await query(ulcRestoreIntegritySql("neondb"));
    assert.equal(rows.length, 1);
    assert.equal(typeof rows[0]?.restored_integrity_ok, "boolean");
    return rows[0].restored_integrity_ok;
  };
  try {
    const version = await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(version[0]?.server_version_num)>=180000);
    await admin.client.unsafe("CREATE DATABASE "+dbName);
    created=true;
    db=createPostgresDatabase(target.toString());
    const manifest=JSON.parse(await readFile(
      new URL("../apps/ulc-linz/appbasis.database.json",import.meta.url),"utf8",
    ));
    assert.equal(manifest.owners.length,8);
    const paths=manifest.owners.flatMap(owner=>owner.migrations);
    assert.equal(paths.length,47);
    assert.equal(new Set(paths).size,47);
    for(const path of paths){
      const source=await readFile(new URL("../"+path,import.meta.url),"utf8");
      for(const stmt of statements(source)) await query(stmt);
    }
    const tableCount=await query("SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'");
    assert.equal(tableCount[0]?.count,69);
    assert.equal(await verified(),true);

    // Disabling an app-owned fence blocks the restore readiness assertion.
    await query("ALTER TABLE public.ulc_linz_training_registration DISABLE TRIGGER ulc_linz_training_registration_subject_fence");
    assert.equal(await verified(),false);
    await query("ALTER TABLE public.ulc_linz_training_registration ENABLE TRIGGER ulc_linz_training_registration_subject_fence");
    assert.equal(await verified(),true);

    // The documentation revision history has its own non-optional fence.
    await query("ALTER TABLE public.appbasis_training_documentation_revision DISABLE TRIGGER appbasis_training_documentation_guard_revision");
    assert.equal(await verified(),false);
    await query("ALTER TABLE public.appbasis_training_documentation_revision ENABLE TRIGGER appbasis_training_documentation_guard_revision");
    assert.equal(await verified(),true);

    // A NOT VALID constraint means the restore has not verified the full
    // schema's historical contents, even if table count is still 69.
    await query("ALTER TABLE public.appbasis_training_block ADD CONSTRAINT k2_unvalidated CHECK (id <> '') NOT VALID");
    assert.equal(await verified(),false);
    await query("ALTER TABLE public.appbasis_training_block DROP CONSTRAINT k2_unvalidated");
    assert.equal(await verified(),true);

    // Do not mistake 69 unrelated tables for eight correctly restored owners.
    await query("ALTER TABLE public.ulc_linz_membership RENAME TO ulc_linz_membership_missing_in_restore");
    assert.equal(await verified(),false);
    await query("ALTER TABLE public.ulc_linz_membership_missing_in_restore RENAME TO ulc_linz_membership");
    assert.equal(await verified(),true);

    // Historical Preview archives intentionally have the old minimal scope.
    const preview=await query(ulcRestoreIntegritySql("appbasis_ulc_linz_preview"));
    assert.equal(preview[0]?.restored_integrity_ok,true);
  } finally {
    if(db) await db.client.end().catch(()=>{});
    if(created) await admin.client.unsafe("DROP DATABASE "+dbName+" WITH (FORCE)");
    await admin.client.end().catch(()=>{});
  }
});

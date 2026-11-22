import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
const CANDIDATE = new URL("../apps/ulc-linz/proposals/p05-production-first-groups.candidate.sql", import.meta.url);
const EXPECTED = Object.freeze([
  ["ulc-linz-kindertraining", "Kindertraining", "trainer_roll_call", 10],
  ["ulc-linz-u12", "U12", "trainer_roll_call", 20],
  ["ulc-linz-u14", "U14", "trainer_roll_call", 30],
  ["ulc-linz-irg", "Gruppe Irrgeher", "self_registration", 40],
]);
const MODULE_MAP = Object.freeze([
  ["kindertraining", "ulc-linz-kindertraining"],
  ["u12", "ulc-linz-u12"],
  ["u14", "ulc-linz-u14"],
]);

if (DATABASE_URL) {
  const u = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname) ||
      u.port !== "5432" || u.username !== "postgres" ||
      u.pathname !== "/appbasis_identity_e2e") {
    throw new Error("P05 test only accepts disposable local PostgreSQL 18.");
  }
}
const split = sql => sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

test("P05: candidate never copies Preview or mutates person, roles, revokes or deletions", async () => {
  const sql = await readFile(CANDIDATE, "utf8");
  assert.match(sql, /^-- P05 REVIEW CANDIDATE ONLY/);
  assert.match(sql, /current_database\(\) <> 'neondb'/);
  assert.match(sql, /count\(DISTINCT organization_id\)/);
  assert.match(sql, /P05 refuses non-production organization/);
  assert.match(sql, /target_org ILIKE .*smoke/);
  assert.match(sql, /pg_catalog\.pg_tables/);
  assert.match(sql, /existing_groups = 0 AND existing_mappings = 0/);
  assert.match(sql, /exact_groups <> 4 OR exact_mappings <> 3/);
  assert.match(sql, /Gruppe Irrgeher/);
  assert.match(sql, /self_registration/);
  for (const [id, name, mode] of EXPECTED) {
    assert.ok(sql.includes("'" + id + "'"));
    assert.ok(sql.includes("'" + name + "'"));
    assert.ok(sql.includes("'" + mode + "'"));
  }
  for (const [module, id] of MODULE_MAP) {
    assert.ok(sql.includes("('" + module + "', '" + id + "')") ||
      sql.includes("(target_org, '" + module + "', '" + id + "')"));
  }
  assert.doesNotMatch(sql, /(?:(?:INSERT|UPDATE|DELETE|ALTER|TRUNCATE|DROP|GRANT|REVOKE)\s+(?:INTO\s+|FROM\s+|TABLE\s+|ON\s+)?(?:public\.)?(?:appbasis_athlete|appbasis_trainer|ulc_linz_membership|appbasis_permission|appbasis_exercise|appbasis_training_block))/i);
  assert.doesNotMatch(sql, /(?:Test U12 Montag|Preview Selbstanmeldung|COPY\s+|dblink|postgres_fdw)/i);
});

test("P05: exact four-group and three-module first run is atomic, rerunnable, and refuses mixed state", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  const name = "ulc_p05_first_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const target = new URL(DATABASE_URL);
  target.pathname = "/" + name;
  const admin = createPostgresDatabase(DATABASE_URL);
  let db, created = false;
  const query = (s, params = []) => db.client.unsafe(s, params);
  try {
    const version = await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(version[0]?.server_version_num) >= 180000);
    await admin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    db = createPostgresDatabase(target.toString());
    const manifest = JSON.parse(await readFile(new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url),"utf8"));
    assert.equal(manifest.owners.length, 8);
    const migrations = manifest.owners.flatMap(o => o.migrations);
    assert.equal(migrations.length, 46);
    for (const path of migrations) {
      const sql = await readFile(new URL("../" + path, import.meta.url), "utf8");
      for (const stmt of split(sql)) await query(stmt);
    }
    await query(
      "INSERT INTO public.ulc_linz_membership(identity_id,organization_id,subject_id,source_role) VALUES ($1,$2,$3,'trainer')",
      ["synthetic-id-1", "ulc-synthetic-org", "synthetic-trainer-1"],
    );
    const original = await readFile(CANDIDATE, "utf8");
    // The candidate must refuse direct application to the wrong DB.
    await assert.rejects(query(original), /P05 refuses wrong database/);
    const candidate = original.replace(
      "current_database() <> 'neondb'",
      "current_database() <> '" + name + "'",
    );
    assert.notEqual(candidate, original);
    const counts = async () => {
      const [a,b] = await Promise.all([
        query("SELECT id,name,attendance_mode,sort_order FROM public.appbasis_training_group ORDER BY sort_order"),
        query("SELECT module_id,group_id FROM public.ulc_linz_training_module_group ORDER BY module_id"),
      ]);
      return {
        groups: a.map(x => [x.id,x.name,x.attendance_mode,x.sort_order]),
        mappings: b.map(x => [x.module_id,x.group_id]),
      };
    };
    await query(candidate);
    const first = await counts();
    assert.deepEqual(first.groups, EXPECTED);
    assert.deepEqual(first.mappings, MODULE_MAP);
    await query(candidate);
    assert.deepEqual(await counts(), first);
    const createdAt = await query("SELECT id,created_at::text FROM public.appbasis_training_group ORDER BY id");
    await query(candidate);
    assert.deepEqual(await query("SELECT id,created_at::text FROM public.appbasis_training_group ORDER BY id"), createdAt);

    // A synthetic smoke membership is not authority to initialize the
    // real club. This is the exact negative scenario missed before P05.
    await query("UPDATE public.ulc_linz_membership SET organization_id='ulc-linz-m6-smoke' WHERE identity_id='synthetic-id-1'");
    await assert.rejects(query(candidate), /P05 refuses non-production organization/);
    await query("UPDATE public.ulc_linz_membership SET organization_id='ulc-synthetic-org' WHERE identity_id='synthetic-id-1'");
    assert.deepEqual(await counts(), first);


    // Fail closed when an actual group was renamed or attendance mode changed.
    await query("UPDATE public.appbasis_training_group SET attendance_mode='self_registration' WHERE id='ulc-linz-u14'");
    await assert.rejects(query(candidate), /P05 group names or module mappings differ/);
    await query("UPDATE public.appbasis_training_group SET attendance_mode='trainer_roll_call' WHERE id='ulc-linz-u14'");
    assert.deepEqual(await counts(), first);

    // Fail closed when a partial/mixed schema already exists, never silently
    // re-add a missing owner mapping or erase an unexpected group.
    await query("DELETE FROM public.ulc_linz_training_module_group WHERE module_id='u12'");
    await assert.rejects(query(candidate), /P05 refuses partly initialized/);
    assert.equal((await counts()).mappings.length, 2);
    await query("INSERT INTO public.ulc_linz_training_module_group(organization_id,module_id,group_id) VALUES ('ulc-synthetic-org','u12','ulc-linz-u12')");

    // Another organization's membership makes target identity ambiguous.
    await query(
      "INSERT INTO public.ulc_linz_membership(identity_id,organization_id,subject_id,source_role) VALUES ($1,$2,$3,'trainer')",
      ["synthetic-id-2", "another-org", "synthetic-trainer-2"],
    );
    await assert.rejects(query(candidate), /P05 requires exactly one active ULC organization/);
    assert.deepEqual(await counts(), first);

    const safeCounts = await query("SELECT (SELECT count(*) FROM public.appbasis_trainer)::int AS trainers, (SELECT count(*) FROM public.appbasis_athlete)::int AS athletes, (SELECT count(*) FROM public.appbasis_permission_principal_revoke)::int AS revokes");
    assert.deepEqual(safeCounts.map(x=>({trainers:x.trainers,athletes:x.athletes,revokes:x.revokes})),[{trainers:0,athletes:0,revokes:0}]);
  } finally {
    await db?.client.end().catch(()=>{});
    if (created) await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
    await admin.client.end().catch(()=>{});
  }
});

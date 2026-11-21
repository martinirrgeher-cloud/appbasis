import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

// P2-P4 regression. Provider access and live database writes are forbidden.
// Only a random, disposable database on the local CI PostgreSQL service is used.
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p24-owner-org";
const OTHER = "p24-neighbor-org";
const TARGET = "p24-target";
const NEIGHBOR = "p24-neighbor";
const FOREIGN = "p24-foreign";
const STALE = "p24-stale-source-marker";
const APPMARKED = "p24-app-marker";
const BASE = [
  "../modules/athletes/migrations/0000_appbasis_athletes_foundation.sql",
  "../modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
  "../apps/ulc-linz/migrations/0004_ulc_linz_training_sessions.sql",
  "../apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql",
  "../apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql",
];
const CANDIDATE = "../apps/ulc-linz/proposals/p24-source-owner-training-fence.candidate.sql";

function statements(text) {
  return text.split("--> statement-breakpoint").map(x => x.trim()).filter(Boolean);
}
if (DATABASE_URL) {
  const url = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.username !== "postgres" || url.port !== "5432" ||
      url.pathname !== "/appbasis_identity_e2e") {
    throw new Error("P2-P4 proof requires the disposable localhost PostgreSQL 18 CI database.");
  }
}

test("P2-P4: 0017 source-owner gap and additive candidate are tested only on disposable PostgreSQL", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  const dbName = "ulc_p24_guard_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const targetUrl = new URL(DATABASE_URL);
  targetUrl.pathname = "/" + dbName;
  const admin = createPostgresDatabase(DATABASE_URL);
  let db = null;
  let created = false;
  const execute = async (sql, parameters = []) => db.client.unsafe(sql, parameters);
  const insertAttendance = (org, session, subject) => execute(
    "INSERT INTO ulc_linz_training_attendance (organization_id,session_id,athlete_id,status) VALUES ($1,$2,$3,'present')",
    [org, session, subject],
  );
  const insertRegistration = (org, session, subject) => execute(
    "INSERT INTO ulc_linz_training_registration (organization_id,session_id,athlete_id,intention,updated_by_identity_id) VALUES ($1,$2,$3,'attending','p24-actor')",
    [org, session, subject],
  );
  const insertHistory = (id, org, session, subject) => execute(
    "INSERT INTO ulc_linz_training_registration_change (id,organization_id,session_id,athlete_id,intention,revision,actor_identity_id) VALUES ($1,$2,$3,$4,'attending',1,'p24-actor')",
    [id, org, session, subject],
  );
  const marker = async (org, subject, table) => {
    const completed = "2026-11-20T12:00:00Z";
    const purge = "2026-12-25T12:00:00Z";
    if (table === "source") {
      return execute(
        "INSERT INTO appbasis_athletes_deletion (entity_type,entity_id,organization_id,completed_at,purge_after) VALUES ('athlete',$1,$2,$3,$4)",
        [subject, org, completed, purge],
      );
    }
    return execute(
      "INSERT INTO ulc_linz_training_subject_deletion (organization_id,athlete_id,completed_at,purge_after) VALUES ($1,$2,$3,$4)",
      [org, subject, completed, purge],
    );
  };
  try {
    await admin.client.unsafe("CREATE DATABASE " + dbName);
    created = true;
    db = createPostgresDatabase(targetUrl.toString());
    const pg = await execute("SHOW server_version_num");
    assert.ok(Number(pg[0]?.server_version_num) >= 180000);
    for (const path of BASE) {
      const sql = await readFile(new URL(path, import.meta.url), "utf8");
      for (const statement of statements(sql)) await execute(statement);
    }
    const initial = await execute(
      "SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='public'",
    );
    assert.equal(initial[0]?.total, 11);
    for (const [id, org] of [
      [TARGET, ORG], [NEIGHBOR, ORG], [STALE, ORG],
      [APPMARKED, ORG], [FOREIGN, OTHER],
    ]) {
      await execute(
        "INSERT INTO appbasis_athlete (id,organization_id,first_name,last_name) VALUES ($1,$2,'Synthetic','Athlete')",
        [id, org],
      );
    }
    for (const [org, session] of [[ORG, "p24-own-session"], [OTHER, "p24-foreign-session"]]) {
      await execute(
        "INSERT INTO ulc_linz_training_session (id,organization_id,module_id,group_id,session_date) VALUES ($1,$2,'u12','p24-group','2026-11-20')",
        [session, org],
      );
    }
    await insertAttendance(ORG, "p24-own-session", TARGET);
    await insertRegistration(ORG, "p24-own-session", TARGET);
    await insertHistory("p24-change-target", ORG, "p24-own-session", TARGET);

    // Canonical athlete owner marks and removes the source, but app-owned
    // 0017 marker was not populated yet. Demonstrate the existing source gap.
    await db.client.begin(async tx => {
      await tx.unsafe(
        "INSERT INTO appbasis_athletes_deletion (entity_type,entity_id,organization_id,completed_at,purge_after) VALUES ('athlete',$1,$2,'2026-11-20T12:00:00Z','2026-12-25T12:00:00Z')",
        [TARGET, ORG],
      );
      await tx.unsafe(
        "DELETE FROM appbasis_athlete WHERE id=$1 AND organization_id=$2",
        [TARGET, ORG],
      );
    });
    const acceptedStaleUpdate = await execute(
      "UPDATE ulc_linz_training_attendance SET status='excused' WHERE organization_id=$1 AND athlete_id=$2 RETURNING status",
      [ORG, TARGET],
    );
    assert.equal(acceptedStaleUpdate[0]?.status, "excused", "published 0017 still accepts a stale source-deleted athlete update");
    const evidence = await execute(
      "SELECT count(*)::int AS total FROM ulc_linz_training_subject_deletion WHERE organization_id=$1 AND athlete_id=$2",
      [ORG, TARGET],
    );
    assert.equal(evidence[0]?.total, 0, "the app-owned marker must not be forged in the baseline proof");

    // Candidate replaces the function body without adding any table, grant or
    // a new runtime caller. The same three 0017 triggers stay installed.
    const sql = await readFile(new URL(CANDIDATE, import.meta.url), "utf8");
    const statementsToApply = statements(sql);
    assert.equal(statementsToApply.length, 2);
    for (const statement of statementsToApply) await execute(statement);
    const after = await execute(
      "SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='public'",
    );
    assert.equal(after[0]?.total, initial[0]?.total);

    // Deny all three legacy direct SQL insertion paths for a source-deleted
    // athlete, even when the app-local marker is absent.
    for (const operation of [
      () => insertAttendance(ORG, "p24-own-session", TARGET),
      () => insertRegistration(ORG, "p24-own-session", TARGET),
      () => insertHistory("p24-stale-history", ORG, "p24-own-session", TARGET),
    ]) {
      await assert.rejects(operation(), /active canonical athlete/i);
    }
    await assert.rejects(execute(
      "UPDATE ulc_linz_training_attendance SET status='excused' WHERE organization_id=$1 AND athlete_id=$2",
      [ORG, TARGET],
    ), /active canonical athlete/i);
    await assert.rejects(execute(
      "UPDATE ulc_linz_training_registration SET intention='maybe' WHERE organization_id=$1 AND athlete_id=$2",
      [ORG, TARGET],
    ), /active canonical athlete/i);
    await assert.rejects(execute(
      "UPDATE ulc_linz_training_registration_change SET intention='maybe' WHERE organization_id=$1 AND athlete_id=$2",
      [ORG, TARGET],
    ), /active canonical athlete/i);

    // Neither a still-live source deletion marker nor the existing app-owned
    // marker can be bypassed by direct SQL.
    await marker(ORG, STALE, "source");
    await assert.rejects(insertAttendance(ORG, "p24-own-session", STALE), /deletion marker/i);
    await marker(ORG, APPMARKED, "app");
    await assert.rejects(insertAttendance(ORG, "p24-own-session", APPMARKED), /deletion marker/i);
    await assert.rejects(insertRegistration(ORG, "p24-own-session", STALE), /deletion marker/i);
    await assert.rejects(insertHistory("p24-app-marker-history", ORG, "p24-own-session", APPMARKED), /deletion marker/i);

    // Normal neighbor in the same organization and a separate organization
    // retain their writes; spoofing the other session scope is prohibited.
    await insertAttendance(ORG, "p24-own-session", NEIGHBOR);
    await insertRegistration(ORG, "p24-own-session", NEIGHBOR);
    await insertHistory("p24-neighbor-history", ORG, "p24-own-session", NEIGHBOR);
    await insertAttendance(OTHER, "p24-foreign-session", FOREIGN);
    await insertRegistration(OTHER, "p24-foreign-session", FOREIGN);
    await insertHistory("p24-foreign-history", OTHER, "p24-foreign-session", FOREIGN);
    await assert.rejects(insertAttendance(ORG, "p24-foreign-session", NEIGHBOR), /session ownership/i);
    await assert.rejects(execute(
      "UPDATE ulc_linz_training_attendance SET athlete_id=$1 WHERE athlete_id=$2 AND organization_id=$3",
      [TARGET, NEIGHBOR, ORG],
    ), /ownership is immutable/i);

    const fn = await execute(
      "SELECT p.prosecdef AS security_definer, p.proconfig AS config, EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p WHERE p.oid='public.ulc_linz_training_subject_write_fence()'::regprocedure",
    );
    assert.equal(fn[0]?.security_definer, true);
    assert.equal(fn[0]?.public_execute, false);
    assert.ok(fn[0]?.config?.some(x => x === "search_path=pg_catalog, pg_temp"));
  } finally {
    if (db) await db.client.end().catch(() => {});
    if (created) {
      await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
    }
    await admin.client.end().catch(() => {});
  }
});

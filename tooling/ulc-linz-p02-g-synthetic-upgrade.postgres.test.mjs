import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { loadUlcP02ParityRehearsalPlan } from "./ulc-linz-p02-parity-rehearsal.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  const url = new URL(DATABASE_URL);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.username !== "postgres" || url.port !== "5432" ||
    url.pathname !== "/appbasis_identity_e2e"
  ) throw new Error("P02-G accepts only disposable local PostgreSQL 18.");
}

/**
 * Derived from a READ-ONLY 2026-11-20 inspection of the actual Neon
 * production public schema. These are exact file identities, not guesses
 * based on table count. No user data or provider credentials are stored.
 */
export const MISSING_PRODUCTION_MIGRATIONS = Object.freeze([
  "modules/athletes/migrations/0002_appbasis_athlete_contacts.sql",
  "modules/athletes/migrations/0003_appbasis_training_group_attendance_mode.sql",
  "modules/training-blocks/migrations/0002_appbasis_training_block_multi_audience.sql",
  "modules/training-blocks/migrations/0003_appbasis_training_block_category.sql",
  "modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql",
  "modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql",
  "modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
  "modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql",
  "modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql",
  "apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql",
  "apps/ulc-linz/migrations/0009_ulc_linz_functionary_role.sql",
  "apps/ulc-linz/migrations/0010_ulc_linz_registration_notes.sql",
  "apps/ulc-linz/migrations/0011_ulc_linz_youth_training_content.sql",
  "apps/ulc-linz/migrations/0012_ulc_linz_youth_training_catalog.sql",
  "apps/ulc-linz/migrations/0013_ulc_linz_youth_categories.sql",
  "apps/ulc-linz/migrations/0014_ulc_linz_youth_group_categories.sql",
  "apps/ulc-linz/migrations/0015_ulc_linz_training_trainer_attendance.sql",
]);

/** Exact public table names read from the CURRENT 51-table Production schema. */
export const PRODUCTION_BASE_TABLES = Object.freeze([
  "account", "appbasis_athlete", "appbasis_athlete_group_membership",
  "appbasis_athletes_deletion", "appbasis_exercise_catalog_audience",
  "appbasis_exercise_catalog_favorite", "appbasis_exercise_catalog_item",
  "appbasis_exercise_catalog_parameter", "appbasis_exercise_catalog_private_media",
  "appbasis_exercise_catalog_similarity", "appbasis_exercise_catalog_usage",
  "appbasis_exercise_catalog_video", "appbasis_identity_operation",
  "appbasis_identity_security_state", "appbasis_permission_administration_audit",
  "appbasis_permission_capability", "appbasis_permission_principal",
  "appbasis_permission_principal_grant", "appbasis_permission_principal_revoke",
  "appbasis_permission_principal_role", "appbasis_permission_role",
  "appbasis_permission_role_capability", "appbasis_person", "appbasis_trainer",
  "appbasis_trainer_group_membership", "appbasis_training_block",
  "appbasis_training_block_favorite", "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter", "appbasis_training_block_usage",
  "appbasis_training_group", "appbasis_training_plan",
  "appbasis_training_plan_revision", "appbasis_training_plan_revision_item",
  "session", "ulc_linz_exercise_catalog_item", "ulc_linz_exercise_favorite",
  "ulc_linz_exercise_group", "ulc_linz_exercise_parameter",
  "ulc_linz_lifecycle_audit", "ulc_linz_lifecycle_deletion",
  "ulc_linz_membership", "ulc_linz_security_event_log",
  "ulc_linz_subject_scope", "ulc_linz_trainer_identity_audit",
  "ulc_linz_training_attendance", "ulc_linz_training_module_group",
  "ulc_linz_training_session", "user", "verification",
]);

const ORG = "synthetic-p02-g-org";
const ATHLETE = "synthetic-p02-g-athlete";
const GROUP = "synthetic-p02-g-group";
const SESSION = "synthetic-p02-g-session";

async function tableNames(db) {
  return (await db.client.unsafe(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename"
  )).map(row => row.tablename);
}
async function applyFiles(db, files) {
  for (const file of files) {
    for (const statement of file.statements) await db.client.unsafe(statement);
  }
}
async function columns(db, name) {
  return (await db.client.unsafe(
    "SELECT column_name FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [name]
  )).map(row => row.column_name);
}
async function preserved(db) {
  const rows = await db.client.unsafe(
    "SELECT " +
    "(SELECT count(*)::int FROM ulc_linz_training_session WHERE id=$1) AS sessions, " +
    "(SELECT count(*)::int FROM ulc_linz_training_attendance " +
    "WHERE session_id=$1 AND athlete_id=$2) AS attendance, " +
    "(SELECT count(*)::int FROM appbasis_training_group WHERE id=$3) AS groups, " +
    "(SELECT count(*)::int FROM appbasis_exercise_catalog_item " +
    "WHERE id='synthetic-p02-g-exercise') AS exercises",
    [SESSION, ATHLETE, GROUP]
  );
  return rows[0];
}

test("P02-G: actual in-place synthetic 51→64→66→68→69 upgrade retains existing records and rolls back", {
  skip: !DATABASE_URL, timeout: 170_000,
}, async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const dbName = "ulc_p02_g_" + suffix;
  const isolated = new URL(DATABASE_URL);
  isolated.pathname = "/" + dbName;
  const admin = createPostgresDatabase(DATABASE_URL);
  let db = null;
  let created = false;
  try {
    const version = await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(version[0]?.server_version_num) >= 180000);
    const plan = await loadUlcP02ParityRehearsalPlan();
    const missingSet = new Set(MISSING_PRODUCTION_MIGRATIONS);
    assert.equal(missingSet.size, 17);
    assert.equal(plan.registeredFiles.length, 41);
    const baselineFiles = plan.registeredFiles.filter(f => !missingSet.has(f.path));
    const omittedFiles = plan.registeredFiles.filter(f => missingSet.has(f.path));
    assert.equal(baselineFiles.length, 24);
    assert.equal(omittedFiles.length, 17);
    assert.deepEqual(omittedFiles.map(f => f.path), MISSING_PRODUCTION_MIGRATIONS,
      "must be exactly the documented 17 missing owner migrations in manifest order");
    assert.equal(new Set(PRODUCTION_BASE_TABLES).size, 51);

    await admin.client.unsafe("CREATE DATABASE " + dbName);
    created = true;
    db = createPostgresDatabase(isolated.toString());

    // Build the old, CURRENT production-equivalent schema from original
    // owner files in manifest order, skipping only the 17 proven gaps.
    await applyFiles(db, baselineFiles);
    assert.deepEqual(await tableNames(db), [...PRODUCTION_BASE_TABLES].sort(),
      "synthetic baseline MUST match every actual Production public table");
    assert.deepEqual(await columns(db, "ulc_linz_training_attendance"),
      ["organization_id","session_id","athlete_id","status","created_at","updated_at"]);

    await db.client.unsafe(
      "INSERT INTO appbasis_training_group " +
      "(id,organization_id,name,short_name) " +
      "VALUES ($1,$2,'Synthetic U12','U12')", [GROUP, ORG]
    );
    await db.client.unsafe(
      "INSERT INTO ulc_linz_training_session " +
      "(id,organization_id,module_id,group_id,session_date,note) " +
      "VALUES ($1,$2,'u12',$3,'2026-10-20','Keep legacy session note')",
      [SESSION,ORG,GROUP]
    );
    await db.client.unsafe(
      "INSERT INTO ulc_linz_training_attendance " +
      "(organization_id,session_id,athlete_id,status) VALUES ($1,$2,$3,'present')",
      [ORG,SESSION,ATHLETE]
    );
    await db.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_item " +
      "(id,organization_id,name,category_key) " +
      "VALUES ('synthetic-p02-g-exercise',$1,'Legacy sprint','speed')",
      [ORG]
    );
    const original = {
      sessions:1,attendance:1,groups:1,exercises:1,
    };
    assert.deepEqual(await preserved(db), original);

    // Failure is deliberately injected AFTER real DDL and must undo the
    // ENTIRE 51→64 package while retaining old rows, constraints and indexes.
    await assert.rejects(db.client.begin(async tx => {
      for (const file of omittedFiles) {
        for (const statement of file.statements) await tx.unsafe(statement);
      }
      throw new Error("SYNTHETIC_P02_G_UPGRADE_ABORT");
    }), /SYNTHETIC_P02_G_UPGRADE_ABORT/);
    assert.deepEqual(await tableNames(db), [...PRODUCTION_BASE_TABLES].sort());
    assert.deepEqual(await preserved(db), original);

    // Perform the exact in-place, additive upgrade in migration order.
    await db.client.begin(async tx => {
      for (const file of omittedFiles) {
        for (const statement of file.statements) await tx.unsafe(statement);
      }
    });
    assert.equal((await tableNames(db)).length, 64);
    for (const [table, column] of [
      ["appbasis_training_group","attendance_mode"],
      ["appbasis_training_block_revision","audience_ids"],
      ["appbasis_training_block_revision","category"],
      ["ulc_linz_training_session","training_content_titles"],
      ["ulc_linz_training_session","training_content_items"],
      ["ulc_linz_training_attendance","training_content_slots"],
    ]) assert.ok((await columns(db, table)).includes(column),
      "missing additive column " + table + "." + column);
    assert.deepEqual(await preserved(db), original);
    const legacyRows = await db.client.unsafe(
      "SELECT training_content_titles, training_content_items, note " +
      "FROM ulc_linz_training_session WHERE id=$1", [SESSION]
    );
    assert.deepEqual(legacyRows[0]?.training_content_titles, []);
    assert.deepEqual(legacyRows[0]?.training_content_items, []);
    assert.equal(legacyRows[0]?.note, "Keep legacy session note");
    const group = await db.client.unsafe(
      "SELECT attendance_mode FROM appbasis_training_group WHERE id=$1", [GROUP]
    );
    assert.equal(group[0]?.attendance_mode, "trainer_roll_call");

    await db.client.begin(async tx => {
      for (const statement of plan.isolatedCalendarFile.statements) {
        await tx.unsafe(statement);
      }
    });
    assert.equal((await tableNames(db)).length, 66);
    assert.deepEqual(await preserved(db), original);

    await db.client.begin(async tx => {
      for (const candidate of plan.isolatedCandidateFiles) {
        for (const statement of candidate.statements) await tx.unsafe(statement);
      }
    });
    assert.equal((await tableNames(db)).length, 68);

    const appSql = (await import("node:fs/promises")).readFile;
    const fence = (await appSql(new URL(
      "../apps/ulc-linz/test/fixtures/p03-d-training-subject-write-fence.candidate.sql",
      import.meta.url), "utf8")).split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean);
    await db.client.begin(async tx => {
      for (const statement of fence) await tx.unsafe(statement);
    });
    assert.equal((await tableNames(db)).length, 69);
    assert.deepEqual(await preserved(db), original);

    // The existing stored row can still be edited legitimately after upgrade.
    await db.client.unsafe(
      "UPDATE ulc_linz_training_attendance SET status='excused' " +
      "WHERE organization_id=$1 AND session_id=$2 AND athlete_id=$3",
      [ORG,SESSION,ATHLETE]
    );
    assert.deepEqual(await preserved(db), original);
    const updated = await db.client.unsafe(
      "SELECT status,training_content_slots FROM ulc_linz_training_attendance " +
      "WHERE session_id=$1 AND athlete_id=$2", [SESSION,ATHLETE]
    );
    assert.equal(updated[0]?.status, "excused");
    assert.deepEqual(updated[0]?.training_content_slots, []);

    // No actual migration ledger was found in read-only production metadata;
    // this proves an isolated synthetic DDL transition, not a production apply.
    assert.equal(plan.migrationExecutionAuthorized, false);
  } finally {
    if (db) await db.client.end().catch(() => {});
    if (created) await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
    await admin.client.end().catch(() => {});
  }
});

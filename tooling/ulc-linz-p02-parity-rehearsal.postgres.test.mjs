import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  assessUlcP02CatalogRestoreMarkers,
  CALENDAR_MIGRATION,
  CATALOG_GUARD_TABLES,
  loadUlcP02ParityRehearsalPlan,
} from "./ulc-linz-p02-parity-rehearsal.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "synthetic-p02-e-org";
const PRINCIPAL = "synthetic-p02-e-person";
const WHEN = "2026-11-20T07:00:00.000Z";
const PURGE = "2026-12-25T07:00:00.000Z";

function databaseUrl(name) {
  const value = new URL(DATABASE_URL);
  value.pathname = "/" + name;
  return value.toString();
}
async function publicTableCount(db) {
  const rows = await db.client.unsafe(
    "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'",
  );
  return Number(rows[0]?.count);
}
async function markerRows(db) {
  const rows = await db.client.unsafe(
    `SELECT organization_id, principal_id, completed_at, purge_after
       FROM appbasis_exercise_catalog_favorite_deletion ORDER BY organization_id, principal_id`,
  );
  return rows.map(row => ({
    organization_id: row.organization_id,
    principal_id: row.principal_id,
    completed_at: new Date(row.completed_at).toISOString(),
    purge_after: new Date(row.purge_after).toISOString(),
  }));
}
async function syntheticOwnerErasure(db, completedAt = WHEN, purgeAfter = PURGE) {
  await db.client.begin(async tx => {
    await tx.unsafe(
      "SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array($1::text,$2::text)::text,0))",
      [ORG, PRINCIPAL],
    );
    await tx.unsafe(
      `INSERT INTO appbasis_exercise_catalog_favorite_deletion
        (organization_id, principal_id, completed_at, purge_after)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id, principal_id) DO NOTHING`,
      [ORG, PRINCIPAL, completedAt, purgeAfter],
    );
    await tx.unsafe(
      `DELETE FROM appbasis_exercise_catalog_favorite
       WHERE organization_id=$1 AND principal_id=$2`,
      [ORG, PRINCIPAL],
    );
  });
}

test("P2-E: exact 64→66→68 migration stages, scoped ACL, rollback and stale-restore quarantine on disposable PostgreSQL 18", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  // NEVER a provider/Preview/Production connection. Make a disposable
  // database inside the local PostgreSQL-18 GitHub Actions service.
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const primaryName = "ulc_p02_e_" + suffix;
  const oldBackupName = "ulc_p02_e_old_" + suffix;
  const role = "ulc_p02_e_app_" + suffix;
  const admin = createPostgresDatabase(DATABASE_URL);
  let primary = null;
  let oldBackup = null;
  let primaryCreated = false;
  let oldBackupCreated = false;
  let roleCreated = false;
  try {
    const plan = await loadUlcP02ParityRehearsalPlan();
    assert.equal(plan.registeredFiles.length, 41);
    assert.equal(plan.isolatedCalendarFile.path, CALENDAR_MIGRATION);
    assert.equal(plan.isolatedCandidateFiles.length, 2);
    await admin.client.unsafe("CREATE DATABASE " + primaryName);
    primaryCreated = true;
    primary = createPostgresDatabase(databaseUrl(primaryName));

    // Apply canonical owner files only; nothing was registered or migrated
    // in the real application database by this test.
    for (const file of plan.registeredFiles) {
      for (const sql of file.statements) await primary.client.unsafe(sql);
    }
    assert.equal(await publicTableCount(primary), 64,
      "current manifest must yield exactly 64 tables");
    for (const sql of plan.isolatedCalendarFile.statements) {
      await primary.client.unsafe(sql);
    }
    assert.equal(await publicTableCount(primary), 66,
      "calendar v17 is an independent, not yet registered migration");

    // If a candidate catalog migration fails, the entire transaction must
    // roll back; the current 66-table Preview must be left untouched.
    await assert.rejects(primary.client.begin(async tx => {
      for (const sql of plan.isolatedCandidateFiles[0].statements) {
        await tx.unsafe(sql);
      }
      throw new Error("SYNTHETIC_P02_E_ABORT");
    }), /SYNTHETIC_P02_E_ABORT/);
    assert.equal(await publicTableCount(primary), 66);
    for (const table of CATALOG_GUARD_TABLES) {
      const rows = await primary.client.unsafe(
        "SELECT to_regclass($1::text) AS relation",
        ["public." + table],
      );
      assert.equal(rows[0]?.relation, null);
    }

    // Prospective schema only on a disposable database. The fixture files
    // MUST remain unregistered until separately approved.
    await primary.client.begin(async tx => {
      for (const candidate of plan.isolatedCandidateFiles) {
        for (const sql of candidate.statements) await tx.unsafe(sql);
      }
    });
    assert.equal(await publicTableCount(primary), 68);
    const relation = await primary.client.unsafe(
      `SELECT conname FROM pg_catalog.pg_constraint
       WHERE conname='appbasis_exercise_catalog_usage_subject_usage_fk'`,
    );
    assert.equal(relation.length, 1, "subject ownership must retain the real usage FK");

    // Exact per-relation preview-app role capabilities: normal item/favorite
    // operations and explicit subject usage, but NEVER deletion marker DML.
    // Create only a synthetic NOLOGIN role, not the real Neon application role.
    await admin.client.unsafe("CREATE ROLE " + role + " NOLOGIN");
    roleCreated = true;
    await primary.client.unsafe("GRANT USAGE ON SCHEMA public TO " + role);
    for (const [privileges, table] of [
      ["SELECT,INSERT,UPDATE", "appbasis_exercise_catalog_item"],
      ["SELECT,INSERT,DELETE", "appbasis_exercise_catalog_favorite"],
      ["SELECT", "appbasis_exercise_catalog_favorite_deletion"],
      ["SELECT", "appbasis_training_plan"],
      ["SELECT", "appbasis_training_plan_revision"],
      ["SELECT", "appbasis_training_plan_revision_item"],
      ["SELECT,INSERT", "appbasis_training_block_usage"],
      ["SELECT,INSERT", "appbasis_training_block_usage_subject"],
      ["SELECT", "appbasis_training_block_usage_subject_deletion"],
    ]) {
      await primary.client.unsafe(
        `GRANT ${privileges} ON public.${table} TO ${role}`,
      );
    }
    const rights = await primary.client.unsafe(
      `SELECT
        has_table_privilege($1,'appbasis_training_block_usage_subject','INSERT') AS block_insert,
        has_table_privilege($1,'appbasis_training_block_usage_subject','SELECT') AS block_subject_read,
        has_table_privilege($1,'appbasis_training_block_usage_subject_deletion','SELECT') AS block_marker_read,
        has_table_privilege($1,'appbasis_exercise_catalog_favorite_deletion','SELECT') AS favorite_marker_read,
        has_table_privilege($1,'appbasis_exercise_catalog_favorite_deletion','INSERT') AS favorite_marker_insert,
        has_table_privilege($1,'appbasis_exercise_catalog_favorite_deletion','UPDATE') AS favorite_marker_update,
        has_table_privilege($1,'appbasis_exercise_catalog_favorite_deletion','DELETE') AS favorite_marker_delete,
        has_table_privilege($1,'appbasis_training_block_usage_subject_deletion','INSERT') AS block_marker_insert,
        has_table_privilege($1,'appbasis_training_block_usage_subject_deletion','DELETE') AS block_marker_delete`,
      [role],
    );
    assert.deepEqual(rights[0], {
      block_insert: true,
      block_subject_read: true,
      block_marker_read: true,
      favorite_marker_read: true,
      favorite_marker_insert: false,
      favorite_marker_update: false,
      favorite_marker_delete: false,
      block_marker_insert: false,
      block_marker_delete: false,
    });

    // SQL permission denial, not merely a permission-API assertion.
    for (const table of [
      "appbasis_exercise_catalog_favorite_deletion",
      "appbasis_training_block_usage_subject_deletion",
    ]) {
      await assert.rejects(primary.client.begin(async tx => {
        await tx.unsafe("SET LOCAL ROLE " + role);
        await tx.unsafe(`DELETE FROM public.${table} WHERE false`);
      }), /permission denied/i);
    }

    await primary.client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_item
       (id,organization_id,name,category_key)
       VALUES ('synthetic-sprint','${ORG}','Synthetic Sprint','speed')`,
    );
    await primary.client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_favorite
       (organization_id,principal_id,exercise_id)
       VALUES ($1,$2,'synthetic-sprint')`,
      [ORG, PRINCIPAL],
    );

    // Snapshot the *older* schema/data BEFORE an authorized deletion. A
    // restore from this backup may revive a now-erased favorite.
    await primary.client.end();
    primary = null;
    await admin.client.unsafe(
      "CREATE DATABASE " + oldBackupName + " WITH TEMPLATE " + primaryName,
    );
    oldBackupCreated = true;
    primary = createPostgresDatabase(databaseUrl(primaryName));
    oldBackup = createPostgresDatabase(databaseUrl(oldBackupName));

    await syntheticOwnerErasure(primary);
    const sourceMarkers = await markerRows(primary);
    const oldMarkers = await markerRows(oldBackup);
    assert.equal(sourceMarkers.length, 1);
    assert.equal(oldMarkers.length, 0);
    await assert.rejects(async () =>
      assessUlcP02CatalogRestoreMarkers(sourceMarkers, oldMarkers),
    /candidate quarantined/);
    const revived = await oldBackup.client.unsafe(
      `SELECT count(*)::int AS count FROM appbasis_exercise_catalog_favorite
       WHERE organization_id=$1 AND principal_id=$2`, [ORG, PRINCIPAL],
    );
    assert.equal(Number(revived[0]?.count), 1,
      "unreconciled old backup demonstrably revives erased data");

    // Demonstrate ONLY the isolated, owner-serialized marker replay contract.
    // This is NOT an authorized full Production restore or all-owner replay.
    await syntheticOwnerErasure(oldBackup);
    await syntheticOwnerErasure(oldBackup);
    const restoredMarkers = await markerRows(oldBackup);
    assert.equal(assessUlcP02CatalogRestoreMarkers(
      sourceMarkers, restoredMarkers,
    ).promotionAuthorized, false);
    const after = await oldBackup.client.unsafe(
      `SELECT count(*)::int AS count FROM appbasis_exercise_catalog_favorite
       WHERE organization_id=$1 AND principal_id=$2`, [ORG, PRINCIPAL],
    );
    assert.equal(Number(after[0]?.count), 0);
  } finally {
    if (oldBackup) await oldBackup.client.end().catch(() => {});
    if (primary) await primary.client.end().catch(() => {});
    if (oldBackupCreated) {
      await admin.client.unsafe("DROP DATABASE " + oldBackupName + " WITH (FORCE)");
    }
    if (primaryCreated) {
      await admin.client.unsafe("DROP DATABASE " + primaryName + " WITH (FORCE)");
    }
    if (roleCreated) {
      await admin.client.unsafe("DROP ROLE " + role);
    }
    await admin.client.end().catch(() => {});
  }
});

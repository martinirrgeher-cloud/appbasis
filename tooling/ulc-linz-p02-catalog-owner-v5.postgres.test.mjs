import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

/**
 * Isolated module v5 migration candidate. NO provider, Preview or Production
 * database access is permitted. This is NOT a deployment or schema grant.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_FILES = [
  "../modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
  "../modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
  "../modules/exercise-catalog/migrations/0002_appbasis_exercise_catalog_parity.sql",
  "../modules/exercise-catalog/migrations/0003_appbasis_exercise_catalog_private_media_delete_state.sql",
];
const CANDIDATE =
  "../modules/exercise-catalog/test/fixtures/0004_appbasis_exercise_catalog_subject_lifecycle.candidate.sql";

if (DATABASE_URL) {
  const target = new URL(DATABASE_URL);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(target.hostname) ||
    target.username !== "postgres" ||
    target.port !== "5432" ||
    target.pathname !== "/appbasis_identity_e2e"
  ) throw new Error("P2-F requires ONLY local, disposable PostgreSQL-18 CI.");
}

function sqlStatements(sql) {
  return sql.split("--> statement-breakpoint").map(part =>
    part.replace(/^\s*--(?!>)[^\n]*(?:\n|$)/gm, "").trim()
  ).filter(Boolean);
}

test("P2-F: expand 8→10 catalog tables with legacy row preservation, rollback, FK and real SQL deny", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const dbName = "ulc_p02_f_" + id;
  const roleName = "ulc_p02_f_reader_" + id;
  const target = new URL(DATABASE_URL);
  target.pathname = "/" + dbName;
  const admin = createPostgresDatabase(DATABASE_URL);
  let isolated = null;
  let createdDb = false;
  let createdRole = false;
  try {
    const version = await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(version[0]?.server_version_num) >= 180000,
      "P2-F SQL evidence requires PostgreSQL 18");
    await admin.client.unsafe("CREATE DATABASE " + dbName);
    createdDb = true;
    isolated = createPostgresDatabase(target.toString());

    for (const path of BASE_FILES) {
      const sql = await readFile(new URL(path, import.meta.url), "utf8");
      for (const statement of sqlStatements(sql)) {
        await isolated.client.unsafe(statement);
      }
    }
    const tables = async () => {
      const result = await isolated.client.unsafe(
        "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname = 'public'"
      );
      return Number(result[0]?.count);
    };
    assert.equal(await tables(), 8);

    // Existing production-like rows may never be erased by an expand-only migration.
    await isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_item " +
      "(id, organization_id, name, category_key) " +
      "VALUES ('item-1', 'synthetic-org', 'Synthetic exercise', 'speed')"
    );
    await isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_favorite " +
      "(organization_id, principal_id, exercise_id) " +
      "VALUES ('synthetic-org', 'synthetic-principal', 'item-1')"
    );
    await isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_usage " +
      "(organization_id, id, exercise_id, occurred_at, source_kind, note) " +
      "VALUES ('synthetic-org', 'usage-1', 'item-1', now(), 'training_plan', NULL)"
    );

    const candidate = sqlStatements(await readFile(
      new URL(CANDIDATE, import.meta.url), "utf8"
    ));
    assert.equal(candidate.length, 3);
    await assert.rejects(isolated.client.begin(async tx => {
      for (const statement of candidate) await tx.unsafe(statement);
      throw new Error("SYNTHETIC_P02_F_ABORT");
    }), /SYNTHETIC_P02_F_ABORT/);
    assert.equal(await tables(), 8, "atomic SQL rollback must restore old catalog schema");
    const afterAbort = await isolated.client.unsafe(
      "SELECT to_regclass('public.appbasis_exercise_catalog_favorite_deletion') AS relation"
    );
    assert.equal(afterAbort[0]?.relation, null);

    await isolated.client.begin(async tx => {
      for (const statement of candidate) await tx.unsafe(statement);
    });
    assert.equal(await tables(), 10);
    const preserved = await isolated.client.unsafe(
      "SELECT " +
      "(SELECT count(*)::int FROM appbasis_exercise_catalog_item) AS items, " +
      "(SELECT count(*)::int FROM appbasis_exercise_catalog_favorite) AS favorites, " +
      "(SELECT count(*)::int FROM appbasis_exercise_catalog_usage) AS usage, " +
      "(SELECT count(*)::int FROM appbasis_exercise_catalog_usage_subject) AS subject_usage"
    );
    assert.deepEqual(preserved[0], { items: 1, favorites: 1, usage: 1, subject_usage: 0 },
      "historical usage must stay unattributed and existing data unchanged");

    // The SQL FK binds explicit usage to the same organization. A caller
    // cannot attach an event in another tenant, even with an arbitrary ID.
    await isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_usage_subject " +
      "(organization_id, usage_id, principal_id, verified_by) " +
      "VALUES ('synthetic-org', 'usage-1', 'synthetic-principal', 'identity')"
    );
    await assert.rejects(isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_usage_subject " +
      "(organization_id, usage_id, principal_id, verified_by) " +
      "VALUES ('foreign-org', 'usage-1', 'foreign-principal', 'identity')"
    ), /foreign key constraint/i);
    await assert.rejects(isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_usage_subject " +
      "(organization_id, usage_id, principal_id, verified_by) " +
      "VALUES ('synthetic-org', 'other-usage', 'synthetic-principal', 'unsafe')"
    ), /check constraint/i);

    await isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_favorite_deletion " +
      "(organization_id, principal_id, completed_at, purge_after) " +
      "VALUES ('synthetic-org', 'synthetic-principal', " +
      "'2026-11-20T07:00:00Z', '2026-12-25T07:00:00Z')"
    );
    await assert.rejects(isolated.client.unsafe(
      "INSERT INTO appbasis_exercise_catalog_favorite_deletion " +
      "(organization_id, principal_id, completed_at, purge_after) " +
      "VALUES ('synthetic-org', 'other-principal', " +
      "'2026-11-20T07:00:00Z', '2026-12-24T07:00:00Z')"
    ), /check constraint/i);

    await admin.client.unsafe("CREATE ROLE " + roleName + " NOLOGIN");
    createdRole = true;
    await isolated.client.unsafe("GRANT USAGE ON SCHEMA public TO " + roleName);
    await isolated.client.unsafe(
      "GRANT SELECT ON appbasis_exercise_catalog_favorite_deletion TO " + roleName
    );
    await isolated.client.unsafe(
      "GRANT SELECT, INSERT ON appbasis_exercise_catalog_usage_subject TO " + roleName
    );
    const rights = await isolated.client.unsafe(
      "SELECT " +
      "has_table_privilege($1, 'appbasis_exercise_catalog_favorite_deletion', 'SELECT') AS read_marker, " +
      "has_table_privilege($1, 'appbasis_exercise_catalog_favorite_deletion', 'INSERT') AS insert_marker, " +
      "has_table_privilege($1, 'appbasis_exercise_catalog_favorite_deletion', 'UPDATE') AS update_marker, " +
      "has_table_privilege($1, 'appbasis_exercise_catalog_favorite_deletion', 'DELETE') AS delete_marker, " +
      "has_table_privilege($1, 'appbasis_exercise_catalog_usage_subject', 'INSERT') AS insert_subject",
      [roleName]
    );
    assert.deepEqual(rights[0], {
      read_marker: true,
      insert_marker: false,
      update_marker: false,
      delete_marker: false,
      insert_subject: true,
    });
    for (const sql of [
      "DELETE FROM appbasis_exercise_catalog_favorite_deletion WHERE false",
      "UPDATE appbasis_exercise_catalog_favorite_deletion SET completed_at = completed_at WHERE false",
      "INSERT INTO appbasis_exercise_catalog_favorite_deletion " +
        "(organization_id, principal_id, completed_at, purge_after) " +
        "VALUES ('synthetic-org','blocked','2026-11-20T07:00:00Z','2026-12-25T07:00:00Z')",
    ]) {
      await assert.rejects(isolated.client.begin(async tx => {
        await tx.unsafe("SET LOCAL ROLE " + roleName);
        await tx.unsafe(sql);
      }), /permission denied/i);
    }
  } finally {
    if (isolated) await isolated.client.end().catch(() => {});
    if (createdDb) {
      await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
    }
    if (createdRole) {
      await admin.client.unsafe("DROP ROLE " + roleName);
    }
    await admin.client.end().catch(() => {});
  }
});

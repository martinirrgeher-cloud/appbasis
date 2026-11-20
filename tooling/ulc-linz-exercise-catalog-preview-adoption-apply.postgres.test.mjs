import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { migrationStatements } from "./database-migration-executor.mjs";
import {
  applyUlcExerciseCatalogPreviewAdoption,
  UlcExerciseCatalogPreviewAdoptionConfigurationError,
} from "./ulc-linz-exercise-catalog-preview-adoption-apply.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for E6G-C3B PostgreSQL tests.");
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const previewDatabase = "appbasis_ulc_linz_preview";
const migrationRole = "appbasis_ulc_linz_preview_migration";
const migrationPassword = "c3b-preview-test-password";
const fakePreviewUrl =
  "postgresql://" +
  migrationRole +
  ":" +
  migrationPassword +
  "@ep-c3b.eu-central-1.aws.neon.tech/" +
  previewDatabase +
  "?sslmode=require";

test(
  "P1 blocks obsolete catalog-v2 schema/copy before touching the local database or invoking its writer",
  { concurrency:false },
  async () => {
    await withPreviewDatabase(async ({admin,localMigrationUrl}) => {
      await seedCanonicalSource(admin.client);
      const before = await snapshotSource(admin.client);
      let connected = false;
      await assert.rejects(
        applyUlcExerciseCatalogPreviewAdoption({
          connectionString:fakePreviewUrl,
          executionScope:"preview-schema-copy",
        },{
          repositoryRoot,
          databaseFactory:() => {
            connected = true;
            return createPostgresDatabase(localMigrationUrl);
          },
        }),
        (err)=>err instanceof UlcExerciseCatalogPreviewAdoptionConfigurationError &&
          /FC6-B baseline migration contains a statement without a verifiable catalog marker/.test(err.message),
      );
      assert.equal(connected,false,"published v5 must block old installer before SQL");
      assert.deepEqual(await snapshotSource(admin.client),before);
      const tables = await admin.client.unsafe(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' " +
        "AND tablename LIKE 'appbasis_exercise_catalog_%' ORDER BY tablename",
      );
      assert.deepEqual(tables.map(row => row.tablename),[],"no target table may be created by obsolete installer");
    });
  },
);

test(
  "P1 blocks obsolete preview copy before any DDL or post-migration hook, retaining all source rows",
  { concurrency:false },
  async () => {
    await withPreviewDatabase(async ({admin,localMigrationUrl}) => {
      await seedCanonicalSource(admin.client);
      const before = await snapshotSource(admin.client);
      let connections = 0;
      let hooks = 0;
      await assert.rejects(
        applyUlcExerciseCatalogPreviewAdoption({
          connectionString:fakePreviewUrl,
          executionScope:"preview-schema-copy",
        },{
          repositoryRoot,
          databaseFactory:() => {
            connections++;
            return createPostgresDatabase(localMigrationUrl);
          },
          testingHooks:{
            afterTargetSchemaMigration:async () => {hooks++;},
          },
        }),
        (err)=>err instanceof UlcExerciseCatalogPreviewAdoptionConfigurationError &&
          /FC6-B baseline migration contains a statement without a verifiable catalog marker/.test(err.message),
      );
      assert.equal(connections,0);
      assert.equal(hooks,0);
      assert.deepEqual(await snapshotSource(admin.client),before);
      const tables = await admin.client.unsafe(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' " +
        "AND tablename LIKE 'appbasis_exercise_catalog_%' ORDER BY tablename",
      );
      assert.deepEqual(tables.map(row => row.tablename),[]);
    });
  },
);

async function withPreviewDatabase(callback) {
  const clusterAdmin = createPostgresDatabase(databaseUrl);
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/" + previewDatabase;

  const localMigrationUrl = new URL(databaseUrl);
  localMigrationUrl.username = migrationRole;
  localMigrationUrl.password = migrationPassword;
  localMigrationUrl.pathname = "/" + previewDatabase;

  let previewAdmin;
  try {
    await clusterAdmin.client.unsafe(
      'DROP DATABASE IF EXISTS "' +
        previewDatabase +
        '" WITH (FORCE)',
    );
    await clusterAdmin.client.unsafe(
      'DROP ROLE IF EXISTS "' + migrationRole + '"',
    );
    await clusterAdmin.client.unsafe(
      'CREATE ROLE "' +
        migrationRole +
        '" LOGIN PASSWORD \'' +
        migrationPassword +
        "\'",
    );
    await clusterAdmin.client.unsafe(
      'CREATE DATABASE "' +
        previewDatabase +
        '" OWNER "' +
        migrationRole +
        '"',
    );

    previewAdmin = createPostgresDatabase(adminUrl.toString());
    await installSourceSchema(previewAdmin.client);
    await previewAdmin.client.unsafe(
      'GRANT USAGE ON SCHEMA public TO "' +
        migrationRole +
        '"',
    );
    await previewAdmin.client.unsafe(
      'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "' +
        migrationRole +
        '"',
    );

    await callback({
      admin: previewAdmin,
      localMigrationUrl: localMigrationUrl.toString(),
    });
  } finally {
    if (previewAdmin !== undefined) {
      await previewAdmin.client.end().catch(() => {});
    }
    await clusterAdmin.client.unsafe(
      'DROP DATABASE IF EXISTS "' +
        previewDatabase +
        '" WITH (FORCE)',
    );
    await clusterAdmin.client.unsafe(
      'DROP ROLE IF EXISTS "' + migrationRole + '"',
    );
    await clusterAdmin.client.end();
  }
}

async function installSourceSchema(client) {
  const source = await readFile(
    join(
      repositoryRoot,
      "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
    ),
    "utf8",
  );
  for (const statement of migrationStatements(source)) {
    await client.unsafe(statement);
  }
}

async function seedCanonicalSource(client) {
  await client.unsafe(
    "INSERT INTO ulc_linz_exercise_catalog_item (" +
      "id, organization_id, name, category_key, equipment, is_active, " +
      "created_at, updated_at" +
      ") VALUES " +
      "('exercise-a', 'org-a', 'Acceleration drill', 'acceleration', " +
      "ARRAY['cones', 'sled']::text[], true, " +
      "TIMESTAMPTZ '2026-10-01 08:00:00+00', " +
      "TIMESTAMPTZ '2026-10-02 09:00:00+00'), " +
      "('exercise-b', 'org-b', 'Mobility flow', 'regeneration', " +
      "ARRAY['mat']::text[], false, " +
      "TIMESTAMPTZ '2026-10-03 10:00:00+00', " +
      "TIMESTAMPTZ '2026-10-04 11:00:00+00')",
  );

  await client.unsafe(
    "INSERT INTO ulc_linz_exercise_parameter (" +
      "organization_id, exercise_id, parameter_key, label, unit, " +
      "input_type, default_value, min_value, max_value, step_value, " +
      "is_required, sort_order, created_at, updated_at" +
      ") VALUES " +
      "('org-a', 'exercise-a', 'sets', 'Sätze', '', 'number', '3', " +
      "1, 10, 1, true, 10, TIMESTAMPTZ '2026-10-01 08:05:00+00', " +
      "TIMESTAMPTZ '2026-10-02 09:05:00+00'), " +
      "('org-b', 'exercise-b', 'note_text', 'Hinweis', '', 'text', " +
      "'Locker', NULL, NULL, NULL, false, 20, " +
      "TIMESTAMPTZ '2026-10-03 10:05:00+00', " +
      "TIMESTAMPTZ '2026-10-04 11:05:00+00')",
  );

  await client.unsafe(
    "INSERT INTO ulc_linz_exercise_group (" +
      "organization_id, exercise_id, group_id, created_at" +
      ") VALUES " +
      "('org-a', 'exercise-a', 'group-sprint', " +
      "TIMESTAMPTZ '2026-10-01 08:10:00+00'), " +
      "('org-b', 'exercise-b', 'group-general', " +
      "TIMESTAMPTZ '2026-10-03 10:10:00+00')",
  );

  await client.unsafe(
    "INSERT INTO ulc_linz_exercise_favorite (" +
      "organization_id, identity_id, exercise_id, created_at" +
      ") VALUES " +
      "('org-a', 'identity-a', 'exercise-a', " +
      "TIMESTAMPTZ '2026-10-01 08:15:00+00'), " +
      "('org-b', 'identity-b', 'exercise-b', " +
      "TIMESTAMPTZ '2026-10-03 10:15:00+00')",
  );
}

async function snapshotSource(client) {
  const snapshot = {};
  for (const [table, orderBy] of [
    ["ulc_linz_exercise_catalog_item", "organization_id, id"],
    [
      "ulc_linz_exercise_parameter",
      "organization_id, exercise_id, parameter_key",
    ],
    [
      "ulc_linz_exercise_group",
      "organization_id, exercise_id, group_id",
    ],
    [
      "ulc_linz_exercise_favorite",
      "organization_id, identity_id, exercise_id",
    ],
  ]) {
    const rows = await client.unsafe(
      "SELECT to_jsonb(source_row) AS row FROM (" +
        "SELECT * FROM " +
        table +
        " ORDER BY " +
        orderBy +
        ") AS source_row",
    );
    snapshot[table] = rows.map((entry) => entry.row);
  }
  return snapshot;
}

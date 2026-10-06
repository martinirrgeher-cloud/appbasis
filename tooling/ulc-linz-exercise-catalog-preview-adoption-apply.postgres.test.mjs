import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { migrationStatements } from "./database-migration-executor.mjs";
import {
  applyUlcExerciseCatalogPreviewAdoption,
  UlcExerciseCatalogPreviewAdoptionExecutionError,
} from "./ulc-linz-exercise-catalog-preview-adoption-apply.mjs";
import {
  inspectUlcExerciseCatalogCutoverReadiness,
  UlcExerciseCatalogCutoverReadinessError,
} from "./ulc-linz-exercise-catalog-cutover-readiness.mjs";

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
  "E6G-C3B atomically migrates, copies and verifies the preview adoption without touching source rows",
  { concurrency: false },
  async () => {
    await withPreviewDatabase(async ({ admin, localMigrationUrl }) => {
      await seedCanonicalSource(admin.client);
      const sourceBefore = await snapshotSource(admin.client);

      const result = await applyUlcExerciseCatalogPreviewAdoption(
        {
          connectionString: fakePreviewUrl,
          executionScope: "preview-schema-copy",
        },
        {
          repositoryRoot,
          databaseFactory: () =>
            createPostgresDatabase(localMigrationUrl),
        },
      );

      assert.equal(result.state, "preview-schema-copied-and-verified");
      assert.equal(result.application, "ulc-linz");
      assert.equal(result.moduleId, "exercise-catalog");
      assert.equal(result.executionScope, "preview-schema-copy");
      assert.equal(result.transactionIsolation, "repeatable-read");
      assert.equal(result.atomicSchemaAndCopy, true);
      assert.equal(result.migrationCount, 2);
      assert.ok(result.statementCount > 0);
      assert.equal(result.tables.length, 4);
      assert.equal(result.sourceWriteQuiescenceApplied, false);
      assert.equal(
        result.finalEqualityUnderSourceWriteQuiescence,
        false,
      );
      assert.equal(result.cutoverGuardSatisfied, false);
      assert.equal(result.runtimeCutoverEligible, false);

      assert.deepEqual(await snapshotSource(admin.client), sourceBefore);

      const targets = await admin.client.unsafe(
        "SELECT tablename FROM pg_catalog.pg_tables " +
          "WHERE schemaname = 'public' " +
          "AND tablename LIKE 'appbasis_exercise_catalog_%' " +
          "ORDER BY tablename",
      );
      assert.deepEqual(
        targets.map((row) => row.tablename),
        [
          "appbasis_exercise_catalog_audience",
          "appbasis_exercise_catalog_favorite",
          "appbasis_exercise_catalog_item",
          "appbasis_exercise_catalog_parameter",
        ],
      );

      const items = await admin.client.unsafe(
        "SELECT organization_id, id, name, category_key, is_active " +
          "FROM appbasis_exercise_catalog_item " +
          "ORDER BY organization_id, id",
      );
      assert.deepEqual(
        items.map((row) => ({ ...row })),
        [
          {
            organization_id: "org-a",
            id: "exercise-a",
            name: "Acceleration drill",
            category_key: "acceleration",
            is_active: true,
          },
          {
            organization_id: "org-b",
            id: "exercise-b",
            name: "Mobility flow",
            category_key: "regeneration",
            is_active: false,
          },
        ],
      );

      const audiences = await admin.client.unsafe(
        "SELECT organization_id, exercise_id, audience_id " +
          "FROM appbasis_exercise_catalog_audience " +
          "ORDER BY organization_id, exercise_id, audience_id",
      );
      assert.deepEqual(
        audiences.map((row) => ({ ...row })),
        [
          {
            organization_id: "org-a",
            exercise_id: "exercise-a",
            audience_id: "group-sprint",
          },
          {
            organization_id: "org-b",
            exercise_id: "exercise-b",
            audience_id: "group-general",
          },
        ],
      );

      const favorites = await admin.client.unsafe(
        "SELECT organization_id, principal_id, exercise_id " +
          "FROM appbasis_exercise_catalog_favorite " +
          "ORDER BY organization_id, principal_id, exercise_id",
      );
      assert.deepEqual(
        favorites.map((row) => ({ ...row })),
        [
          {
            organization_id: "org-a",
            principal_id: "identity-a",
            exercise_id: "exercise-a",
          },
          {
            organization_id: "org-b",
            principal_id: "identity-b",
            exercise_id: "exercise-b",
          },
        ],
      );

      const readiness = await inspectUlcExerciseCatalogCutoverReadiness(
        { connectionString: fakePreviewUrl },
        {
          repositoryRoot,
          databaseFactory: () =>
            createPostgresDatabase(localMigrationUrl),
        },
      );
      assert.equal(readiness.state, "ready-for-runtime-cutover");
      assert.equal(readiness.equality.exact, true);
      assert.equal(readiness.equality.totalMismatchCount, 0);
      assert.deepEqual(
        readiness.tables.map((table) => table.mismatchCount),
        [0, 0, 0, 0],
      );

      await admin.client.unsafe(
        "UPDATE ulc_linz_exercise_catalog_item " +
          "SET goal = 'drifted after copy' " +
          "WHERE organization_id = 'org-a' AND id = 'exercise-a'",
      );
      await assert.rejects(
        inspectUlcExerciseCatalogCutoverReadiness(
          { connectionString: fakePreviewUrl },
          {
            repositoryRoot,
            databaseFactory: () =>
              createPostgresDatabase(localMigrationUrl),
          },
        ),
        (error) =>
          error instanceof UlcExerciseCatalogCutoverReadinessError &&
          /not exactly equal/.test(error.message),
      );
    });
  },
);

test(
  "E6G-C3B rolls target schema and copied rows back together when post-migration verification fails",
  { concurrency: false },
  async () => {
    await withPreviewDatabase(async ({ admin, localMigrationUrl }) => {
      await seedCanonicalSource(admin.client);
      const sourceBefore = await snapshotSource(admin.client);

      await assert.rejects(
        applyUlcExerciseCatalogPreviewAdoption(
          {
            connectionString: fakePreviewUrl,
            executionScope: "preview-schema-copy",
          },
          {
            repositoryRoot,
            databaseFactory: () =>
              createPostgresDatabase(localMigrationUrl),
            testingHooks: {
              afterTargetSchemaMigration: async (transaction) => {
                await transaction.unsafe(
                  "CREATE FUNCTION e6g_c3b_mutate_target_item() " +
                    "RETURNS trigger LANGUAGE plpgsql AS $$ " +
                    "BEGIN NEW.name := NEW.name || ' drift'; " +
                    "RETURN NEW; END; $$",
                );
                await transaction.unsafe(
                  "CREATE TRIGGER e6g_c3b_mutate_target_item " +
                    "BEFORE INSERT ON appbasis_exercise_catalog_item " +
                    "FOR EACH ROW EXECUTE FUNCTION " +
                    "e6g_c3b_mutate_target_item()",
                );
              },
            },
          },
        ),
        (error) =>
          error instanceof
            UlcExerciseCatalogPreviewAdoptionExecutionError &&
          /mapped content mismatch/.test(error.message),
      );

      assert.deepEqual(await snapshotSource(admin.client), sourceBefore);

      const targets = await admin.client.unsafe(
        "SELECT tablename FROM pg_catalog.pg_tables " +
          "WHERE schemaname = 'public' " +
          "AND tablename LIKE 'appbasis_exercise_catalog_%' " +
          "ORDER BY tablename",
      );
      assert.deepEqual(
        targets.map((row) => row.tablename),
        [],
      );

      const triggerFunction = await admin.client.unsafe(
        "SELECT to_regprocedure(" +
          "'e6g_c3b_mutate_target_item()'" +
          ")::text AS routine",
      );
      assert.equal(triggerFunction[0]?.routine, null);
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

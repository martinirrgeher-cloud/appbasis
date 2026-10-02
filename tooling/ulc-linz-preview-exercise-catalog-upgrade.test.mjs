import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcLinzPreviewExerciseCatalogUpgrade,
  assertUlcLinzPreviewExerciseCatalogUpgradeEnvironment,
  loadUlcLinzPreviewExerciseCatalogUpgradePlan,
  UlcLinzPreviewExerciseCatalogUpgradeExecutionError,
} from "./ulc-linz-preview-exercise-catalog-upgrade.mjs";
import {
  canonicalIdentityColumns,
  canonicalIdentityConstraints,
  canonicalIdentityDiscriminator,
} from "./ulc-linz-d4-preview-identity-audit-test-fixture.mjs";

const CONNECTION =
  "postgresql://ulc_preview_owner:owner-password@ep-ulc-preview.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

const BASELINE = [
  "appbasis_person",
  "appbasis_identity_operation",
  "appbasis_permission_principal",
  "ulc_linz_membership",
  "ulc_linz_security_event_log",
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_trainer",
  "appbasis_athlete_group_membership",
  "appbasis_trainer_group_membership",
  "appbasis_athletes_deletion",
  "ulc_linz_training_session",
  "ulc_linz_training_attendance",
  "ulc_linz_trainer_identity_audit",
  "ulc_linz_training_module_group",
];

const TARGETS = [
  "ulc_linz_exercise_catalog_item",
  "ulc_linz_exercise_parameter",
  "ulc_linz_exercise_group",
  "ulc_linz_exercise_favorite",
];

function canonicalCatalogResponse(sql) {
  if (sql.includes("FROM pg_catalog.pg_attribute")) {
    return [canonicalIdentityDiscriminator(), ...canonicalIdentityColumns()];
  }
  if (sql.includes("FROM pg_catalog.pg_constraint")) {
    return canonicalIdentityConstraints();
  }
  return null;
}

test("loads only the canonical schema-v8 exercise catalog migration", async () => {
  const plan = await loadUlcLinzPreviewExerciseCatalogUpgradePlan();
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.ownerId, "ulc-linz-lifecycle");
  assert.equal(
    plan.migration.relativePath,
    "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
  );
  assert.ok(plan.migration.statements.length >= 4);
  const sql = plan.migration.statements.join("\n");
  for (const table of TARGETS) assert.match(sql, new RegExp(table));
  assert.doesNotMatch(sql, /\bREFERENCES\b/i);
});

test("applies the exact schema-v8 delta transactionally after the schema-v7 baseline", async () => {
  const executed = [];
  let ended = false;
  const tables = new Set(BASELINE);

  const result = await applyUlcLinzPreviewExerciseCatalogUpgrade(
    { connectionString: CONNECTION },
    {
      loadPlan: async () => ({
        ownerId: "ulc-linz-lifecycle",
        migration: {
          relativePath:
            "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
          statements: TARGETS.map(
            (table) => 'CREATE TABLE "' + table + '" ("organization_id" text)',
          ),
        },
      }),
      databaseFactory: () => ({
        client: {
          async begin(callback) {
            await callback({
              async unsafe(sql) {
                executed.push(sql);
                if (sql.startsWith("SELECT current_database()")) {
                  return [{
                    database_name: "appbasis_ulc_linz_preview",
                    principal_name: "ulc_preview_owner",
                  }];
                }
                if (sql.includes("FROM pg_catalog.pg_tables")) {
                  return [...tables].sort().map((tablename) => ({ tablename }));
                }
                const catalog = canonicalCatalogResponse(sql);
                if (catalog !== null) return catalog;
                for (const table of TARGETS) {
                  if (sql.includes('CREATE TABLE "' + table + '"')) tables.add(table);
                }
                return [];
              },
            });
          },
          async end() {
            ended = true;
          },
        },
      }),
    },
  );

  assert.equal(result.state, "applied");
  assert.equal(result.statementCount, TARGETS.length);
  assert.equal(ended, true);
  assert.ok(executed.some((sql) => sql.includes("pg_advisory_xact_lock")));
  assert.deepEqual(TARGETS.filter((table) => !tables.has(table)), []);
});

test("fails closed before writing when any target catalog table is already present", async () => {
  const tables = new Set([...BASELINE, TARGETS[0]]);
  await assert.rejects(
    applyUlcLinzPreviewExerciseCatalogUpgrade(
      { connectionString: CONNECTION },
      {
        loadPlan: async () => ({
          ownerId: "ulc-linz-lifecycle",
          migration: {
            relativePath:
              "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
            statements: ["SELECT 1"],
          },
        }),
        databaseFactory: () => ({
          client: {
            async begin(callback) {
              await callback({
                async unsafe(sql) {
                  if (sql.startsWith("SELECT current_database()")) {
                    return [{
                      database_name: "appbasis_ulc_linz_preview",
                      principal_name: "ulc_preview_owner",
                    }];
                  }
                  if (sql.includes("FROM pg_catalog.pg_tables")) {
                    return [...tables].map((tablename) => ({ tablename }));
                  }
                  return [];
                },
              });
            },
            async end() {},
          },
        }),
      },
    ),
    (error) =>
      error instanceof UlcLinzPreviewExerciseCatalogUpgradeExecutionError &&
      /already or partially applied/.test(error.message),
  );
});

test("requires the exact preview target and explicit migration approval", () => {
  assert.doesNotThrow(() =>
    assertUlcLinzPreviewExerciseCatalogUpgradeEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    }),
  );
  assert.throws(
    () =>
      assertUlcLinzPreviewExerciseCatalogUpgradeEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
        APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
        APPBASIS_APPLY_MIGRATIONS: "0",
      }),
    /explicit migration approval/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcLinzD4PreviewTrainingUpgrade,
  assertUlcLinzD4PreviewTrainingUpgradeEnvironment,
  loadUlcLinzD4PreviewTrainingUpgradePlan,
  UlcLinzD4PreviewTrainingUpgradeExecutionError,
} from "./ulc-linz-d4-preview-training-upgrade.mjs";

const CONNECTION =
  "postgresql://ulc_preview_owner:owner-password@ep-ulc-preview.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

const BASELINE = [
  "appbasis_person",
  "appbasis_permission_principal",
  "ulc_linz_membership",
  "ulc_linz_security_event_log",
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_trainer",
  "appbasis_athlete_group_membership",
  "appbasis_trainer_group_membership",
  "appbasis_athletes_deletion",
];

test("loads only the canonical E4A app-owned training migration delta", async () => {
  const plan = await loadUlcLinzD4PreviewTrainingUpgradePlan();
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.ownerId, "ulc-linz-lifecycle");
  assert.equal(
    plan.migration.relativePath,
    "apps/ulc-linz/migrations/0004_ulc_linz_training_sessions.sql",
  );
  assert.equal(plan.migration.statements.length, 4);
  assert.match(plan.migration.statements[0], /ulc_linz_training_session/);
  assert.match(plan.migration.statements[2], /ulc_linz_training_attendance/);
});

test("applies the exact training delta transactionally to an established preview", async () => {
  const executed = [];
  let ended = false;
  const tables = new Set(BASELINE);

  const result = await applyUlcLinzD4PreviewTrainingUpgrade(
    { connectionString: CONNECTION },
    {
      loadPlan: async () => ({
        schemaVersion: 1,
        application: "ulc-linz",
        ownerId: "ulc-linz-lifecycle",
        migration: {
          relativePath:
            "apps/ulc-linz/migrations/0004_ulc_linz_training_sessions.sql",
          statements: [
            'CREATE TABLE "ulc_linz_training_session" ("id" text PRIMARY KEY)',
            'CREATE INDEX "ulc_linz_training_session_scope_idx" ON "ulc_linz_training_session" ("id")',
            'CREATE TABLE "ulc_linz_training_attendance" ("session_id" text, "athlete_id" text)',
            'CREATE INDEX "ulc_linz_training_attendance_org_athlete_idx" ON "ulc_linz_training_attendance" ("session_id")',
          ],
        },
      }),
      databaseFactory: () => ({
        client: {
          async begin(callback) {
            await callback({
              async unsafe(sql) {
                executed.push(sql);
                if (sql.startsWith("SELECT current_database()")) {
                  return [
                    {
                      database_name: "appbasis_ulc_linz_preview",
                      principal_name: "ulc_preview_owner",
                    },
                  ];
                }
                if (sql.includes("FROM pg_catalog.pg_tables")) {
                  return [...tables].sort().map((tablename) => ({ tablename }));
                }
                if (sql.includes('CREATE TABLE "ulc_linz_training_session"')) {
                  tables.add("ulc_linz_training_session");
                }
                if (sql.includes('CREATE TABLE "ulc_linz_training_attendance"')) {
                  tables.add("ulc_linz_training_attendance");
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
  assert.equal(result.migrationCount, 1);
  assert.equal(result.statementCount, 4);
  assert.equal(ended, true);
  assert.ok(
    executed.some((sql) => sql.includes("pg_advisory_xact_lock")),
  );
});

test("fails closed when any training table is already present", async () => {
  const tables = new Set([...BASELINE, "ulc_linz_training_session"]);

  await assert.rejects(
    applyUlcLinzD4PreviewTrainingUpgrade(
      { connectionString: CONNECTION },
      {
        loadPlan: async () => ({
          ownerId: "ulc-linz-lifecycle",
          migration: {
            relativePath:
              "apps/ulc-linz/migrations/0004_ulc_linz_training_sessions.sql",
            statements: ["SELECT 1"],
          },
        }),
        databaseFactory: () => ({
          client: {
            async begin(callback) {
              await callback({
                async unsafe(sql) {
                  if (sql.startsWith("SELECT current_database()")) {
                    return [
                      {
                        database_name: "appbasis_ulc_linz_preview",
                        principal_name: "ulc_preview_owner",
                      },
                    ];
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
      error instanceof UlcLinzD4PreviewTrainingUpgradeExecutionError &&
      /already or partially applied/.test(error.message),
  );
});

test("requires exact preview migration environment and explicit approval", () => {
  assert.doesNotThrow(() =>
    assertUlcLinzD4PreviewTrainingUpgradeEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    }),
  );
  assert.throws(
    () =>
      assertUlcLinzD4PreviewTrainingUpgradeEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
        APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
        APPBASIS_APPLY_MIGRATIONS: "0",
      }),
    /explicit migration approval/,
  );
});

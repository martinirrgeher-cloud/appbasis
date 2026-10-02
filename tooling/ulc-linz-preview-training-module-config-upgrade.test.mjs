import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcLinzPreviewTrainingModuleConfigUpgrade,
  assertUlcLinzPreviewTrainingModuleConfigUpgradeEnvironment,
  loadUlcLinzPreviewTrainingModuleConfigUpgradePlan,
  UlcLinzPreviewTrainingModuleConfigUpgradeExecutionError,
} from "./ulc-linz-preview-training-module-config-upgrade.mjs";
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
];

function canonicalCatalogResponse(sql) {
  if (sql.includes("FROM pg_catalog.pg_attribute")) {
    return [
      canonicalIdentityDiscriminator(),
      ...canonicalIdentityColumns(),
    ];
  }
  if (sql.includes("FROM pg_catalog.pg_constraint")) {
    return canonicalIdentityConstraints();
  }
  return null;
}

test("loads only the canonical schema-v7 module mapping migration", async () => {
  const plan = await loadUlcLinzPreviewTrainingModuleConfigUpgradePlan();
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.ownerId, "ulc-linz-lifecycle");
  assert.equal(
    plan.migration.relativePath,
    "apps/ulc-linz/migrations/0006_ulc_linz_training_module_groups.sql",
  );
  assert.equal(plan.migration.statements.length, 1);
  assert.match(plan.migration.statements[0], /ulc_linz_training_module_group/);
  assert.match(plan.migration.statements[0], /PRIMARY KEY/);
  assert.match(plan.migration.statements[0], /UNIQUE/);
});

test("applies the exact schema-v7 delta transactionally after identity v3", async () => {
  const executed = [];
  let ended = false;
  const tables = new Set(BASELINE);

  const result = await applyUlcLinzPreviewTrainingModuleConfigUpgrade(
    { connectionString: CONNECTION },
    {
      loadPlan: async () => ({
        schemaVersion: 1,
        application: "ulc-linz",
        ownerId: "ulc-linz-lifecycle",
        migration: {
          relativePath:
            "apps/ulc-linz/migrations/0006_ulc_linz_training_module_groups.sql",
          statements: [
            'CREATE TABLE "ulc_linz_training_module_group" ("organization_id" text)',
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
                if (sql.includes('CREATE TABLE "ulc_linz_training_module_group"')) {
                  tables.add("ulc_linz_training_module_group");
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
  assert.equal(result.statementCount, 1);
  assert.equal(ended, true);
  assert.ok(executed.some((sql) => sql.includes("pg_advisory_xact_lock")));
});

test("fails closed before writing when identity v3 is not canonical", async () => {
  const executed = [];
  await assert.rejects(
    applyUlcLinzPreviewTrainingModuleConfigUpgrade(
      { connectionString: CONNECTION },
      {
        loadPlan: async () => ({
          ownerId: "ulc-linz-lifecycle",
          migration: {
            relativePath:
              "apps/ulc-linz/migrations/0006_ulc_linz_training_module_groups.sql",
            statements: [
              'CREATE TABLE "ulc_linz_training_module_group" ("organization_id" text)',
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
                    return [{
                      database_name: "appbasis_ulc_linz_preview",
                      principal_name: "ulc_preview_owner",
                    }];
                  }
                  if (sql.includes("FROM pg_catalog.pg_tables")) {
                    return BASELINE.map((tablename) => ({ tablename }));
                  }
                  if (sql.includes("FROM pg_catalog.pg_attribute")) {
                    return [canonicalIdentityDiscriminator()];
                  }
                  if (sql.includes("FROM pg_catalog.pg_constraint")) return [];
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
      error instanceof UlcLinzPreviewTrainingModuleConfigUpgradeExecutionError &&
      /requires canonical identity schema v3/.test(error.message),
  );
  assert.equal(
    executed.some((sql) =>
      sql.includes('CREATE TABLE "ulc_linz_training_module_group"'),
    ),
    false,
  );
});

test("fails closed when the target table is already present", async () => {
  const tables = new Set([...BASELINE, "ulc_linz_training_module_group"]);
  await assert.rejects(
    applyUlcLinzPreviewTrainingModuleConfigUpgrade(
      { connectionString: CONNECTION },
      {
        loadPlan: async () => ({
          ownerId: "ulc-linz-lifecycle",
          migration: {
            relativePath:
              "apps/ulc-linz/migrations/0006_ulc_linz_training_module_groups.sql",
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
    /already applied/,
  );
});

test("requires exact preview target and explicit authorization", () => {
  assert.doesNotThrow(() =>
    assertUlcLinzPreviewTrainingModuleConfigUpgradeEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    }),
  );
  assert.throws(
    () =>
      assertUlcLinzPreviewTrainingModuleConfigUpgradeEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
        APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
        APPBASIS_APPLY_MIGRATIONS: "0",
      }),
    /explicit migration approval/,
  );
});

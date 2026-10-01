import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcLinzD4PreviewIdentityAuditUpgrade,
  assertUlcLinzD4PreviewIdentityAuditUpgradeEnvironment,
  loadUlcLinzD4PreviewIdentityAuditUpgradePlan,
  UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError,
  UlcLinzD4PreviewIdentityAuditUpgradeExecutionError,
} from "./ulc-linz-d4-preview-identity-audit-upgrade.mjs";
import {
  canonicalIdentityColumns,
  canonicalIdentityConstraints,
  canonicalIdentityDiscriminator,
} from "./ulc-linz-d4-preview-identity-audit-test-fixture.mjs";

const CONNECTION =
  "postgresql://appbasis_ulc_linz_preview_migration:example@ep-ulc-preview.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";
const RUNTIME_CONNECTION =
  CONNECTION.replace("_migration", "_application");
const TARGET_COLUMNS = ["provisioning_owner", "actor_principal_id", "reason"];
function fakeDatabase({
  initialColumns = [],
  initialConstraint = false,
  throwOnMigration = false,
  tables = [
    "appbasis_identity_operation",
    "appbasis_identity_security_state",
    "ulc_linz_trainer_identity_audit",
  ],
} = {}) {
  let columns = [...initialColumns];
  let constraint = initialConstraint;
  let ended = false;
  let committed = false;
  const executed = [];
  return {
    executed,
    get ended() { return ended; },
    get committed() { return committed; },
    factory: () => ({
      client: {
        async begin(callback) {
          const transaction = {
            async unsafe(sql) {
              executed.push(sql);
              if (sql.startsWith("SELECT current_database()")) {
                return [{
                  database_name: "appbasis_ulc_linz_preview",
                  principal_name: "appbasis_ulc_linz_preview_migration",
                }];
              }
              if (sql.includes("FROM pg_catalog.pg_tables")) {
                return tables.map((tablename) => ({ tablename }));
              }
              if (sql.includes("FROM pg_catalog.pg_attribute")) {
                return [
                  canonicalIdentityDiscriminator(),
                  ...columns.map((value) =>
                    typeof value === "string"
                      ? canonicalIdentityColumns().find((entry) => entry.column_name === value)
                      : value,
                  ),
                ];
              }
              if (sql.includes("FROM pg_catalog.pg_constraint")) {
                return constraint ? canonicalIdentityConstraints() : [];
              }
              if (sql.includes("pg_advisory_xact_lock")) return [];
              if (throwOnMigration) throw new Error("simulated DDL failure");
              if (sql.includes('ADD COLUMN "provisioning_owner"')) {
                columns = [...TARGET_COLUMNS];
              }
              if (sql.includes('ADD CONSTRAINT "appbasis_identity_operation_provisioning_audit_shape_check"')) {
                constraint = true;
              }
              return [];
            },
          };
          await callback(transaction);
          committed = true;
        },
        async end() { ended = true; },
      },
    }),
  };
}

const fakePlan = {
  ownerId: "identity",
  migration: {
    relativePath: "packages/identity/drizzle/0002_appbasis_identity_provisioning_audit.sql",
    statements: [
      'ALTER TABLE "appbasis_identity_operation" ADD COLUMN "provisioning_owner" text, ADD COLUMN "actor_principal_id" text, ADD COLUMN "reason" text',
      'ALTER TABLE "appbasis_identity_operation" ADD CONSTRAINT "appbasis_identity_operation_provisioning_audit_shape_check" CHECK (kind = \'provision\' AND provisioning_owner IS NOT NULL AND actor_principal_id IS NOT NULL AND reason IS NOT NULL)',
    ],
  },
};

test("loads only canonical identity schema-v3 audit delta, never entire manifest", async () => {
  const plan = await loadUlcLinzD4PreviewIdentityAuditUpgradePlan();
  assert.equal(plan.ownerId, "identity");
  assert.equal(plan.migration.relativePath, fakePlan.migration.relativePath);
  assert.equal(plan.migration.statements.length, 2);
  assert.match(plan.migration.statements.join("\n"), /provisioning_owner/);
  assert.match(plan.migration.statements.join("\n"), /actor_principal_id/);
  assert.match(plan.migration.statements.join("\n"), /reason/);
});

test("applies identity-v3 columns and audit shape guard in one transaction", async () => {
  const database = fakeDatabase();
  const result = await applyUlcLinzD4PreviewIdentityAuditUpgrade(
    { connectionString: CONNECTION },
    {
      databaseFactory: database.factory,
      loadPlan: async () => fakePlan,
    },
  );
  assert.deepEqual(result, {
    state: "applied",
    application: "ulc-linz",
    ownerId: "identity",
    migrationPath: fakePlan.migration.relativePath,
    migrationCount: 1,
    statementCount: 2,
  });
  assert.equal(database.committed, true);
  assert.equal(database.ended, true);
  assert.equal(database.executed.filter((sql) => sql.startsWith("ALTER TABLE")).length, 2);
  assert.ok(database.executed.some((sql) => sql.includes("pg_advisory_xact_lock")));
});

test("rejects previously installed, partial and wrong-baseline preview schemas without DDL", async () => {
  for (const options of [
    { initialColumns: TARGET_COLUMNS, initialConstraint: true },
    { initialColumns: ["provisioning_owner"], initialConstraint: false },
    { tables: ["appbasis_identity_operation", "appbasis_identity_security_state"] },
  ]) {
    const database = fakeDatabase(options);
    await assert.rejects(
      applyUlcLinzD4PreviewIdentityAuditUpgrade(
        { connectionString: CONNECTION },
        { databaseFactory: database.factory, loadPlan: async () => fakePlan },
      ),
      UlcLinzD4PreviewIdentityAuditUpgradeExecutionError,
    );
    assert.equal(database.committed, false);
    assert.equal(database.ended, true);
    assert.equal(database.executed.filter((sql) => sql.startsWith("ALTER TABLE")).length, 0);
  }
});

test("propagates a single failed migration as rollback instead of partial success", async () => {
  const database = fakeDatabase({ throwOnMigration: true });
  await assert.rejects(
    applyUlcLinzD4PreviewIdentityAuditUpgrade(
      { connectionString: CONNECTION },
      { databaseFactory: database.factory, loadPlan: async () => fakePlan },
    ),
    /failed and was rolled back/,
  );
  assert.equal(database.committed, false);
  assert.equal(database.ended, true);
});

test("accepts only the dedicated preview migration principal and explicit apply", async () => {
  const database = fakeDatabase();
  await assert.rejects(
    applyUlcLinzD4PreviewIdentityAuditUpgrade(
      { connectionString: RUNTIME_CONNECTION },
      { databaseFactory: database.factory, loadPlan: async () => fakePlan },
    ),
    UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError,
  );
  assert.equal(database.executed.length, 0);
  assert.doesNotThrow(() =>
    assertUlcLinzD4PreviewIdentityAuditUpgradeEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    }),
  );
  for (const environment of [
    {
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "0",
    },
    {
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_production",
      APPBASIS_APPLY_MIGRATIONS: "1",
    },
  ]) {
    assert.throws(
      () => assertUlcLinzD4PreviewIdentityAuditUpgradeEnvironment(environment),
      UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError,
    );
  }
});

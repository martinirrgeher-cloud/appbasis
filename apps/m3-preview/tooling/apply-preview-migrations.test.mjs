import assert from "node:assert/strict";
import test from "node:test";

import {
  assertM3PreviewMigrationEnvironment,
  loadM3PreviewMigrationPlan,
  M3_PREVIEW_APP_ID,
  M3_PREVIEW_DATABASE_NAME,
  M3_PREVIEW_MIGRATION_TARGET,
  M3PreviewMigrationConfigurationError,
} from "./apply-preview-migrations.mjs";

test("loads the m3-preview manifest in declared owner and migration order", async () => {
  const plan = await loadM3PreviewMigrationPlan();
  assert.deepEqual(
    plan.map(({ ownerId, relativePath }) => ({ ownerId, relativePath })),
    [
      {
        ownerId: "identity",
        relativePath:
          "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
      },
      {
        ownerId: "identity",
        relativePath:
          "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
      },
      {
        ownerId: "permissions",
        relativePath:
          "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
      },
      {
        ownerId: "permissions",
        relativePath:
          "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
      },
      {
        ownerId: "permissions",
        relativePath:
          "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
      },
      {
        ownerId: "permissions",
        relativePath:
          "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
      },
      {
        ownerId: "tasks",
        relativePath: "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
      },
    ],
  );
});

test("pins the m3-preview migration target independently from other previews", () => {
  assert.equal(M3_PREVIEW_APP_ID, "m3-preview");
  assert.equal(M3_PREVIEW_MIGRATION_TARGET, "m3-preview");
  assert.equal(M3_PREVIEW_DATABASE_NAME, "appbasis_m3_preview");

  assert.doesNotThrow(() =>
    assertM3PreviewMigrationEnvironment({
      APPBASIS_GENERATED_APP_ID: "m3-preview",
      APPBASIS_MIGRATION_TARGET: "m3-preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    }),
  );

  for (const environment of [
    {
      APPBASIS_GENERATED_APP_ID: "tasks-minimal",
      APPBASIS_MIGRATION_TARGET: "m3-preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    },
    {
      APPBASIS_GENERATED_APP_ID: "m3-preview",
      APPBASIS_MIGRATION_TARGET: "generated-tasks-preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    },
    {
      APPBASIS_GENERATED_APP_ID: "m3-preview",
      APPBASIS_MIGRATION_TARGET: "m3-preview",
      APPBASIS_APPLY_MIGRATIONS: "0",
    },
  ]) {
    assert.throws(
      () => assertM3PreviewMigrationEnvironment(environment),
      M3PreviewMigrationConfigurationError,
    );
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGeneratedPreviewMigrationEnvironment,
  GENERATED_PREVIEW_APP_ID,
  GENERATED_PREVIEW_DATABASE_NAME,
  GENERATED_PREVIEW_MIGRATION_TARGET,
  GeneratedPreviewMigrationConfigurationError,
  loadGeneratedPreviewMigrationPlan,
} from './apply-generated-preview-migrations.mjs';

test('loads the generated tasks manifest in its declared owner and migration order', async () => {
  const plan = await loadGeneratedPreviewMigrationPlan();
  assert.deepEqual(
    plan.map(({ ownerId, relativePath }) => ({ ownerId, relativePath })),
    [
      {
        ownerId: 'identity',
        relativePath: 'packages/identity/drizzle/0000_appbasis_identity_foundation.sql',
      },
      {
        ownerId: 'identity',
        relativePath: 'packages/identity/drizzle/0001_appbasis_identity_foundation.sql',
      },
      {
        ownerId: 'permissions',
        relativePath: 'packages/permissions/migrations/0000_appbasis_permissions_foundation.sql',
      },
      {
        ownerId: 'permissions',
        relativePath: 'packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql',
      },
      {
        ownerId: 'permissions',
        relativePath: 'packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql',
      },
      {
        ownerId: 'permissions',
        relativePath: 'packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql',
      },
      {
        ownerId: 'tasks',
        relativePath: 'modules/tasks/migrations/0000_appbasis_tasks_foundation.sql',
      },
    ],
  );
});

test('pins the generated preview migration target independently from Reference preview', () => {
  assert.equal(GENERATED_PREVIEW_APP_ID, 'tasks-minimal');
  assert.equal(GENERATED_PREVIEW_MIGRATION_TARGET, 'generated-tasks-preview');
  assert.equal(GENERATED_PREVIEW_DATABASE_NAME, 'appbasis_tasks_preview');

  assert.doesNotThrow(() =>
    assertGeneratedPreviewMigrationEnvironment({
      APPBASIS_GENERATED_APP_ID: 'tasks-minimal',
      APPBASIS_MIGRATION_TARGET: 'generated-tasks-preview',
      APPBASIS_APPLY_MIGRATIONS: '1',
    }),
  );

  for (const environment of [
    {
      APPBASIS_GENERATED_APP_ID: 'reference',
      APPBASIS_MIGRATION_TARGET: 'generated-tasks-preview',
      APPBASIS_APPLY_MIGRATIONS: '1',
    },
    {
      APPBASIS_GENERATED_APP_ID: 'tasks-minimal',
      APPBASIS_MIGRATION_TARGET: 'reference-preview',
      APPBASIS_APPLY_MIGRATIONS: '1',
    },
    {
      APPBASIS_GENERATED_APP_ID: 'tasks-minimal',
      APPBASIS_MIGRATION_TARGET: 'generated-tasks-preview',
      APPBASIS_APPLY_MIGRATIONS: '0',
    },
  ]) {
    assert.throws(
      () => assertGeneratedPreviewMigrationEnvironment(environment),
      GeneratedPreviewMigrationConfigurationError,
    );
  }
});

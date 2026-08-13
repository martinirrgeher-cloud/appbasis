import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadReferenceMigrationPlan,
  migrationStatements,
  ReferenceMigrationConfigurationError,
  validatePostgresConnectionString,
} from './apply-reference-migrations.mjs';

test('loads the deterministic Reference manifest in Identity then Tasks order', async () => {
  const plan = await loadReferenceMigrationPlan();

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
        ownerId: 'tasks',
        relativePath: 'modules/tasks/migrations/0000_appbasis_tasks_foundation.sql',
      },
    ],
  );
  assert.equal(plan.every((migration) => migration.statements.length > 0), true);
});

test('splits migration SQL only on the repository statement breakpoint', () => {
  assert.deepEqual(
    migrationStatements('SELECT 1;\n--> statement-breakpoint\n\nSELECT 2;\n'),
    ['SELECT 1;', 'SELECT 2;'],
  );
  assert.deepEqual(migrationStatements('   '), []);
  assert.deepEqual(migrationStatements(undefined), []);
});

test('accepts only direct PostgreSQL URLs with a hostname', () => {
  assert.equal(
    validatePostgresConnectionString('  postgres://demo:secret@db.example.test:5432/appbasis  '),
    'postgres://demo:secret@db.example.test:5432/appbasis',
  );
  assert.equal(
    validatePostgresConnectionString('postgresql://db.example.test/appbasis'),
    'postgresql://db.example.test/appbasis',
  );

  for (const value of [
    undefined,
    '',
    'https://db.example.test/appbasis',
    'postgres:opaque',
    'postgres:/single-slash',
    'postgres:///missing-host',
  ]) {
    assert.throws(
      () => validatePostgresConnectionString(value),
      ReferenceMigrationConfigurationError,
    );
  }
});

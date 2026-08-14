import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresDatabase } from '@appbasis/database/node-runtime';
import {
  applyGeneratedPreviewMigrations,
  GeneratedPreviewMigrationConfigurationError,
  GeneratedPreviewMigrationExecutionError,
} from '../tooling/apply-generated-preview-migrations.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for generated preview migration PostgreSQL E2E tests.');
}

const databaseName = 'appbasis_tasks_preview';
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;

test('applies only the generated manifest to its named empty database and refuses a second run', async () => {
  const adminConnection = createPostgresDatabase(databaseUrl);
  try {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);

    const result = await applyGeneratedPreviewMigrations({
      connectionString: targetUrl.toString(),
    });
    assert.equal(result.migrationCount, 4);
    assert.ok(result.statementCount > 0);

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const rows = await verification.client`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'user',
            'appbasis_identity_security_state',
            'appbasis_identity_operation',
            'appbasis_permission_capability',
            'appbasis_permission_principal',
            'appbasis_task'
          )
        ORDER BY table_name
      `;
      assert.deepEqual(
        rows.map((row) => row.table_name),
        [
          'appbasis_identity_operation',
          'appbasis_identity_security_state',
          'appbasis_permission_capability',
          'appbasis_permission_principal',
          'appbasis_task',
          'user',
        ],
      );
    } finally {
      await verification.client.end();
    }

    await assert.rejects(
      applyGeneratedPreviewMigrations({ connectionString: targetUrl.toString() }),
      GeneratedPreviewMigrationExecutionError,
    );
  } finally {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.end();
  }
});

test('rejects a PostgreSQL connection that points at a different logical database', async () => {
  await assert.rejects(
    applyGeneratedPreviewMigrations({ connectionString: databaseUrl }),
    GeneratedPreviewMigrationConfigurationError,
  );
});

test('checks the database actually selected by the driver before any migration DDL', async () => {
  const overrideDatabaseName = 'appbasis_wrong_preview';
  const adminConnection = createPostgresDatabase(databaseUrl);
  const overrideUrl = new URL(targetUrl);
  overrideUrl.searchParams.set('database', overrideDatabaseName);

  try {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${overrideDatabaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${overrideDatabaseName}`);

    await assert.rejects(
      applyGeneratedPreviewMigrations({ connectionString: overrideUrl.toString() }),
      GeneratedPreviewMigrationExecutionError,
    );

    const overrideVerificationUrl = new URL(databaseUrl);
    overrideVerificationUrl.pathname = `/${overrideDatabaseName}`;
    const verification = createPostgresDatabase(overrideVerificationUrl.toString());
    try {
      const rows = await verification.client`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      assert.deepEqual(rows, []);
    } finally {
      await verification.client.end();
    }
  } finally {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${overrideDatabaseName} WITH (FORCE)`);
    await adminConnection.client.end();
  }
});

import { afterAll, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database';
import {
  applyReferenceMigrations,
  ReferenceMigrationExecutionError,
} from '../tooling/apply-reference-migrations.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference migration PostgreSQL E2E tests.');
}

const databaseName = 'appbasis_reference_migration_executor_e2e';
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;
const adminConnection = createPostgresDatabase(databaseUrl);

describe('Reference migration executor PostgreSQL E2E', () => {
  afterAll(async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.end();
  });

  it('applies the exact manifest to an empty database and refuses a second application', async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);

    const result = await applyReferenceMigrations({
      connectionString: targetUrl.toString(),
    });
    expect(result.migrationCount).toBe(3);
    expect(result.statementCount).toBeGreaterThan(0);

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const rows = await verification.client<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'user',
            'appbasis_identity_security_state',
            'appbasis_identity_operation',
            'appbasis_task'
          )
        ORDER BY table_name
      `;
      expect(rows.map((row) => row.table_name)).toEqual([
        'appbasis_identity_operation',
        'appbasis_identity_security_state',
        'appbasis_task',
        'user',
      ]);
    } finally {
      await verification.client.end();
    }

    await expect(
      applyReferenceMigrations({ connectionString: targetUrl.toString() }),
    ).rejects.toBeInstanceOf(ReferenceMigrationExecutionError);

    const postRetry = createPostgresDatabase(targetUrl.toString());
    try {
      const count = await postRetry.client<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `;
      expect(count[0]?.count).toBeGreaterThan(0);
    } finally {
      await postRetry.client.end();
    }
  });
});

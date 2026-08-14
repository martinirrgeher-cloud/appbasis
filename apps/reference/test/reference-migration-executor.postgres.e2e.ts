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
const foreignObjectDatabaseName = 'appbasis_reference_migration_foreign_object_e2e';
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;
const foreignObjectUrl = new URL(databaseUrl);
foreignObjectUrl.pathname = `/${foreignObjectDatabaseName}`;
const adminConnection = createPostgresDatabase(databaseUrl);

describe('Reference migration executor PostgreSQL E2E', () => {
  afterAll(async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${foreignObjectDatabaseName} WITH (FORCE)`,
    );
    await adminConnection.client.end();
  });

  it('applies the exact manifest to an empty database and refuses a second application', async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);

    const result = await applyReferenceMigrations({
      connectionString: targetUrl.toString(),
    });
    expect(result.migrationCount).toBe(6);
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
            'appbasis_permission_administration_audit',
            'appbasis_permission_capability',
            'appbasis_permission_principal',
            'appbasis_task'
          )
        ORDER BY table_name
      `;
      expect(rows.map((row) => row.table_name)).toEqual([
        'appbasis_identity_operation',
        'appbasis_identity_security_state',
        'appbasis_permission_administration_audit',
        'appbasis_permission_capability',
        'appbasis_permission_principal',
        'appbasis_task',
        'user',
      ]);
    } finally {
      await verification.client.end();
    }

    await expect(
      applyReferenceMigrations({ connectionString: targetUrl.toString() }),
    ).rejects.toBeInstanceOf(ReferenceMigrationExecutionError);
  });

  it('refuses a public schema that contains only non-table user objects', async () => {
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${foreignObjectDatabaseName} WITH (FORCE)`,
    );
    await adminConnection.client.unsafe(`CREATE DATABASE ${foreignObjectDatabaseName}`);

    const foreign = createPostgresDatabase(foreignObjectUrl.toString());
    try {
      await foreign.client.unsafe(`CREATE FUNCTION public.foreign_marker() RETURNS integer LANGUAGE SQL AS 'SELECT 1'`);
      await foreign.client.unsafe(`CREATE TYPE public.foreign_state AS ENUM ('existing')`);
    } finally {
      await foreign.client.end();
    }

    await expect(
      applyReferenceMigrations({ connectionString: foreignObjectUrl.toString() }),
    ).rejects.toThrow('Reference migrations require an empty public schema.');

    const verification = createPostgresDatabase(foreignObjectUrl.toString());
    try {
      const appbasisTables = await verification.client<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'appbasis_%'
      `;
      const marker = await verification.client<{ value: number }[]>`
        SELECT public.foreign_marker() AS value
      `;
      expect(appbasisTables[0]?.count).toBe(0);
      expect(marker[0]?.value).toBe(1);
    } finally {
      await verification.client.end();
    }
  });
});

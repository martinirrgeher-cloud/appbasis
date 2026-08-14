import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database';

interface MigrationOwner {
  readonly id: string;
  readonly root: string;
  readonly schemaVersion: number;
  readonly migrations: readonly string[];
}

interface DatabaseManifest {
  readonly manifestVersion: number;
  readonly application: string;
  readonly dialect: string;
  readonly owners: readonly MigrationOwner[];
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for PostgreSQL migration contract E2E tests.');
}

const migrationDatabaseName = 'appbasis_reference_migration_contract_e2e';
const migrationDatabaseUrl = new URL(databaseUrl);
migrationDatabaseUrl.pathname = `/${migrationDatabaseName}`;

const adminConnection = createPostgresDatabase(databaseUrl);
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
let migrationConnection: ReturnType<typeof createPostgresDatabase> | undefined;
let manifest!: DatabaseManifest;

describe('Reference database migration contract', () => {
  beforeAll(async () => {
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${migrationDatabaseName} WITH (FORCE)`,
    );
    await adminConnection.client.unsafe(`CREATE DATABASE ${migrationDatabaseName}`);
    migrationConnection = createPostgresDatabase(migrationDatabaseUrl.toString());

    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DatabaseManifest;

    for (const owner of manifest.owners) {
      for (const migration of owner.migrations) {
        const migrationPath = path.resolve(repositoryRoot, ...migration.split('/'));
        const sql = await readFile(migrationPath, 'utf8');
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') {
            await migrationConnection.client.unsafe(statement);
          }
        }
      }
    }
  });

  afterAll(async () => {
    if (migrationConnection !== undefined) {
      await migrationConnection.client.end();
    }
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${migrationDatabaseName} WITH (FORCE)`,
    );
    await adminConnection.client.end();
  });

  it('declares the expected deterministic owner order and schema versions', () => {
    expect(manifest).toMatchObject({
      manifestVersion: 1,
      application: 'reference',
      dialect: 'postgresql',
      owners: [
        { id: 'identity', schemaVersion: 2 },
        { id: 'permissions', schemaVersion: 1 },
        { id: 'tasks', schemaVersion: 1 },
      ],
    });
  });

  it('builds the complete reference schema in an isolated empty PostgreSQL database', async () => {
    if (migrationConnection === undefined) {
      throw new Error('Migration database was not initialized.');
    }

    const rows = await migrationConnection.client<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        'account',
        'appbasis_identity_operation',
        'appbasis_identity_security_state',
        'appbasis_permission_capability',
        'appbasis_permission_principal',
        'appbasis_permission_principal_grant',
        'appbasis_permission_principal_revoke',
        'appbasis_permission_principal_role',
        'appbasis_permission_role',
        'appbasis_permission_role_capability',
        'appbasis_person',
        'appbasis_task',
        'session',
        'user',
        'verification',
      ]),
    );
  });
});

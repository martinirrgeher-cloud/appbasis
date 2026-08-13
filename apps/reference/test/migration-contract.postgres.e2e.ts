import { readFile } from 'node:fs/promises';

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

const connection = createPostgresDatabase(databaseUrl);
const repositoryRoot = new URL('../../../', import.meta.url);
let manifest!: DatabaseManifest;

describe('Reference database migration contract', () => {
  beforeAll(async () => {
    manifest = JSON.parse(
      await readFile(new URL('apps/reference/appbasis.database.json', repositoryRoot), 'utf8'),
    ) as DatabaseManifest;

    await connection.client.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    for (const owner of manifest.owners) {
      for (const migration of owner.migrations) {
        const sql = await readFile(new URL(migration, repositoryRoot), 'utf8');
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') {
            await connection.client.unsafe(statement);
          }
        }
      }
    }
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it('declares the expected deterministic owner order and schema versions', () => {
    expect(manifest).toMatchObject({
      manifestVersion: 1,
      application: 'reference',
      dialect: 'postgresql',
      owners: [
        { id: 'identity', schemaVersion: 2 },
        { id: 'tasks', schemaVersion: 1 },
      ],
    });
  });

  it('builds the complete reference schema from an empty PostgreSQL schema', async () => {
    const rows = await connection.client<{ table_name: string }[]>`
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
        'appbasis_person',
        'appbasis_task',
        'session',
        'user',
        'verification',
      ]),
    );
  });
});

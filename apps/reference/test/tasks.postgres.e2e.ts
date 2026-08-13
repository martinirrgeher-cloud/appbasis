import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database';
import { PostgresTaskRepository } from '../../../modules/tasks/src';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for PostgreSQL task E2E tests.');
}

const connection = createPostgresDatabase(databaseUrl);
const migrationUrl = new URL(
  '../../../modules/tasks/migrations/0000_appbasis_tasks_foundation.sql',
  import.meta.url,
);

function repository() {
  return new PostgresTaskRepository({
    unsafe(query, parameters) {
      return connection.client.unsafe(query, parameters);
    },
  });
}

describe('PostgresTaskRepository', () => {
  beforeAll(async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    await connection.client.unsafe(migration);
  });

  beforeEach(async () => {
    await connection.client.unsafe('TRUNCATE TABLE appbasis_task');
  });

  afterAll(async () => {
    await connection.client.end();
  });

  it('persists a normalized task across repository instances', async () => {
    const created = await repository().create({
      title: '  PostgreSQL prüfen  ',
      description: '  bleibt erhalten  ',
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created).toMatchObject({
      title: 'PostgreSQL prüfen',
      description: 'bleibt erhalten',
      status: 'open',
    });

    await expect(repository().findById(created.id)).resolves.toEqual(created);
    await expect(repository().list()).resolves.toEqual([created]);
  });

  it('toggles status atomically and keeps unknown ids absent', async () => {
    const tasks = repository();
    const created = await tasks.create({ title: 'Status persistieren' });

    await expect(tasks.toggleStatus(created.id)).resolves.toMatchObject({
      id: created.id,
      status: 'completed',
    });
    await expect(repository().findById(created.id)).resolves.toMatchObject({
      id: created.id,
      status: 'completed',
    });
    await expect(tasks.toggleStatus('missing')).resolves.toBeUndefined();
  });

  it('rejects invalid domain input without inserting a row', async () => {
    const tasks = repository();

    await expect(tasks.create({ title: '   ' })).rejects.toThrow(
      'A task title is required.',
    );
    await expect(tasks.list()).resolves.toEqual([]);
  });
});

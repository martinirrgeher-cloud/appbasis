import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
  MigrationConfigurationError,
  migrationStatements,
  validatePostgresConnectionString,
} from './database-migration-executor.mjs';

async function fixture(manifest, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'appbasis-migrations-'));
  await mkdir(path.join(root, 'owners', 'alpha', 'migrations'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
  }
  const manifestPath = path.join(root, 'appbasis.database.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { root, manifestPath };
}

const validManifest = {
  manifestVersion: 1,
  application: 'demo',
  dialect: 'postgresql',
  owners: [
    {
      id: 'alpha',
      root: 'owners/alpha',
      schemaVersion: 1,
      migrations: ['owners/alpha/migrations/0000.sql'],
    },
  ],
};

const sqlFiles = {
  'owners/alpha/migrations/0000.sql': 'SELECT 1;\n--> statement-breakpoint\nSELECT 2;\n',
};

test('loads migrations strictly in manifest order', async (t) => {
  const { root, manifestPath } = await fixture(validManifest, sqlFiles);
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await loadRepositoryMigrationPlan({
    repositoryRoot: root,
    manifestPath,
    expectedApplication: 'demo',
    expectedOwners: { alpha: 'owners/alpha' },
  });
  assert.deepEqual(plan, [
    {
      ownerId: 'alpha',
      relativePath: 'owners/alpha/migrations/0000.sql',
      statements: ['SELECT 1;', 'SELECT 2;'],
    },
  ]);
});

test('fails closed for unknown or incomplete owner contracts', async (t) => {
  const unknown = structuredClone(validManifest);
  unknown.owners[0].id = 'unknown';
  const a = await fixture(unknown, sqlFiles);
  t.after(() => rm(a.root, { recursive: true, force: true }));
  await assert.rejects(
    loadRepositoryMigrationPlan({
      repositoryRoot: a.root,
      manifestPath: a.manifestPath,
      expectedApplication: 'demo',
      expectedOwners: { alpha: 'owners/alpha' },
    }),
    MigrationConfigurationError,
  );

  const b = await fixture(validManifest, sqlFiles);
  t.after(() => rm(b.root, { recursive: true, force: true }));
  await assert.rejects(
    loadRepositoryMigrationPlan({
      repositoryRoot: b.root,
      manifestPath: b.manifestPath,
      expectedApplication: 'demo',
      expectedOwners: { alpha: 'owners/alpha', beta: 'owners/beta' },
    }),
    MigrationConfigurationError,
  );
});

test('fails closed for missing, escaping and symlinked migration files', async (t) => {
  const missing = await fixture(validManifest);
  t.after(() => rm(missing.root, { recursive: true, force: true }));
  await assert.rejects(
    loadRepositoryMigrationPlan({
      repositoryRoot: missing.root,
      manifestPath: missing.manifestPath,
      expectedApplication: 'demo',
      expectedOwners: { alpha: 'owners/alpha' },
    }),
    MigrationConfigurationError,
  );

  const escapingManifest = structuredClone(validManifest);
  escapingManifest.owners[0].migrations = ['owners/alpha/../outside.sql'];
  const escaping = await fixture(escapingManifest, {
    'owners/outside.sql': 'SELECT 1;',
  });
  t.after(() => rm(escaping.root, { recursive: true, force: true }));
  await assert.rejects(
    loadRepositoryMigrationPlan({
      repositoryRoot: escaping.root,
      manifestPath: escaping.manifestPath,
      expectedApplication: 'demo',
      expectedOwners: { alpha: 'owners/alpha' },
    }),
    MigrationConfigurationError,
  );

  const linked = await fixture(validManifest);
  t.after(() => rm(linked.root, { recursive: true, force: true }));
  const outside = path.join(linked.root, 'outside.sql');
  await writeFile(outside, 'SELECT 1;', 'utf8');
  await symlink(outside, path.join(linked.root, 'owners', 'alpha', 'migrations', '0000.sql'));
  await assert.rejects(
    loadRepositoryMigrationPlan({
      repositoryRoot: linked.root,
      manifestPath: linked.manifestPath,
      expectedApplication: 'demo',
      expectedOwners: { alpha: 'owners/alpha' },
    }),
    MigrationConfigurationError,
  );
});

test('rejects transaction control even when embedded in one manifest statement', async (t) => {
  const unsafe = await fixture(validManifest, {
    'owners/alpha/migrations/0000.sql':
      "CREATE TABLE safe_before(id integer); SELECT 'COMMIT;'; /* ROLLBACK; */ COMMIT; CREATE TABLE unsafe_after(id integer);",
  });
  t.after(() => rm(unsafe.root, { recursive: true, force: true }));

  await assert.rejects(
    loadRepositoryMigrationPlan({
      repositoryRoot: unsafe.root,
      manifestPath: unsafe.manifestPath,
      expectedApplication: 'demo',
      expectedOwners: { alpha: 'owners/alpha' },
    }),
    MigrationConfigurationError,
  );
});

test('allows transaction keywords inside quoted SQL data and dollar-quoted bodies', async (t) => {
  const safe = await fixture(validManifest, {
    'owners/alpha/migrations/0000.sql': [
      "SELECT 'COMMIT; ROLLBACK;';",
      '-- COMMIT;',
      '/* ROLLBACK; */',
      "DO $body$ BEGIN RAISE NOTICE 'COMMIT;'; END $body$;",
    ].join('\n'),
  });
  t.after(() => rm(safe.root, { recursive: true, force: true }));

  const plan = await loadRepositoryMigrationPlan({
    repositoryRoot: safe.root,
    manifestPath: safe.manifestPath,
    expectedApplication: 'demo',
    expectedOwners: { alpha: 'owners/alpha' },
  });
  assert.equal(plan.length, 1);
});

test('rejects unsafe direct plans before opening a database connection', async () => {
  let databaseFactoryCalled = false;
  await assert.rejects(
    applyRepositoryMigrationPlan({
      connectionString: 'postgres://user:secret@db.example/appbasis_tasks_preview',
      expectedDatabase: 'appbasis_tasks_preview',
      plan: [
        {
          ownerId: 'alpha',
          relativePath: 'owners/alpha/migrations/0000.sql',
          statements: ['CREATE TABLE before_commit(id integer); COMMIT; SELECT 1;'],
        },
      ],
      createDatabase: () => {
        databaseFactoryCalled = true;
        throw new Error('must not open');
      },
    }),
    MigrationConfigurationError,
  );
  assert.equal(databaseFactoryCalled, false);
});

test('requires a direct PostgreSQL URL and can pin the logical database target', () => {
  assert.equal(
    validatePostgresConnectionString(' postgres://user:secret@db.example/appbasis_tasks_preview ', {
      expectedDatabase: 'appbasis_tasks_preview',
    }),
    'postgres://user:secret@db.example/appbasis_tasks_preview',
  );
  assert.throws(
    () =>
      validatePostgresConnectionString('postgres://user:secret@db.example/neondb', {
        expectedDatabase: 'appbasis_tasks_preview',
      }),
    MigrationConfigurationError,
  );
  assert.throws(
    () => validatePostgresConnectionString('https://db.example/appbasis_tasks_preview'),
    MigrationConfigurationError,
  );
});

test('splits SQL only on the repository statement breakpoint', () => {
  assert.deepEqual(migrationStatements('SELECT 1;\n--> statement-breakpoint\nSELECT 2;'), [
    'SELECT 1;',
    'SELECT 2;',
  ]);
});

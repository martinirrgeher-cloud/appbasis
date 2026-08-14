import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';
import { DEMO_ROLES } from '@appbasis/permissions';
import { build, mergeConfig } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  detectReferencePermissionFoundationState,
} from '../tooling/reference-preview-permission-foundation';
import {
  detectReferencePermissionSchemaVersion,
} from '../tooling/reference-preview-permission-cutover';
import permissionCutoverConfig from '../tooling/vite.permission-cutover.config';
import permissionFoundationConfig from '../tooling/vite.permission-foundation.config';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference permission v0 PostgreSQL E2E tests.');
}

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const adminConnection = createPostgresDatabase(databaseUrl);
const databaseName =
  'appbasis_reference_cutover_v0_' + randomUUID().replaceAll('-', '').slice(0, 16);
const targetUrl = databaseUrlForName(databaseName);
let connection: ReturnType<typeof createPostgresDatabase> | undefined;
const identityMigrationUrl = new URL(
  '../../../packages/identity/drizzle/0000_appbasis_identity_foundation.sql',
  import.meta.url,
);
const workerSettings = {
  success: true,
  result: {
    bindings: [
      {
        name: 'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS',
        type: 'plain_text',
        text: 'legacy-member,legacy-shared',
      },
      {
        name: 'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS',
        type: 'plain_text',
        text: 'legacy-admin,legacy-shared',
      },
    ],
  },
};

beforeAll(async () => {
  await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
  connection = createPostgresDatabase(targetUrl.toString());
  await applyMigration(requiredConnection(), identityMigrationUrl);
  await insertLegacyIdentities(requiredConnection());
});

afterAll(async () => {
  if (connection !== undefined) await connection.client.end();
  await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await adminConnection.client.end();
});

describe.sequential('Reference preview permission authority cutover from schema v0', () => {
  it('runs the built foundation and cutover runners from zero permission tables to persistent v3 assignments', async () => {
    await expect(
      detectReferencePermissionFoundationState(requiredConnection().client),
    ).resolves.toBe(0);

    const permissionTablesBefore = await requiredConnection().client.unsafe(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename LIKE 'appbasis_permission_%'`,
    );
    expect(permissionTablesBefore).toEqual([]);

    const foundationOutDir = await mkdtemp(
      path.join(tmpdir(), 'appbasis-permission-foundation-'),
    );
    const cutoverOutDir = await mkdtemp(
      path.join(tmpdir(), 'appbasis-permission-cutover-v0-'),
    );
    const settingsPath = path.join(cutoverOutDir, 'worker-settings.json');

    try {
      await writeFile(settingsPath, JSON.stringify(workerSettings), { mode: 0o600 });

      await build(
        mergeConfig(permissionFoundationConfig, {
          build: {
            outDir: foundationOutDir,
            emptyOutDir: false,
          },
        }),
      );
      const foundationBundle = path.join(
        foundationOutDir,
        'reference-preview-permission-foundation.mjs',
      );
      const foundationResult = await execFileAsync(
        process.execPath,
        [foundationBundle],
        {
          cwd: repositoryRoot,
          env: {
            ...process.env,
            APPBASIS_DATABASE_URL: targetUrl.toString(),
            APPBASIS_PERMISSION_FOUNDATION_TARGET: 'reference-preview',
          },
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
        },
      );

      expect(foundationResult.stderr).toBe('');
      expect(foundationResult.stdout).toContain(
        'Reference permission foundation ready: schema v1, applied.',
      );
      await expect(
        detectReferencePermissionFoundationState(requiredConnection().client),
      ).resolves.toBe(1);
      await expect(
        detectReferencePermissionSchemaVersion(requiredConnection().client),
      ).resolves.toBe(1);

      await build(
        mergeConfig(permissionCutoverConfig, {
          build: {
            outDir: cutoverOutDir,
            emptyOutDir: false,
          },
        }),
      );
      const cutoverBundle = path.join(
        cutoverOutDir,
        'reference-preview-permission-cutover.mjs',
      );
      const cutoverResult = await execFileAsync(process.execPath, [cutoverBundle], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          APPBASIS_DATABASE_URL: targetUrl.toString(),
          APPBASIS_PERMISSION_CUTOVER_TARGET: 'reference-preview',
          APPBASIS_PERMISSION_CUTOVER_MODE: 'apply',
          APPBASIS_REFERENCE_WORKER_SETTINGS_PATH: settingsPath,
        },
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      });

      expect(cutoverResult.stderr).toBe('');
      expect(cutoverResult.stdout).toContain(
        'Reference permission cutover apply completed: schema v3, 3 assignments verified.',
      );
      await expect(
        detectReferencePermissionSchemaVersion(requiredConnection().client),
      ).resolves.toBe(3);

      const assignments = await requiredConnection().client.unsafe(
        `SELECT principal_id, role_id
         FROM appbasis_permission_principal_role
         WHERE principal_id IN ('legacy-member', 'legacy-admin', 'legacy-shared')
         ORDER BY principal_id ASC, role_id ASC`,
      );
      expect(assignments).toEqual([
        { principal_id: 'legacy-admin', role_id: DEMO_ROLES.admin },
        { principal_id: 'legacy-member', role_id: DEMO_ROLES.member },
        { principal_id: 'legacy-shared', role_id: DEMO_ROLES.admin },
      ]);

      const secondFoundationResult = await execFileAsync(
        process.execPath,
        [foundationBundle],
        {
          cwd: repositoryRoot,
          env: {
            ...process.env,
            APPBASIS_DATABASE_URL: targetUrl.toString(),
            APPBASIS_PERMISSION_FOUNDATION_TARGET: 'reference-preview',
          },
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
        },
      );
      expect(secondFoundationResult.stderr).toBe('');
      expect(secondFoundationResult.stdout).toContain(
        'Reference permission foundation ready: schema v1, already present.',
      );
    } finally {
      await rm(foundationOutDir, { recursive: true, force: true });
      await rm(cutoverOutDir, { recursive: true, force: true });
    }
  }, 35_000);
});

async function insertLegacyIdentities(
  target: ReturnType<typeof createPostgresDatabase>,
) {
  for (const [id, username] of [
    ['legacy-member', 'legacy.member'],
    ['legacy-admin', 'legacy.admin'],
    ['legacy-shared', 'legacy.shared'],
  ] as const) {
    await target.client.unsafe(
      `INSERT INTO "user" (id, name, email, username, display_username, role)
       VALUES ($1, $2, $3, $4, $4, 'user')`,
      [id, username, `${username}@identity.invalid`, username],
    );
    await target.client.unsafe(
      `INSERT INTO appbasis_identity_security_state (identity_id)
       VALUES ($1)`,
      [id],
    );
  }
}

async function applyMigration(
  target: ReturnType<typeof createPostgresDatabase>,
  url: URL,
) {
  const sql = await readFile(url, 'utf8');
  for (const statement of sql
    .split('--> statement-breakpoint')
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    await target.client.unsafe(statement);
  }
}

function databaseUrlForName(name: string) {
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL unexpectedly became unavailable.');
  }
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url;
}

function requiredConnection() {
  if (connection === undefined) {
    throw new Error('Reference permission v0 cutover database was not initialized.');
  }
  return connection;
}

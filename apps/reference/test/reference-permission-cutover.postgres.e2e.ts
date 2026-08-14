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
  ReferencePermissionCutoverStateError,
  applyReferencePreviewPermissionCutover,
  detectReferencePermissionSchemaVersion,
  verifyReferencePreviewPermissionCutover,
} from '../tooling/reference-preview-permission-cutover';
import permissionCutoverConfig from '../tooling/vite.permission-cutover.config';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference permission cutover PostgreSQL E2E tests.');
}

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const adminConnection = createPostgresDatabase(databaseUrl);
const databaseName =
  'appbasis_reference_cutover_' + randomUUID().replaceAll('-', '').slice(0, 20);
const targetUrl = databaseUrlForName(databaseName);
let connection: ReturnType<typeof createPostgresDatabase> | undefined;
const identityMigrationUrl = new URL(
  '../../../packages/identity/drizzle/0000_appbasis_identity_foundation.sql',
  import.meta.url,
);
const permissionFoundationUrl = new URL(
  '../../../packages/permissions/migrations/0000_appbasis_permissions_foundation.sql',
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
  await prepareLegacyPermissionDatabase(requiredConnection());
});

afterAll(async () => {
  if (connection !== undefined) await connection.client.end();
  await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await adminConnection.client.end();
});

describe.sequential('Reference preview permission authority cutover', () => {
  it('upgrades the existing permission foundation and persists both legacy role classes before deployment', async () => {
    await expect(
      detectReferencePermissionSchemaVersion(requiredConnection().client),
    ).resolves.toBe(1);
    await expect(
      verifyReferencePreviewPermissionCutover({
        connectionString: targetUrl.toString(),
        workerSettings,
      }),
    ).rejects.toBeInstanceOf(ReferencePermissionCutoverStateError);

    await expect(
      applyReferencePreviewPermissionCutover({
        connectionString: targetUrl.toString(),
        workerSettings,
      }),
    ).resolves.toEqual({ schemaVersion: 3, assignmentCount: 3 });
    await expect(
      detectReferencePermissionSchemaVersion(requiredConnection().client),
    ).resolves.toBe(3);
    await expect(
      verifyReferencePreviewPermissionCutover({
        connectionString: targetUrl.toString(),
        workerSettings,
      }),
    ).resolves.toEqual({ schemaVersion: 3, assignmentCount: 3 });

    await expectLegacyAssignments(requiredConnection());

    const roleRows = await requiredConnection().client.unsafe(
      `SELECT role_id, state, kind
       FROM appbasis_permission_role
       WHERE role_id IN ($1, $2)
       ORDER BY role_id ASC`,
      [DEMO_ROLES.admin, DEMO_ROLES.member],
    );
    expect(roleRows).toEqual([
      { role_id: DEMO_ROLES.admin, state: 'active', kind: 'system' },
      { role_id: DEMO_ROLES.member, state: 'active', kind: 'system' },
    ]);

    const auditTable = await requiredConnection().client.unsafe(
      `SELECT to_regclass('public.appbasis_permission_administration_audit')::text AS relation_name`,
    );
    expect(auditTable).toEqual([
      { relation_name: 'appbasis_permission_administration_audit' },
    ]);

    await expect(
      applyReferencePreviewPermissionCutover({
        connectionString: targetUrl.toString(),
        workerSettings,
      }),
    ).resolves.toEqual({ schemaVersion: 3, assignmentCount: 3 });
  });

  it('executes the built operational runner from repository root and resolves versioned migrations correctly', async () => {
    const bundledDatabaseName =
      'appbasis_cutover_bundle_' + randomUUID().replaceAll('-', '').slice(0, 20);
    const bundledUrl = databaseUrlForName(bundledDatabaseName);
    const outDir = await mkdtemp(path.join(tmpdir(), 'appbasis-cutover-runner-'));
    const settingsPath = path.join(outDir, 'worker-settings.json');
    let bundledConnection: ReturnType<typeof createPostgresDatabase> | undefined;

    try {
      await adminConnection.client.unsafe(`CREATE DATABASE ${bundledDatabaseName}`);
      bundledConnection = createPostgresDatabase(bundledUrl.toString());
      await prepareLegacyPermissionDatabase(bundledConnection);
      await writeFile(settingsPath, JSON.stringify(workerSettings), { mode: 0o600 });

      await build(
        mergeConfig(permissionCutoverConfig, {
          build: {
            outDir,
            emptyOutDir: false,
          },
        }),
      );

      const bundlePath = path.join(
        outDir,
        'reference-preview-permission-cutover.mjs',
      );
      const result = await execFileAsync(process.execPath, [bundlePath], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          APPBASIS_DATABASE_URL: bundledUrl.toString(),
          APPBASIS_PERMISSION_CUTOVER_TARGET: 'reference-preview',
          APPBASIS_PERMISSION_CUTOVER_MODE: 'apply',
          APPBASIS_REFERENCE_WORKER_SETTINGS_PATH: settingsPath,
        },
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      });

      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(
        'Reference permission cutover apply completed: schema v3, 3 assignments verified.',
      );
      await expect(
        detectReferencePermissionSchemaVersion(bundledConnection.client),
      ).resolves.toBe(3);
      await expectLegacyAssignments(bundledConnection);
    } finally {
      if (bundledConnection !== undefined) await bundledConnection.client.end();
      await adminConnection.client.unsafe(
        `DROP DATABASE IF EXISTS ${bundledDatabaseName} WITH (FORCE)`,
      );
      await rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});

async function prepareLegacyPermissionDatabase(
  target: ReturnType<typeof createPostgresDatabase>,
) {
  await applyMigration(target, identityMigrationUrl);
  await applyMigration(target, permissionFoundationUrl);
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

async function expectLegacyAssignments(
  target: ReturnType<typeof createPostgresDatabase>,
) {
  const assignments = await target.client.unsafe(
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
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url;
}

function requiredConnection() {
  if (connection === undefined) {
    throw new Error('Reference permission cutover database was not initialized.');
  }
  return connection;
}

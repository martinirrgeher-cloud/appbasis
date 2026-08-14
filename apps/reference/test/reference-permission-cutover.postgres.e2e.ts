import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';
import { DEMO_ROLES } from '@appbasis/permissions';

import {
  ReferencePermissionCutoverStateError,
  applyReferencePreviewPermissionCutover,
  detectReferencePermissionSchemaVersion,
  verifyReferencePreviewPermissionCutover,
} from '../tooling/reference-preview-permission-cutover';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference permission cutover PostgreSQL E2E tests.');
}

const adminConnection = createPostgresDatabase(databaseUrl);
const databaseName =
  'appbasis_reference_cutover_' + randomUUID().replaceAll('-', '').slice(0, 20);
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;
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
  await applyMigration(identityMigrationUrl);
  await applyMigration(permissionFoundationUrl);
  for (const [id, username] of [
    ['legacy-member', 'legacy.member'],
    ['legacy-admin', 'legacy.admin'],
    ['legacy-shared', 'legacy.shared'],
  ] as const) {
    await requiredConnection().client.unsafe(
      `INSERT INTO "user" (id, name, email, username, display_username, role)
       VALUES ($1, $2, $3, $4, $4, 'user')`,
      [id, username, `${username}@identity.invalid`, username],
    );
    await requiredConnection().client.unsafe(
      `INSERT INTO appbasis_identity_security_state (identity_id)
       VALUES ($1)`,
      [id],
    );
  }
});

afterAll(async () => {
  if (connection !== undefined) await connection.client.end();
  await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await adminConnection.client.end();
});

describe('Reference preview permission authority cutover', () => {
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
});

async function applyMigration(url: URL) {
  const sql = await readFile(url, 'utf8');
  for (const statement of sql
    .split('--> statement-breakpoint')
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    await requiredConnection().client.unsafe(statement);
  }
}

function requiredConnection() {
  if (connection === undefined) {
    throw new Error('Reference permission cutover database was not initialized.');
  }
  return connection;
}

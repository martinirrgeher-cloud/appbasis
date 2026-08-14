import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';
import { DEMO_ROLES } from '@appbasis/permissions';
import { build, mergeConfig } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ReferencePermissionAuthorityStateError,
  verifyReferencePreviewPermissionAuthority,
} from '../tooling/reference-preview-permission-authority';
import {
  applyReferencePreviewPermissionCutover,
} from '../tooling/reference-preview-permission-cutover';
import permissionAuthorityConfig from '../tooling/vite.permission-authority.config';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    'DATABASE_URL is required for Reference permission authority PostgreSQL E2E tests.',
  );
}

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const adminConnection = createPostgresDatabase(databaseUrl);
const databaseName =
  'appbasis_reference_authority_' + randomUUID().replaceAll('-', '').slice(0, 18);
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
        text: 'demo-principal',
      },
      {
        name: 'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS',
        type: 'plain_text',
        text: 'technical-root',
      },
    ],
  },
};

beforeAll(async () => {
  await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
  connection = createPostgresDatabase(targetUrl.toString());
  await applyMigration(requiredConnection(), identityMigrationUrl);
  await applyMigration(requiredConnection(), permissionFoundationUrl);
  await requiredConnection().client.unsafe(
    `INSERT INTO "user" (id, name, email, username, display_username, role)
     VALUES ('demo-principal', 'demo.user', 'demo.user@identity.invalid', 'demo.user', 'demo.user', 'user')`,
  );
  await requiredConnection().client.unsafe(
    `INSERT INTO appbasis_identity_security_state (identity_id)
     VALUES ('demo-principal')`,
  );
  await requiredConnection().client.unsafe(
    `INSERT INTO "user" (id, name, email, username, display_username, role)
     VALUES ('technical-root', 'root_admin', 'root_admin@identity.invalid', 'root_admin', 'root_admin', 'admin')`,
  );
  await applyReferencePreviewPermissionCutover({
    connectionString: targetUrl.toString(),
    workerSettings,
  });
});

afterAll(async () => {
  if (connection !== undefined) await connection.client.end();
  await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await adminConnection.client.end();
});

describe.sequential('Reference persistent permission authority verifier', () => {
  it('verifies the post-cutover PostgreSQL state without any Cloudflare Worker settings', async () => {
    await expect(
      verifyReferencePreviewPermissionAuthority({
        connectionString: targetUrl.toString(),
      }),
    ).resolves.toEqual({
      schemaVersion: 3,
      assignmentCount: 1,
      demoPrincipalId: 'demo-principal',
    });
  });

  it('executes the built deploy verifier with only the protected database target', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'appbasis-permission-authority-'));
    try {
      await build(
        mergeConfig(permissionAuthorityConfig, {
          build: {
            outDir,
            emptyOutDir: true,
          },
        }),
      );

      const bundlePath = path.join(
        outDir,
        'reference-preview-permission-authority.mjs',
      );
      const result = await execFileAsync(process.execPath, [bundlePath], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          APPBASIS_DATABASE_URL: targetUrl.toString(),
          APPBASIS_PERMISSION_AUTHORITY_TARGET: 'reference-preview',
        },
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      });

      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(
        'Reference permission authority verify completed: schema v3, 1 assignments verified.',
      );
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('fails closed if an authentication-only technical administrator gains AppBasis permission state', async () => {
    await requiredConnection().client.unsafe(
      `INSERT INTO appbasis_permission_principal (principal_id)
       VALUES ('technical-root')`,
    );
    await requiredConnection().client.unsafe(
      `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
       VALUES ('technical-root', $1)`,
      [DEMO_ROLES.admin],
    );

    await expect(
      verifyReferencePreviewPermissionAuthority({
        connectionString: targetUrl.toString(),
      }),
    ).rejects.toBeInstanceOf(ReferencePermissionAuthorityStateError);

    await requiredConnection().client.unsafe(
      `DELETE FROM appbasis_permission_principal
       WHERE principal_id = 'technical-root'`,
    );
  });

  it('fails closed if the protected demo identity loses its persistent member assignment', async () => {
    await requiredConnection().client.unsafe(
      `DELETE FROM appbasis_permission_principal_role
       WHERE principal_id = 'demo-principal'
         AND role_id = $1`,
      [DEMO_ROLES.member],
    );

    await expect(
      verifyReferencePreviewPermissionAuthority({
        connectionString: targetUrl.toString(),
      }),
    ).rejects.toBeInstanceOf(ReferencePermissionAuthorityStateError);

    await requiredConnection().client.unsafe(
      `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
       VALUES ('demo-principal', $1)`,
      [DEMO_ROLES.member],
    );
  });

  it('fails closed if a protected Reference system role capability drifts', async () => {
    const capabilityRows = await requiredConnection().client.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_role_capability
       WHERE role_id = $1
       ORDER BY capability_id ASC`,
      [DEMO_ROLES.member],
    );
    const capabilityId = capabilityRows[0]?.capability_id;
    if (typeof capabilityId !== 'string') {
      throw new Error('Expected a member capability for authority drift test.');
    }

    await requiredConnection().client.unsafe(
      `DELETE FROM appbasis_permission_role_capability
       WHERE role_id = $1
         AND capability_id = $2`,
      [DEMO_ROLES.member, capabilityId],
    );

    await expect(
      verifyReferencePreviewPermissionAuthority({
        connectionString: targetUrl.toString(),
      }),
    ).rejects.toBeInstanceOf(ReferencePermissionAuthorityStateError);

    await requiredConnection().client.unsafe(
      `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
       VALUES ($1, $2)`,
      [DEMO_ROLES.member, capabilityId],
    );
  });
});

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
    throw new Error('Reference permission authority database was not initialized.');
  }
  return connection;
}

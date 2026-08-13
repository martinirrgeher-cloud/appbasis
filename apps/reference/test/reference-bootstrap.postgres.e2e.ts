import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import { bootstrapReferenceDemoUser } from '../worker/bootstrap';

interface MigrationOwner {
  readonly migrations: readonly string[];
}

interface DatabaseManifest {
  readonly owners: readonly MigrationOwner[];
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference bootstrap PostgreSQL E2E tests.');
}

const bootstrapDatabaseName = 'appbasis_reference_bootstrap_e2e';
const bootstrapDatabaseUrl = new URL(databaseUrl);
bootstrapDatabaseUrl.pathname = `/${bootstrapDatabaseName}`;

const secret = 'reference-bootstrap-e2e-secret-at-least-32-characters';
const baseURL = 'http://localhost:8787';
const username = 'demo.bootstrap';
const originalTemporaryPassword = 'Temporary-Reference-123!';
const replacementTemporaryPassword = 'Must-Not-Replace-456!';
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
const adminConnection = createPostgresDatabase(databaseUrl);
let migrationConnection: ReturnType<typeof createPostgresDatabase> | undefined;

describe('Reference demo user bootstrap PostgreSQL E2E', () => {
  beforeAll(async () => {
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${bootstrapDatabaseName} WITH (FORCE)`,
    );
    await adminConnection.client.unsafe(`CREATE DATABASE ${bootstrapDatabaseName}`);
    migrationConnection = createPostgresDatabase(bootstrapDatabaseUrl.toString());

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DatabaseManifest;
    for (const owner of manifest.owners) {
      for (const migration of owner.migrations) {
        const sql = await readFile(
          path.resolve(repositoryRoot, ...migration.split('/')),
          'utf8',
        );
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') {
            await migrationConnection.client.unsafe(statement);
          }
        }
      }
    }

    await migrationConnection.client.end();
    migrationConnection = undefined;
  });

  afterAll(async () => {
    if (migrationConnection !== undefined) {
      await migrationConnection.client.end();
    }
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${bootstrapDatabaseName} WITH (FORCE)`,
    );
    await adminConnection.client.end();
  });

  it('provisions one password-change-required identity and keeps retry idempotent', async () => {
    const first = await bootstrapReferenceDemoUser({
      connectionString: bootstrapDatabaseUrl.toString(),
      secret,
      baseURL,
      username: '  Demo.Bootstrap  ',
      displayName: ' Bootstrap Demo ',
      temporaryPassword: originalTemporaryPassword,
      contactEmail: ' bootstrap@example.test ',
    });

    expect(first).toMatchObject({
      username,
      accountStatus: 'active',
      mustChangePassword: true,
    });
    expect(first.identityId).toEqual(expect.any(String));
    expect(Object.keys(first).sort()).toEqual(
      ['accountStatus', 'identityId', 'mustChangePassword', 'username'].sort(),
    );
    expect(JSON.stringify(first)).not.toContain(originalTemporaryPassword);
    expect(JSON.stringify(first)).not.toContain(secret);
    expect(JSON.stringify(first)).not.toContain('bootstrap@example.test');
    expect(JSON.stringify(first)).not.toContain('@identity.invalid');
    expect(JSON.stringify(first)).not.toContain('sessionToken');

    const second = await bootstrapReferenceDemoUser({
      connectionString: bootstrapDatabaseUrl.toString(),
      secret,
      baseURL,
      username,
      displayName: 'Bootstrap Demo',
      temporaryPassword: replacementTemporaryPassword,
    });

    expect(second).toEqual(first);

    const verificationConnection = createPostgresDatabase(bootstrapDatabaseUrl.toString());
    try {
      const auth = createBetterAuthRuntime({
        database: verificationConnection.database,
        baseURL,
        secret,
      });
      const identity = createIdentityRuntime({
        auth,
        sql: verificationConnection.client,
        baseURL,
      });

      const signedIn = await identity.service.signInWithUsername({
        username,
        password: originalTemporaryPassword,
      });
      expect(signedIn.identity.identityId).toBe(first.identityId);
      expect(signedIn.access).toBe('password-change-required');

      await expect(
        identity.service.signInWithUsername({
          username,
          password: replacementTemporaryPassword,
        }),
      ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });

      const userRows = await verificationConnection.client<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "user"
      `;
      const identityRows = await verificationConnection.client<{ count: number }[]>`
        SELECT count(*)::int AS count FROM appbasis_identity_security_state
      `;
      expect(userRows[0]?.count).toBe(1);
      expect(identityRows[0]?.count).toBe(1);
    } finally {
      await verificationConnection.client.end();
    }
  });
});

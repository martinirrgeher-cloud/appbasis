import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import {
  bootstrapReferenceDemoUser,
  ReferenceDemoUserBootstrapAuthorizationError,
} from '../worker/bootstrap';

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
const adminUsername = 'bootstrap.admin';
const adminPassword = 'Bootstrap-technical-admin-42!';
const otherAdminUsername = 'bootstrap.otheradmin';
const otherAdminPassword = 'Bootstrap-other-admin-42!';
const preexistingUsername = 'preexisting.user';
const preexistingPassword = 'Preexisting-user-password-42!';
const username = 'demo.bootstrap';
const originalTemporaryPassword = 'Temporary-Reference-123!';
const replacementTemporaryPassword = 'Must-Not-Replace-456!';
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
const adminConnection = createPostgresDatabase(databaseUrl);
let migrationConnection: ReturnType<typeof createPostgresDatabase> | undefined;
let administrativeSessionToken = '';
let nonAdministrativeSessionToken = '';

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

    const auth = createBetterAuthRuntime({
      database: migrationConnection.database,
      baseURL,
      secret,
    });
    await auth.api.createUser({
      body: {
        email: 'bootstrap-admin@identity.invalid',
        password: adminPassword,
        name: 'Reference Technical Admin',
        role: 'admin',
        data: {
          username: adminUsername,
          displayUsername: adminUsername,
        },
      },
    });
    await auth.api.createUser({
      body: {
        email: 'bootstrap-other-admin@identity.invalid',
        password: otherAdminPassword,
        name: 'Reference Other Technical Admin',
        role: 'admin',
        data: {
          username: otherAdminUsername,
          displayUsername: otherAdminUsername,
        },
      },
    });
    await auth.api.createUser({
      body: {
        email: 'preexisting-user@identity.invalid',
        password: preexistingPassword,
        name: 'Preexisting Better Auth User',
        role: 'user',
        data: {
          username: preexistingUsername,
          displayUsername: preexistingUsername,
        },
      },
    });

    administrativeSessionToken = await signInSession(auth, adminUsername, adminPassword);
    nonAdministrativeSessionToken = await signInSession(
      auth,
      preexistingUsername,
      preexistingPassword,
    );

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

  it('authenticates technical admin authority before reconciling an existing Better Auth user', async () => {
    for (const invalidAdministrativeSessionToken of [
      'better-auth.session_token=forged-session',
      nonAdministrativeSessionToken,
    ]) {
      await expect(
        bootstrapReferenceDemoUser({
          connectionString: bootstrapDatabaseUrl.toString(),
          secret,
          baseURL,
          administrativeSessionToken: invalidAdministrativeSessionToken,
          username: preexistingUsername,
          displayName: 'Preexisting Better Auth User',
          temporaryPassword: 'Unused-Temporary-123!',
        }),
      ).rejects.toBeInstanceOf(ReferenceDemoUserBootstrapAuthorizationError);
    }

    const connection = createPostgresDatabase(bootstrapDatabaseUrl.toString());
    try {
      const rows = await connection.client<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM appbasis_identity_security_state state
        JOIN "user" auth_user ON auth_user.id = state.identity_id
        WHERE auth_user.username = ${preexistingUsername}
      `;
      expect(rows[0]?.count).toBe(0);
    } finally {
      await connection.client.end();
    }
  });

  it('refuses to adopt any technical Better Auth administrator as an AppBasis identity', async () => {
    for (const technicalAdminUsername of [adminUsername, otherAdminUsername]) {
      await expect(
        bootstrapReferenceDemoUser({
          connectionString: bootstrapDatabaseUrl.toString(),
          secret,
          baseURL,
          administrativeSessionToken,
          username: technicalAdminUsername,
          displayName: 'Reference Technical Admin',
          temporaryPassword: 'Unused-Temporary-456!',
        }),
      ).rejects.toBeInstanceOf(ReferenceDemoUserBootstrapAuthorizationError);
    }

    const connection = createPostgresDatabase(bootstrapDatabaseUrl.toString());
    try {
      const rows = await connection.client<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM appbasis_identity_security_state state
        JOIN "user" auth_user ON auth_user.id = state.identity_id
        WHERE auth_user.username IN (${adminUsername}, ${otherAdminUsername})
      `;
      expect(rows[0]?.count).toBe(0);
    } finally {
      await connection.client.end();
    }
  });

  it('provisions one password-change-required identity and keeps retry idempotent', async () => {
    const first = await bootstrapReferenceDemoUser({
      connectionString: bootstrapDatabaseUrl.toString(),
      secret,
      baseURL,
      administrativeSessionToken,
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
    const serializedFirst = JSON.stringify(first);
    expect(serializedFirst).not.toContain(originalTemporaryPassword);
    expect(serializedFirst).not.toContain(secret);
    expect(serializedFirst).not.toContain(administrativeSessionToken);
    expect(serializedFirst).not.toContain('bootstrap@example.test');
    expect(serializedFirst).not.toContain('@identity.invalid');
    expect(serializedFirst).not.toContain('sessionToken');

    const second = await bootstrapReferenceDemoUser({
      connectionString: bootstrapDatabaseUrl.toString(),
      secret,
      baseURL,
      administrativeSessionToken,
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
      expect(userRows[0]?.count).toBe(4);
      expect(identityRows[0]?.count).toBe(1);
    } finally {
      await verificationConnection.client.end();
    }
  });
});

async function signInSession(
  auth: ReturnType<typeof createBetterAuthRuntime>,
  signInUsername: string,
  password: string,
): Promise<string> {
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: signInUsername, password }),
    }),
  );
  if (!response.ok) throw new Error('Better Auth test sign-in failed.');
  return sessionCookie(response);
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  if (cookie === null) throw new Error('Better Auth did not return a session cookie.');
  return cookie.split(';', 1)[0] ?? cookie;
}

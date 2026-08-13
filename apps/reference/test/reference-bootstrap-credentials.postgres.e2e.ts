import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bootstrapReferenceDemoUserWithAdministratorCredentials,
  ReferenceDemoUserBootstrapAuthenticationError,
} from '../worker/bootstrap';

interface MigrationOwner {
  readonly migrations: readonly string[];
}

interface DatabaseManifest {
  readonly owners: readonly MigrationOwner[];
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for transient bootstrap PostgreSQL E2E tests.');
}

const databaseName = 'appbasis_reference_transient_bootstrap_e2e';
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.pathname = `/${databaseName}`;
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
const secret = 'reference-transient-bootstrap-secret-at-least-32-characters';
const baseURL = 'http://localhost:8787';
const adminUsername = 'transient.admin';
const adminPassword = 'Transient-Admin-Password-42!';
const memberUsername = 'transient.member';
const memberPassword = 'Transient-Member-Password-42!';
const demoUsername = 'transient.demo';
const demoPassword = 'Transient-Demo-Password-42!';
const adminConnection = createPostgresDatabase(databaseUrl);
let connection: ReturnType<typeof createPostgresDatabase> | undefined;

describe('Reference transient administrator demo bootstrap PostgreSQL E2E', () => {
  beforeAll(async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
    connection = createPostgresDatabase(isolatedUrl.toString());

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DatabaseManifest;
    for (const owner of manifest.owners) {
      for (const migration of owner.migrations) {
        const sql = await readFile(path.resolve(repositoryRoot, ...migration.split('/')), 'utf8');
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') await connection.client.unsafe(statement);
        }
      }
    }

    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL,
      secret,
    });
    await auth.api.createUser({
      body: {
        email: 'transient-admin@identity.invalid',
        password: adminPassword,
        name: 'Transient Technical Admin',
        role: 'admin',
        data: { username: adminUsername, displayUsername: adminUsername },
      },
    });
    await auth.api.createUser({
      body: {
        email: 'transient-member@identity.invalid',
        password: memberPassword,
        name: 'Transient Member',
        role: 'user',
        data: { username: memberUsername, displayUsername: memberUsername },
      },
    });
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.client.end();
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.end();
  });

  it('provisions through a request-local admin session and removes that session afterwards', async () => {
    const beforeSessions = await countSessions(adminUsername);

    const result = await bootstrapReferenceDemoUserWithAdministratorCredentials({
      connectionString: isolatedUrl.toString(),
      secret,
      baseURL,
      administratorUsername: adminUsername,
      administratorPassword: adminPassword,
      username: demoUsername,
      displayName: 'Transient Demo',
      temporaryPassword: demoPassword,
    });

    expect(result).toMatchObject({
      username: demoUsername,
      accountStatus: 'active',
      mustChangePassword: true,
    });
    expect(await countSessions(adminUsername)).toBe(beforeSessions);

    const stateRows = await requiredConnection().client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state state
      JOIN "user" auth_user ON auth_user.id = state.identity_id
      WHERE auth_user.username = ${demoUsername}
    `;
    expect(stateRows[0]?.count).toBe(1);
  });

  it('cleans the transient session after an idempotent completed retry', async () => {
    const beforeSessions = await countSessions(adminUsername);
    const retry = await bootstrapReferenceDemoUserWithAdministratorCredentials({
      connectionString: isolatedUrl.toString(),
      secret,
      baseURL,
      administratorUsername: adminUsername,
      administratorPassword: adminPassword,
      username: demoUsername,
      displayName: 'Transient Demo',
      temporaryPassword: 'Must-Not-Replace-Password-99!',
    });

    expect(retry.username).toBe(demoUsername);
    expect(await countSessions(adminUsername)).toBe(beforeSessions);
  });

  it('rejects invalid administrator credentials without leaving a session or demo identity', async () => {
    const beforeSessions = await countSessions(adminUsername);
    await expect(
      bootstrapReferenceDemoUserWithAdministratorCredentials({
        connectionString: isolatedUrl.toString(),
        secret,
        baseURL,
        administratorUsername: adminUsername,
        administratorPassword: 'Wrong-Administrator-Password-42!',
        username: 'transient.failed',
        displayName: 'Failed Demo',
        temporaryPassword: 'Failed-Demo-Password-42!',
      }),
    ).rejects.toBeInstanceOf(ReferenceDemoUserBootstrapAuthenticationError);

    expect(await countSessions(adminUsername)).toBe(beforeSessions);
    const failedRows = await requiredConnection().client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "user" WHERE username = 'transient.failed'
    `;
    expect(failedRows[0]?.count).toBe(0);
  });

  it('rejects non-admin credentials and removes their transient session', async () => {
    const beforeSessions = await countSessions(memberUsername);
    await expect(
      bootstrapReferenceDemoUserWithAdministratorCredentials({
        connectionString: isolatedUrl.toString(),
        secret,
        baseURL,
        administratorUsername: memberUsername,
        administratorPassword: memberPassword,
        username: 'transient.unauthorized',
        displayName: 'Unauthorized Demo',
        temporaryPassword: 'Unauthorized-Demo-Password-42!',
      }),
    ).rejects.toThrow('valid administrative Better Auth session');

    expect(await countSessions(memberUsername)).toBe(beforeSessions);
    const unauthorizedRows = await requiredConnection().client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "user" WHERE username = 'transient.unauthorized'
    `;
    expect(unauthorizedRows[0]?.count).toBe(0);
  });
});

function requiredConnection(): ReturnType<typeof createPostgresDatabase> {
  if (connection === undefined) throw new Error('Expected transient bootstrap database');
  return connection;
}

async function countSessions(targetUsername: string): Promise<number> {
  const rows = await requiredConnection().client<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM session s
    JOIN "user" u ON u.id = s.user_id
    WHERE u.username = ${targetUsername}
  `;
  return rows[0]?.count ?? -1;
}

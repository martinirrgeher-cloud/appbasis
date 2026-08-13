import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bootstrapReferenceDemoUserWithAdministratorCredentials,
  ReferenceDemoUserBootstrapAuthenticationError,
} from '../worker/bootstrap-credentials';

interface MigrationOwner {
  readonly migrations: readonly string[];
}

interface DatabaseManifest {
  readonly owners: readonly MigrationOwner[];
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference PostgreSQL E2E tests.');
}

const databaseName = 'appbasis_reference_bootstrap_orchestration_e2e';
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.pathname = `/${databaseName}`;
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
const secret = `s-${'x'.repeat(40)}`;
const baseURL = 'https://preview.example.test';
const adminUsername = 'orchestration.admin';
const memberUsername = 'orchestration.member';
const demoUsername = 'orchestration.demo';
const adminCredential = credential('admin');
const memberCredential = credential('member');
const demoCredential = credential('demo');
const adminConnection = createPostgresDatabase(databaseUrl);
let connection: ReturnType<typeof createPostgresDatabase> | undefined;

describe('Reference transient demo bootstrap PostgreSQL E2E', () => {
  beforeAll(async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
    connection = createPostgresDatabase(isolatedUrl.toString());

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DatabaseManifest;
    for (const owner of manifest.owners) {
      for (const migration of owner.migrations) {
        const sql = await readFile(path.resolve(repositoryRoot, ...migration.split('/')), 'utf8');
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') await requiredConnection().client.unsafe(statement);
        }
      }
    }

    const auth = createBetterAuthRuntime({
      database: requiredConnection().database,
      baseURL,
      secret,
    });
    await auth.api.createUser({
      body: {
        email: 'orchestration-admin@identity.invalid',
        password: adminCredential,
        name: 'Orchestration Technical Admin',
        role: 'admin',
        data: { username: adminUsername, displayUsername: adminUsername },
      },
    });
    await auth.api.createUser({
      body: {
        email: 'orchestration-member@identity.invalid',
        password: memberCredential,
        name: 'Orchestration Member',
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

  it('provisions and retries without retaining administrator sessions', async () => {
    const before = await countSessions(adminUsername);
    const common = {
      connectionString: isolatedUrl.toString(),
      secret,
      baseURL,
      administratorUsername: adminUsername,
      administratorCredential: adminCredential,
      username: demoUsername,
      displayName: 'Orchestration Demo',
    };

    const first = await bootstrapReferenceDemoUserWithAdministratorCredentials({
      ...common,
      temporaryPassword: demoCredential,
    });
    expect(first).toMatchObject({
      username: demoUsername,
      accountStatus: 'active',
      mustChangePassword: true,
    });
    expect(await countSessions(adminUsername)).toBe(before);

    const retry = await bootstrapReferenceDemoUserWithAdministratorCredentials({
      ...common,
      temporaryPassword: credential('different'),
    });
    expect(retry.identityId).toBe(first.identityId);
    expect(await countSessions(adminUsername)).toBe(before);

    const states = await requiredConnection().client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state s
      JOIN "user" u ON u.id = s.identity_id
      WHERE u.username = ${demoUsername}
    `;
    expect(states[0]?.count).toBe(1);
  });

  it('rejects an invalid administrator credential without creating a target or session', async () => {
    const before = await countSessions(adminUsername);
    await expect(
      bootstrapReferenceDemoUserWithAdministratorCredentials({
        connectionString: isolatedUrl.toString(),
        secret,
        baseURL,
        administratorUsername: adminUsername,
        administratorCredential: credential('wrong'),
        username: 'orchestration.failed',
        displayName: 'Failed Target',
        temporaryPassword: credential('failed'),
      }),
    ).rejects.toBeInstanceOf(ReferenceDemoUserBootstrapAuthenticationError);
    expect(await countSessions(adminUsername)).toBe(before);
    expect(await countUsers('orchestration.failed')).toBe(0);
  });

  it('delegates non-admin rejection to Identity and removes that transient session', async () => {
    const before = await countSessions(memberUsername);
    await expect(
      bootstrapReferenceDemoUserWithAdministratorCredentials({
        connectionString: isolatedUrl.toString(),
        secret,
        baseURL,
        administratorUsername: memberUsername,
        administratorCredential: memberCredential,
        username: 'orchestration.unauthorized',
        displayName: 'Unauthorized Target',
        temporaryPassword: credential('unauthorized'),
      }),
    ).rejects.toThrow('valid administrative Better Auth session');
    expect(await countSessions(memberUsername)).toBe(before);
    expect(await countUsers('orchestration.unauthorized')).toBe(0);
  });
});

function requiredConnection(): ReturnType<typeof createPostgresDatabase> {
  if (connection === undefined) throw new Error('Expected orchestration database connection');
  return connection;
}

function credential(seed: string): string {
  return `${seed}-${'z'.repeat(24)}`;
}

async function countSessions(username: string): Promise<number> {
  const rows = await requiredConnection().client<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM session s
    JOIN "user" u ON u.id = s.user_id
    WHERE u.username = ${username}
  `;
  return rows[0]?.count ?? -1;
}

async function countUsers(username: string): Promise<number> {
  const rows = await requiredConnection().client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "user" WHERE username = ${username}
  `;
  return rows[0]?.count ?? -1;
}

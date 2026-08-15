import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresDatabase } from '@appbasis/database';
import {
  PostgresPermissionStore,
  capabilityId,
  principalId,
  roleId,
  type RoleAdministrationAuditContext,
} from '@appbasis/permissions';

import { createReferenceRoleAdministration } from '../worker/role-admin';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('DATABASE_URL is required for Reference role-admin actor safety PostgreSQL E2E tests.');
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  'appbasis_reference_role_actor_' + randomUUID().replaceAll('-', '').slice(0, 16);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;

const migrationUrls = [
  new URL('../../../packages/permissions/migrations/0000_appbasis_permissions_foundation.sql', import.meta.url),
  new URL('../../../packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql', import.meta.url),
  new URL('../../../packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql', import.meta.url),
];

const appUse = capabilityId('app:use');
const usersManage = capabilityId('users:manage');
const roleAdmin = roleId('managed:role-admin');
const memberRole = roleId('managed:member');
const actor = principalId('reference-role-admin');
const otherPermissionHolder = principalId('reference-other-holder');

beforeAll(async () => {
  await administrativeConnection.client.unsafe(`CREATE DATABASE ${isolatedDatabaseName}`);
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  const connection = requiredIsolatedConnection();

  for (const migrationUrl of migrationUrls) {
    const migration = await readFile(migrationUrl, 'utf8');
    await connection.client.unsafe(migration);
  }

  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_capability (capability_id)
     VALUES ($1), ($2)`,
    [appUse, usersManage],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role (role_id, display_name, state, kind)
     VALUES
       ($1, 'Role Admin', 'active', 'managed'),
       ($2, 'Member', 'active', 'managed')`,
    [roleAdmin, memberRole],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
     VALUES ($1, $2), ($1, $3)`,
    [roleAdmin, appUse, usersManage],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1), ($2)`,
    [actor, otherPermissionHolder],
  );
  await connection.client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2), ($3, $4)`,
    [actor, roleAdmin, otherPermissionHolder, roleAdmin],
  );
});

afterAll(async () => {
  if (isolatedConnection !== null) {
    await isolatedConnection.client.end();
    isolatedConnection = null;
  }
  if (isolatedDatabaseCreated) {
    await administrativeConnection.client.unsafe(
      `DROP DATABASE ${isolatedDatabaseName} WITH (FORCE)`,
    );
  }
  await administrativeConnection.client.end();
});

describe('Reference role-admin authenticated actor safety', () => {
  it('rolls back a self-demotion even when another permission holder exists', async () => {
    const connection = requiredIsolatedConnection();
    const administration = createReferenceRoleAdministration(connection.client);
    const permissions = new PostgresPermissionStore(connection.client);

    await expect(
      administration.replacePrincipalRoles(
        actor,
        [memberRole],
        audit('Eigene Role-Admin-Berechtigung nicht verlieren'),
        {
          expectedRoleIds: [roleAdmin],
          requiredRemainingCapabilities: [appUse, usersManage],
        },
      ),
    ).rejects.toMatchObject({ code: 'LAST_CAPABILITY_HOLDER' });

    await expect(permissions.findPrincipal(actor)).resolves.toMatchObject({
      roleIds: [roleAdmin],
    });
  });

  it('allows changing another principal while the authenticated actor remains authorized', async () => {
    const connection = requiredIsolatedConnection();
    const administration = createReferenceRoleAdministration(connection.client);
    const permissions = new PostgresPermissionStore(connection.client);

    await expect(
      administration.replacePrincipalRoles(
        otherPermissionHolder,
        [memberRole],
        audit('Anderen Rollenbestand ändern'),
        {
          expectedRoleIds: [roleAdmin],
          requiredRemainingCapabilities: [appUse, usersManage],
        },
      ),
    ).resolves.toEqual([memberRole]);

    await expect(permissions.findPrincipal(actor)).resolves.toMatchObject({
      roleIds: [roleAdmin],
    });
    await expect(permissions.findPrincipal(otherPermissionHolder)).resolves.toMatchObject({
      roleIds: [memberRole],
    });
  });
});

function audit(reason: string): RoleAdministrationAuditContext {
  return { actorPrincipalId: actor, reason };
}

function requiredIsolatedConnection(): ReturnType<typeof createPostgresDatabase> {
  if (isolatedConnection === null) {
    throw new Error('Isolated Reference role-admin actor safety database is not initialized.');
  }
  return isolatedConnection;
}

function databaseUrlForName(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

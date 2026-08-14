import { describe, expect, it } from 'vitest';

import {
  IdentityError,
  type CurrentIdentity,
  type IdentityService,
} from '@appbasis/identity';
import {
  DEMO_CAPABILITIES,
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  InMemoryPermissionStore,
  principalId,
  roleId,
  type CapabilityId,
  type RoleDetails,
  type RoleId,
} from '@appbasis/permissions';
import { InMemoryTaskRepository } from '@appbasis/tasks';
import {
  createReferenceApp,
  type ReferenceRoleAdministration,
} from '../worker/app';

const identityId = 'reference-role-admin';
const sessionCookie = 'better-auth.session_token=role-admin-session';
const managedRole: RoleDetails = {
  roleId: roleId('managed:trainer'),
  displayName: 'Trainer',
  description: 'Darf Trainingsdaten verwalten.',
  state: 'active',
  kind: 'managed',
  assignedPrincipalCount: 2,
  capabilities: [DEMO_CAPABILITIES.appUse],
};

describe('Reference role administration API', () => {
  it('bleibt ohne gebundene Rollenadministration fail-closed', async () => {
    const app = createReferenceApp({
      identity: new StubIdentityService(),
      permissions: adminPermissionStore(),
      tasks: new InMemoryTaskRepository(),
    });

    const response = await app.request('/api/roles', {
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REFERENCE_RUNTIME_NOT_CONFIGURED' },
    });
  });

  it('verweigert Rollenlesezugriffe ohne users:manage deny-by-default', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = createReferenceApp({
      identity: new StubIdentityService(),
      permissions: memberPermissionStore(),
      roleAdministration,
      tasks: new InMemoryTaskRepository(),
    });

    const response = await app.request('/api/roles', {
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(403);
    expect(roleAdministration.listCalls).toBe(0);
  });

  it('listet Rollen und Capabilities nur für berechtigte Administratoren', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredApp(roleAdministration);

    const roles = await app.request('/api/roles', {
      headers: { cookie: sessionCookie },
    });
    expect(roles.status).toBe(200);
    await expect(roles.json()).resolves.toEqual({ roles: [managedRole] });

    const capabilities = await app.request('/api/roles/capabilities', {
      headers: { cookie: sessionCookie },
    });
    expect(capabilities.status).toBe(200);
    await expect(capabilities.json()).resolves.toEqual({
      capabilities: DEMO_KNOWN_CAPABILITIES,
    });
  });

  it('liefert einzelne Rollen und 404 für unbekannte Role-IDs', async () => {
    const app = configuredApp(new StubRoleAdministration());

    const found = await app.request('/api/roles/managed%3Atrainer', {
      headers: { cookie: sessionCookie },
    });
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({ role: managedRole });

    const missing = await app.request('/api/roles/managed%3Amissing', {
      headers: { cookie: sessionCookie },
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'ROLE_NOT_FOUND' },
    });
  });
});

function configuredApp(roleAdministration: ReferenceRoleAdministration) {
  return createReferenceApp({
    identity: new StubIdentityService(),
    permissions: adminPermissionStore(),
    roleAdministration,
    tasks: new InMemoryTaskRepository(),
  });
}

function adminPermissionStore() {
  return permissionStore(DEMO_ROLES.admin);
}

function memberPermissionStore() {
  return permissionStore(DEMO_ROLES.member);
}

function permissionStore(assignedRoleId: RoleId) {
  return new InMemoryPermissionStore({
    knownCapabilities: DEMO_KNOWN_CAPABILITIES,
    roles: DEMO_ROLE_BUNDLES,
    principals: [
      {
        principalId: principalId(identityId),
        roleIds: [assignedRoleId],
        grants: [],
        revokes: [],
      },
    ],
  });
}

class StubRoleAdministration implements ReferenceRoleAdministration {
  listCalls = 0;

  async listRoles(): Promise<readonly RoleDetails[]> {
    this.listCalls += 1;
    return [managedRole];
  }

  async findRole(requestedRoleId: RoleId): Promise<RoleDetails | null> {
    return requestedRoleId === managedRole.roleId ? managedRole : null;
  }

  async listKnownCapabilities(): Promise<readonly CapabilityId[]> {
    return DEMO_KNOWN_CAPABILITIES;
  }
}

class StubIdentityService implements Pick<
  IdentityService,
  'signInWithUsername' | 'getCurrentIdentity' | 'changeRequiredPassword'
> {
  async signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<CurrentIdentity> {
    if (input.username !== 'role.admin' || input.password !== 'secret') {
      throw new IdentityError('AUTHENTICATION_FAILED', 'invalid');
    }
    return this.current(sessionCookie);
  }

  async getCurrentIdentity(sessionToken: string): Promise<CurrentIdentity | null> {
    return sessionToken === sessionCookie ? this.current(sessionToken) : null;
  }

  async changeRequiredPassword(): Promise<CurrentIdentity> {
    throw new IdentityError('PASSWORD_CHANGE_NOT_REQUIRED', 'not required');
  }

  private current(sessionToken: string): CurrentIdentity {
    const now = new Date('2026-08-14T00:00:00.000Z');
    return {
      identity: {
        identityId,
        username: 'role.admin',
        displayName: 'Role Admin',
        contactEmail: null,
        personId: null,
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
        passwordChangedAt: now,
        disabledAt: null,
        accountStatus: 'active',
      },
      sessionToken,
      access: 'full',
    };
  }
}

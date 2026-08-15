import { afterEach, describe, expect, it, vi } from 'vitest';

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
  type RoleDetails,
} from '@appbasis/permissions';
import { referenceApi } from '../src/api';
import {
  createReferenceRoleAdminApp,
  type ReferenceRoleAdminDependencies,
} from '../worker/role-admin-app';
import {
  forwardRoleAdminRequest,
  type ReferenceRoleAdminServiceBinding,
} from '../worker/index';

const identityId = 'reference-role-detail-admin';
const sessionCookie = 'better-auth.session_token=role-detail-session';
const expectedOrigin = 'https://preview.example.test';
const capabilitiesRole: RoleDetails = {
  roleId: roleId('capabilities'),
  displayName: 'Capabilities Rolle',
  description: 'Backend-gültige Role-ID mit Katalog-Namenskollision.',
  state: 'active',
  kind: 'managed',
  assignedPrincipalCount: 0,
  capabilities: [DEMO_CAPABILITIES.appUse],
};
const principalAssignmentsRole: RoleDetails = {
  ...capabilitiesRole,
  roleId: roleId('principal-assignments'),
  displayName: 'Principal Assignments Rolle',
  description: 'Backend-gültige Role-ID mit Principal-Subresource-Namenskollision.',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reference collision-free role detail route', () => {
  it('keeps fixed admin subresources and same-named roles independently readable', async () => {
    const app = createReferenceRoleAdminApp({
      identity: new StubIdentityService(),
      principalDirectory: {
        async listAssignments() {
          return [];
        },
        async find() {
          return null;
        },
      },
      permissions: adminPermissionStore(),
      roleAdministration: roleAdministration(),
    });

    const catalog = await app.request('/api/roles/capabilities', {
      headers: { cookie: sessionCookie },
    });
    expect(catalog.status).toBe(200);
    await expect(catalog.json()).resolves.toEqual({
      capabilities: DEMO_KNOWN_CAPABILITIES,
    });

    const capabilitiesDetail = await app.request('/api/roles/capabilities/details', {
      headers: { cookie: sessionCookie },
    });
    expect(capabilitiesDetail.status).toBe(200);
    await expect(capabilitiesDetail.json()).resolves.toEqual({ role: capabilitiesRole });

    const principalAssignmentsDetail = await app.request(
      '/api/roles/principal-assignments/details',
      { headers: { cookie: sessionCookie } },
    );
    expect(principalAssignmentsDetail.status).toBe(200);
    await expect(principalAssignmentsDetail.json()).resolves.toEqual({
      role: principalAssignmentsRole,
    });

    const unauthorized = await app.request('/api/roles/capabilities/details');
    expect(unauthorized.status).toBe(401);
  });

  it('forwards the public collision-free detail path only through the existing service binding prefix', async () => {
    const forwardedUrls: string[] = [];
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch(request) {
        forwardedUrls.push(request.url);
        return new Response(JSON.stringify({ role: capabilitiesRole }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    };

    const response = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/admin/roles/capabilities/details`),
      binding,
      expectedOrigin,
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toEqual([
      `${expectedOrigin}/api/roles/capabilities/details`,
    ]);
  });

  it('makes the browser client use the collision-free detail route for every role ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role: capabilitiesRole }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(referenceApi.getRole('capabilities')).resolves.toEqual(capabilitiesRole);

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/admin/roles/capabilities/details');
    expect(init.credentials).toBe('same-origin');
  });
});

function adminPermissionStore() {
  return new InMemoryPermissionStore({
    knownCapabilities: DEMO_KNOWN_CAPABILITIES,
    roles: DEMO_ROLE_BUNDLES,
    principals: [
      {
        principalId: principalId(identityId),
        roleIds: [DEMO_ROLES.admin],
        grants: [],
        revokes: [],
      },
    ],
  });
}

function roleAdministration(): ReferenceRoleAdminDependencies['roleAdministration'] {
  return {
    async listRoles() {
      return [capabilitiesRole, principalAssignmentsRole];
    },
    async findRole(requestedRoleId) {
      if (requestedRoleId === capabilitiesRole.roleId) return capabilitiesRole;
      if (requestedRoleId === principalAssignmentsRole.roleId) return principalAssignmentsRole;
      return null;
    },
    async listKnownCapabilities() {
      return DEMO_KNOWN_CAPABILITIES;
    },
    async createRole() {
      throw new Error('not expected');
    },
    async updateRole() {
      throw new Error('not expected');
    },
    async setRoleState() {
      throw new Error('not expected');
    },
    async deleteRole() {
      throw new Error('not expected');
    },
    async replacePrincipalRoles() {
      throw new Error('not expected');
    },
  };
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
    const now = new Date('2026-08-15T00:00:00.000Z');
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

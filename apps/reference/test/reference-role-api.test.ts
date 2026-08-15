import { readFileSync } from 'node:fs';

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
  RoleAdministrationError,
  type CapabilityId,
  type CreateManagedRoleInput,
  type PrincipalId,
  type RoleAdministrationAuditContext,
  type RoleDetails,
  type RoleId,
  type RoleState,
  type UpdateManagedRoleInput,
} from '@appbasis/permissions';
import { InMemoryTaskRepository } from '@appbasis/tasks';
import { createReferenceApp } from '../worker/app';
import {
  createReferenceRoleAdminApp,
  type ReferenceRoleAdminDependencies,
  type ReferenceRolePrincipalDirectory,
  type ReferenceRolePrincipalIdentity,
} from '../worker/role-admin-app';

const identityId = 'reference-role-admin';
const targetIdentityId = 'reference-user';
const sessionCookie = 'better-auth.session_token=role-admin-session';
const normalWorkerSource = readFileSync(
  new URL('../worker/index.ts', import.meta.url),
  'utf8',
);
const managedRole: RoleDetails = {
  roleId: roleId('managed:trainer'),
  displayName: 'Trainer',
  description: 'Darf Trainingsdaten verwalten.',
  state: 'active',
  kind: 'managed',
  assignedPrincipalCount: 2,
  capabilities: [DEMO_CAPABILITIES.appUse],
};
const adminIdentity: ReferenceRolePrincipalIdentity = {
  identityId,
  username: 'role.admin',
  displayName: 'Role Admin',
};
const targetIdentity: ReferenceRolePrincipalIdentity = {
  identityId: targetIdentityId,
  username: 'demo.user',
  displayName: 'Demo User',
};

describe('Reference role administration API', () => {
  it('bleibt vollständig außerhalb des normalen Reference-App-Workers', async () => {
    const normalApp = createReferenceApp({
      identity: new StubIdentityService(),
      permissions: adminPermissionStore(),
      tasks: new InMemoryTaskRepository(),
    });

    const response = await normalApp.request('/api/roles', {
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(404);
    expect(normalWorkerSource).not.toContain('PostgresRoleAdministration');
    expect(normalWorkerSource).not.toContain('roleAdministration');
  });

  it('bleibt ohne gebundene Admin-Runtime fail-closed', async () => {
    const app = createReferenceRoleAdminApp();

    const response = await app.request('/api/roles', {
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED' },
    });
  });

  it('verweigert Rollenlese- und Schreibzugriffe ohne users:manage deny-by-default', async () => {
    const roleAdministration = new StubRoleAdministration();
    const principalDirectory = new StubPrincipalDirectory();
    const app = createReferenceRoleAdminApp({
      identity: new StubIdentityService(),
      principalDirectory,
      permissions: memberPermissionStore(),
      roleAdministration,
    });

    const readResponse = await app.request('/api/roles', {
      headers: { cookie: sessionCookie },
    });
    expect(readResponse.status).toBe(403);

    const principalReadResponse = await app.request('/api/roles/principal-assignments', {
      headers: { cookie: sessionCookie },
    });
    expect(principalReadResponse.status).toBe(403);

    const writeResponse = await app.request('/api/roles', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        roleId: 'managed:editor',
        displayName: 'Editor',
        capabilities: [],
      }),
    });
    expect(writeResponse.status).toBe(403);
    expect(roleAdministration.listCalls).toBe(0);
    expect(roleAdministration.createCalls).toHaveLength(0);
    expect(roleAdministration.replaceCalls).toHaveLength(0);
    expect(principalDirectory.listCalls).toBe(0);
  });

  it('listet Rollen und Capabilities nur für berechtigte Administratoren', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredAdminApp(roleAdministration);

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
    const app = configuredAdminApp(new StubRoleAdministration());

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

  it('listet ausschließlich AppBasis-Identitäten mit vorhandenem Permission-Principal', async () => {
    const roleAdministration = new StubRoleAdministration();
    const directory = new StubPrincipalDirectory([
      adminIdentity,
      targetIdentity,
      { identityId: 'identity-without-principal', username: 'orphan', displayName: 'Orphan' },
    ]);
    const app = configuredAdminApp(roleAdministration, directory);

    const response = await app.request('/api/roles/principal-assignments', {
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      principals: [
        {
          ...adminIdentity,
          principalId: identityId,
          roleIds: [DEMO_ROLES.admin],
        },
        {
          ...targetIdentity,
          principalId: targetIdentityId,
          roleIds: [managedRole.roleId],
        },
      ],
    });
    expect(directory.listCalls).toBe(1);
  });

  it('ersetzt Principal-Rollen mit authentisiertem Audit Actor über denselben Admin-Vertrag', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredAdminApp(roleAdministration);

    const response = await app.request(
      `/api/roles/principal-assignments/${encodeURIComponent(targetIdentityId)}`,
      {
        method: 'PUT',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ roleIds: [DEMO_ROLES.admin, managedRole.roleId] }),
      },
    );

    expect(response.status).toBe(200);
    expect(roleAdministration.replaceCalls).toEqual([
      {
        principalId: targetIdentityId,
        roleIds: [DEMO_ROLES.admin, managedRole.roleId],
        audit: {
          actorPrincipalId: identityId,
          reason: 'Reference Admin API: Benutzerrollen ersetzen',
        },
      },
    ]);
    await expect(response.json()).resolves.toEqual({
      principal: {
        ...targetIdentity,
        principalId: targetIdentityId,
        roleIds: [DEMO_ROLES.admin, managedRole.roleId],
      },
    });
  });

  it('weist unbekannte Principals und ungültige Rollenzuweisungs-Bodies vor der Mutation zurück', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredAdminApp(roleAdministration);

    const missing = await app.request('/api/roles/principal-assignments/missing', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ roleIds: [] }),
    });
    expect(missing.status).toBe(404);

    const invalid = await app.request(
      `/api/roles/principal-assignments/${encodeURIComponent(targetIdentityId)}`,
      {
        method: 'PUT',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ roleIds: 'managed:trainer' }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(roleAdministration.replaceCalls).toHaveLength(0);
  });

  it('legt verwaltete Rollen mit dem authentisierten Akteur auditierbar an', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredAdminApp(roleAdministration);

    const response = await app.request('/api/roles', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        roleId: 'managed:editor',
        displayName: 'Editor',
        description: 'Darf Inhalte bearbeiten.',
        capabilities: [DEMO_CAPABILITIES.appUse],
      }),
    });

    expect(response.status).toBe(201);
    expect(roleAdministration.createCalls).toHaveLength(1);
    expect(roleAdministration.createCalls[0]).toEqual({
      input: {
        roleId: 'managed:editor',
        displayName: 'Editor',
        description: 'Darf Inhalte bearbeiten.',
        capabilities: [DEMO_CAPABILITIES.appUse],
      },
      audit: {
        actorPrincipalId: identityId,
        reason: 'Reference Admin API: Rolle anlegen',
      },
    });
  });

  it('aktualisiert, deaktiviert und löscht Rollen ausschließlich mit Audit-Kontext', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredAdminApp(roleAdministration);

    const update = await app.request('/api/roles/managed%3Atrainer', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Trainer Plus',
        description: null,
        capabilities: [],
      }),
    });
    expect(update.status).toBe(200);

    const state = await app.request('/api/roles/managed%3Atrainer/state', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ state: 'inactive' }),
    });
    expect(state.status).toBe(200);

    const remove = await app.request('/api/roles/managed%3Atrainer', {
      method: 'DELETE',
      headers: { cookie: sessionCookie },
    });
    expect(remove.status).toBe(204);

    expect(roleAdministration.updateCalls).toEqual([
      {
        roleId: 'managed:trainer',
        input: {
          displayName: 'Trainer Plus',
          description: null,
          capabilities: [],
        },
        audit: {
          actorPrincipalId: identityId,
          reason: 'Reference Admin API: Rolle aktualisieren',
        },
      },
    ]);
    expect(roleAdministration.stateCalls).toEqual([
      {
        roleId: 'managed:trainer',
        state: 'inactive',
        audit: {
          actorPrincipalId: identityId,
          reason: 'Reference Admin API: Rolle deaktivieren',
        },
      },
    ]);
    expect(roleAdministration.deleteCalls).toEqual([
      {
        roleId: 'managed:trainer',
        audit: {
          actorPrincipalId: identityId,
          reason: 'Reference Admin API: Rolle löschen',
        },
      },
    ]);
  });

  it('weist ungültige Bodies vor dem Provider zurück und sanitisiert Provider-Konflikte', async () => {
    const roleAdministration = new StubRoleAdministration();
    const app = configuredAdminApp(roleAdministration);

    const invalid = await app.request('/api/roles', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        roleId: 'managed:editor',
        displayName: 'Editor',
        capabilities: 'app:use',
      }),
    });
    expect(invalid.status).toBe(400);
    expect(roleAdministration.createCalls).toHaveLength(0);

    roleAdministration.deleteError = new RoleAdministrationError(
      'ROLE_PROTECTED',
      'internal provider detail that must not escape',
    );
    const conflict = await app.request('/api/roles/system%3Aadmin', {
      method: 'DELETE',
      headers: { cookie: sessionCookie },
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      error: {
        code: 'ROLE_PROTECTED',
        message: 'The role cannot be changed in its current state.',
      },
    });
  });
});

function configuredAdminApp(
  roleAdministration: ReferenceRoleAdminDependencies['roleAdministration'],
  principalDirectory: ReferenceRolePrincipalDirectory = new StubPrincipalDirectory(),
) {
  return createReferenceRoleAdminApp({
    identity: new StubIdentityService(),
    principalDirectory,
    permissions: adminPermissionStore(),
    roleAdministration,
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
    roles: [...DEMO_ROLE_BUNDLES, managedRole],
    principals: [
      {
        principalId: principalId(identityId),
        roleIds: [assignedRoleId],
        grants: [],
        revokes: [],
      },
      {
        principalId: principalId(targetIdentityId),
        roleIds: [managedRole.roleId],
        grants: [],
        revokes: [],
      },
    ],
  });
}

class StubPrincipalDirectory implements ReferenceRolePrincipalDirectory {
  listCalls = 0;
  findCalls = 0;

  constructor(
    private readonly identities: readonly ReferenceRolePrincipalIdentity[] = [
      adminIdentity,
      targetIdentity,
    ],
  ) {}

  async list(): Promise<readonly ReferenceRolePrincipalIdentity[]> {
    this.listCalls += 1;
    return this.identities;
  }

  async find(requestedIdentityId: string): Promise<ReferenceRolePrincipalIdentity | null> {
    this.findCalls += 1;
    return this.identities.find((identity) => identity.identityId === requestedIdentityId) ?? null;
  }
}

class StubRoleAdministration {
  listCalls = 0;
  readonly createCalls: Array<{
    input: CreateManagedRoleInput;
    audit: RoleAdministrationAuditContext;
  }> = [];
  readonly updateCalls: Array<{
    roleId: RoleId;
    input: UpdateManagedRoleInput;
    audit: RoleAdministrationAuditContext;
  }> = [];
  readonly stateCalls: Array<{
    roleId: RoleId;
    state: RoleState;
    audit: RoleAdministrationAuditContext;
  }> = [];
  readonly deleteCalls: Array<{
    roleId: RoleId;
    audit: RoleAdministrationAuditContext;
  }> = [];
  readonly replaceCalls: Array<{
    principalId: PrincipalId;
    roleIds: readonly RoleId[];
    audit: RoleAdministrationAuditContext;
  }> = [];
  deleteError: Error | null = null;

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

  async createRole(
    input: CreateManagedRoleInput,
    audit: RoleAdministrationAuditContext,
  ): Promise<RoleDetails> {
    this.createCalls.push({ input, audit });
    return {
      roleId: input.roleId,
      displayName: input.displayName,
      description: input.description ?? null,
      state: 'active',
      kind: 'managed',
      assignedPrincipalCount: 0,
      capabilities: input.capabilities,
    };
  }

  async updateRole(
    requestedRoleId: RoleId,
    input: UpdateManagedRoleInput,
    audit: RoleAdministrationAuditContext,
  ): Promise<RoleDetails> {
    this.updateCalls.push({ roleId: requestedRoleId, input, audit });
    return {
      ...managedRole,
      roleId: requestedRoleId,
      displayName: input.displayName,
      description: input.description ?? null,
      capabilities: input.capabilities,
    };
  }

  async setRoleState(
    requestedRoleId: RoleId,
    state: RoleState,
    audit: RoleAdministrationAuditContext,
  ): Promise<RoleDetails> {
    this.stateCalls.push({ roleId: requestedRoleId, state, audit });
    return { ...managedRole, roleId: requestedRoleId, state };
  }

  async deleteRole(
    requestedRoleId: RoleId,
    audit: RoleAdministrationAuditContext,
  ): Promise<void> {
    this.deleteCalls.push({ roleId: requestedRoleId, audit });
    if (this.deleteError !== null) throw this.deleteError;
  }

  async replacePrincipalRoles(
    requestedPrincipalId: PrincipalId,
    roleIds: readonly RoleId[],
    audit: RoleAdministrationAuditContext,
  ): Promise<readonly RoleId[]> {
    this.replaceCalls.push({ principalId: requestedPrincipalId, roleIds, audit });
    return roleIds;
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

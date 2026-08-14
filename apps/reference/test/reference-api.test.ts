import { describe, expect, it } from 'vitest';

import { InMemoryTaskRepository } from '@appbasis/tasks';
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
  type PrincipalPermissions,
} from '@appbasis/permissions';
import { createReferenceApp } from '../worker/app';

const identityId = 'reference-user-1';
const beforeCookie = 'better-auth.session_token=session-before';
const afterCookie = 'better-auth.session_token=session-after';
const idempotencyKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Reference Identity/Permissions/Tasks API', () => {
  it('lässt den Default-Worker ohne konfigurierte Laufzeit fail-closed', async () => {
    const response = await createReferenceApp().request('/api/auth/session');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REFERENCE_RUNTIME_NOT_CONFIGURED' },
    });
  });

  it('meldet per Username an, setzt nur ein HttpOnly-Cookie und gibt keinen Session-Token im JSON aus', async () => {
    const identity = new StubIdentityService(false);
    const app = configuredApp(identity);

    const response = await app.request('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'demo.user', password: 'secret' }),
    });

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(beforeCookie);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
    const body = await response.json();
    expect(body).toMatchObject({
      identity: { identityId, username: 'demo.user', mustChangePassword: false },
      access: 'full',
    });
    expect(JSON.stringify(body)).not.toContain('session-before');
    expect(JSON.stringify(body)).not.toContain('sessionToken');
  });

  it('liefert 401 für ungültige Anmeldung oder fehlende Session', async () => {
    const app = configuredApp(new StubIdentityService(false));

    const login = await app.request('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'demo.user', password: 'wrong' }),
    });
    expect(login.status).toBe(401);

    const session = await app.request('/api/auth/session');
    expect(session.status).toBe(401);
  });

  it('sperrt Tasks bis zum Pflicht-Passwortwechsel und rotiert danach die Session', async () => {
    const identity = new StubIdentityService(true);
    const app = configuredApp(identity);

    const before = await app.request('/api/tasks', {
      headers: { cookie: beforeCookie },
    });
    expect(before.status).toBe(403);
    await expect(before.json()).resolves.toMatchObject({
      error: { code: 'PASSWORD_CHANGE_REQUIRED' },
    });

    const changed = await app.request('/api/auth/change-required-password', {
      method: 'POST',
      headers: {
        cookie: beforeCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: 'temporary',
        newPassword: 'replacement',
        idempotencyKey,
      }),
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('set-cookie')).toContain(afterCookie);
    const changedBody = await changed.json();
    expect(changedBody).toMatchObject({
      identity: { mustChangePassword: false },
      access: 'full',
    });
    expect(JSON.stringify(changedBody)).not.toContain('session-after');

    const oldSession = await app.request('/api/tasks', {
      headers: { cookie: beforeCookie },
    });
    expect(oldSession.status).toBe(401);

    const after = await app.request('/api/tasks', {
      headers: { cookie: afterCookie },
    });
    expect(after.status).toBe(200);
  });

  it('weist einen nicht-UUID-v4 Idempotency-Key bereits am HTTP-Rand als 400 zurück', async () => {
    const identity = new StubIdentityService(true);
    const app = configuredApp(identity);

    const response = await app.request('/api/auth/change-required-password', {
      method: 'POST',
      headers: {
        cookie: beforeCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: 'temporary',
        newPassword: 'replacement',
        idempotencyKey: 'not-a-uuid',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });
    expect(identity.passwordChangeCalls).toBe(0);
  });

  it('verweigert Tasks deny-by-default, wenn der Identity-Principal keine Berechtigungen besitzt', async () => {
    const identity = new StubIdentityService(false);
    const permissions = new InMemoryPermissionStore({
      knownCapabilities: DEMO_KNOWN_CAPABILITIES,
      roles: DEMO_ROLE_BUNDLES,
    });
    const app = createReferenceApp({
      identity,
      permissions,
      tasks: new InMemoryTaskRepository(),
    });

    const response = await app.request('/api/tasks', {
      headers: { cookie: beforeCookie },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PERMISSION_DENIED' },
    });
  });

  it('beachtet einen expliziten Revoke auch bei vorhandener Member-Rolle', async () => {
    const identity = new StubIdentityService(false);
    const permissions = permissionStore({ revokes: [DEMO_CAPABILITIES.tasksManage] });
    const app = createReferenceApp({
      identity,
      permissions,
      tasks: new InMemoryTaskRepository(),
    });

    const response = await app.request('/api/tasks', {
      headers: { cookie: beforeCookie },
    });

    expect(response.status).toBe(403);
  });

  it('listet, erstellt und schaltet Tasks ausschließlich hinter Identity und Permission Checks', async () => {
    const identity = new StubIdentityService(false);
    const tasks = new InMemoryTaskRepository([
      {
        id: 'seed',
        title: 'Bestehend',
        description: '',
        status: 'open',
      },
    ]);
    const app = createReferenceApp({
      identity,
      permissions: permissionStore(),
      tasks,
      secureCookies: false,
    });

    const list = await app.request('/api/tasks', {
      headers: { cookie: beforeCookie },
    });
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      tasks: [{ id: 'seed', status: 'open' }],
    });

    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: {
        cookie: beforeCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: '  Neue Aufgabe  ', description: ' Notiz ' }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      task: { id: string; title: string; description: string; status: string };
    };
    expect(createdBody.task).toMatchObject({
      title: 'Neue Aufgabe',
      description: 'Notiz',
      status: 'open',
    });

    const toggled = await app.request(`/api/tasks/${createdBody.task.id}/toggle`, {
      method: 'POST',
      headers: { cookie: beforeCookie },
    });
    expect(toggled.status).toBe(200);
    await expect(toggled.json()).resolves.toMatchObject({
      task: { id: createdBody.task.id, status: 'completed' },
    });

    const missing = await app.request('/api/tasks/not-there/toggle', {
      method: 'POST',
      headers: { cookie: beforeCookie },
    });
    expect(missing.status).toBe(404);
  });

  it('gibt ungültige Task-Eingaben als 400 zurück', async () => {
    const app = configuredApp(new StubIdentityService(false));
    const response = await app.request('/api/tasks', {
      method: 'POST',
      headers: {
        cookie: beforeCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_TASK' },
    });
  });
});

function configuredApp(identity: StubIdentityService) {
  return createReferenceApp({
    identity,
    permissions: permissionStore(),
    tasks: new InMemoryTaskRepository(),
  });
}

function permissionStore(overrides: Partial<PrincipalPermissions> = {}) {
  return new InMemoryPermissionStore({
    knownCapabilities: DEMO_KNOWN_CAPABILITIES,
    roles: DEMO_ROLE_BUNDLES,
    principals: [
      {
        principalId: principalId(identityId),
        roleIds: [DEMO_ROLES.member],
        grants: [],
        revokes: [],
        ...overrides,
      },
    ],
  });
}

class StubIdentityService implements Pick<
  IdentityService,
  'signInWithUsername' | 'getCurrentIdentity' | 'changeRequiredPassword'
> {
  passwordChangeCalls = 0;
  private requiresPasswordChange: boolean;
  private activeCookie = beforeCookie;

  constructor(requiresPasswordChange: boolean) {
    this.requiresPasswordChange = requiresPasswordChange;
  }

  async signInWithUsername(input: { username: string; password: string }): Promise<CurrentIdentity> {
    if (input.username !== 'demo.user' || input.password !== 'secret') {
      throw new IdentityError('AUTHENTICATION_FAILED', 'invalid');
    }
    return this.current(this.activeCookie);
  }

  async getCurrentIdentity(sessionToken: string): Promise<CurrentIdentity | null> {
    if (sessionToken !== this.activeCookie) return null;
    return this.current(sessionToken);
  }

  async changeRequiredPassword(input: {
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    idempotencyKey: string;
  }): Promise<CurrentIdentity> {
    this.passwordChangeCalls += 1;
    if (input.sessionToken !== this.activeCookie) {
      throw new IdentityError('SESSION_INVALID', 'invalid');
    }
    if (!this.requiresPasswordChange) {
      throw new IdentityError('PASSWORD_CHANGE_NOT_REQUIRED', 'not required');
    }
    if (
      input.currentPassword !== 'temporary' ||
      input.newPassword !== 'replacement' ||
      input.idempotencyKey !== idempotencyKey
    ) {
      throw new IdentityError('PASSWORD_CHANGE_FAILED', 'failed');
    }
    this.requiresPasswordChange = false;
    this.activeCookie = afterCookie;
    return this.current(afterCookie);
  }

  private current(sessionToken: string): CurrentIdentity {
    const now = new Date('2026-08-13T00:00:00.000Z');
    return {
      identity: {
        identityId,
        username: 'demo.user',
        displayName: 'Demo User',
        contactEmail: null,
        personId: null,
        mustChangePassword: this.requiresPasswordChange,
        createdAt: now,
        updatedAt: now,
        passwordChangedAt: this.requiresPasswordChange ? null : now,
        disabledAt: null,
        accountStatus: 'active',
      },
      sessionToken,
      access: this.requiresPasswordChange ? 'password-change-required' : 'full',
    };
  }
}

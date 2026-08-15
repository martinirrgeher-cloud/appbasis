import { afterEach, describe, expect, it, vi } from 'vitest';

import { capabilityId } from '@appbasis/permissions';
import { ReferenceApiError, referenceApi } from '../src/api';

const sessionPayload = {
  identity: {
    identityId: 'identity-1',
    username: 'demo.user',
    displayName: 'Demo User',
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    accountStatus: 'active' as const,
  },
  access: 'full' as const,
};

const managedRole = {
  roleId: 'managed:trainer',
  displayName: 'Trainer',
  description: 'Training verwalten',
  state: 'active' as const,
  kind: 'managed' as const,
  assignedPrincipalCount: 1,
  capabilities: [capabilityId('app:use')],
};

const managedRoleCreateInput = {
  roleId: 'managed:trainer',
  displayName: 'Trainer',
  description: 'Training verwalten',
  capabilities: [capabilityId('app:use')],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('referenceApi', () => {
  it('restores the session with same-origin cookie credentials without exposing a token model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionPayload));
    vi.stubGlobal('fetch', fetchMock);
    await expect(referenceApi.getSession()).resolves.toEqual(sessionPayload);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/auth/session');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.stringify(sessionPayload)).not.toContain('sessionToken');
  });

  it('posts login credentials only to the sign-in endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionPayload));
    vi.stubGlobal('fetch', fetchMock);
    await referenceApi.signIn('demo.user', 'secret');
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/auth/sign-in');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ username: 'demo.user', password: 'secret' });
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('sends the password-change idempotency key without inventing a session token', async () => {
    const changed = { ...sessionPayload, identity: { ...sessionPayload.identity, mustChangePassword: false } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(changed));
    vi.stubGlobal('fetch', fetchMock);
    await referenceApi.changeRequiredPassword({
      currentPassword: 'temporary',
      newPassword: 'replacement',
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/auth/change-required-password');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.idempotencyKey).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(body).not.toHaveProperty('sessionToken');
  });

  it('maps structured HTTP failures to ReferenceApiError for explicit UI transitions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(
      { error: { code: 'PERMISSION_DENIED', message: 'denied' } },
      { status: 403 },
    )));
    const error = await referenceApi.listTasks().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReferenceApiError);
    expect(error).toMatchObject({ status: 403, code: 'PERMISSION_DENIED' });
  });

  it('maps network failures to a retryable status-zero error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const error = await referenceApi.getSession().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReferenceApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('uses server-returned task values for create and toggle operations', async () => {
    const createdTask = { id: '7', title: 'Neue Aufgabe', description: 'Notiz', status: 'open' as const };
    const toggledTask = { ...createdTask, status: 'completed' as const };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task: createdTask }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ task: toggledTask }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(referenceApi.createTask({ title: 'Neue Aufgabe', description: 'Notiz' })).resolves.toEqual(createdTask);
    await expect(referenceApi.toggleTask('7')).resolves.toEqual(toggledTask);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/tasks/7/toggle');
  });

  it('reads persistent role details and capabilities through the admin gateway', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ roles: [managedRole] }))
      .mockResolvedValueOnce(jsonResponse({ role: managedRole }))
      .mockResolvedValueOnce(jsonResponse({ capabilities: ['app:use', 'users:manage'] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(referenceApi.listRoles()).resolves.toEqual([managedRole]);
    await expect(referenceApi.getRole('managed:trainer')).resolves.toEqual(managedRole);
    await expect(referenceApi.listRoleCapabilities()).resolves.toEqual(['app:use', 'users:manage']);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/admin/roles',
      '/api/admin/roles/managed%3Atrainer/details',
      '/api/admin/roles/capabilities',
    ]);
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(init.credentials).toBe('same-origin');
    }
  });

  it('routes managed role create, update and state writes through the existing gateway contract', async () => {
    const updatedRole = { ...managedRole, displayName: 'Trainer Plus' };
    const inactiveRole = { ...updatedRole, state: 'inactive' as const };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ role: managedRole }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ role: updatedRole }))
      .mockResolvedValueOnce(jsonResponse({ role: inactiveRole }));
    vi.stubGlobal('fetch', fetchMock);

    await referenceApi.createRole(managedRoleCreateInput);
    await referenceApi.updateRole('managed:trainer', {
      displayName: 'Trainer Plus',
      description: null,
      capabilities: [],
    });
    await referenceApi.setRoleState('managed:trainer', 'inactive');

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([path]) => path)).toEqual([
      '/api/admin/roles',
      '/api/admin/roles/managed%3Atrainer',
      '/api/admin/roles/managed%3Atrainer/state',
    ]);
    expect(calls.map(([, init]) => init.method)).toEqual(['POST', 'PUT', 'PUT']);
    expect(JSON.parse(String(calls[0]?.[1].body))).toMatchObject({ roleId: 'managed:trainer' });
    expect(JSON.parse(String(calls[2]?.[1].body))).toEqual({ state: 'inactive' });
    for (const [, init] of calls) {
      expect(new Headers(init.headers).get('content-type')).toBe('application/json');
      expect(init.credentials).toBe('same-origin');
    }
  });

  it('reconciles an ambiguous role create only when the authoritative role matches the submitted data', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(jsonResponse({ role: managedRole }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(referenceApi.createRole(managedRoleCreateInput)).resolves.toEqual(managedRole);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/admin/roles',
      '/api/admin/roles/managed%3Atrainer/details',
    ]);
  });

  it('fails closed when ambiguous role-create reconciliation does not exactly match the request', async () => {
    const mismatchedRole = { ...managedRole, displayName: 'Andere Rolle' };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(jsonResponse({ role: mismatchedRole }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await referenceApi.createRole(managedRoleCreateInput).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReferenceApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

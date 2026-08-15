import { afterEach, describe, expect, it, vi } from 'vitest';

import { referenceApi } from '../src/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reference role administration browser client', () => {
  it('uses the dedicated privileged role administration HTTP contract', async () => {
    const role = {
      roleId: 'training:trainer',
      displayName: 'Trainer',
      description: 'Trainingsverwaltung',
      state: 'active' as const,
      kind: 'managed' as const,
      assignedPrincipalCount: 2,
      capabilities: ['app:use', 'users:manage'],
    };
    const updatedRole = { ...role, displayName: 'Cheftrainer' };
    const inactiveRole = { ...updatedRole, state: 'inactive' as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ roles: [role] }))
      .mockResolvedValueOnce(jsonResponse({ role }))
      .mockResolvedValueOnce(jsonResponse({ capabilities: ['app:use', 'users:manage'] }))
      .mockResolvedValueOnce(jsonResponse({ role }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ role: updatedRole }))
      .mockResolvedValueOnce(jsonResponse({ role: inactiveRole }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(referenceApi.listRoles()).resolves.toEqual([role]);
    await expect(referenceApi.getRole('training:trainer')).resolves.toEqual(role);
    await expect(referenceApi.listRoleCapabilities()).resolves.toEqual([
      'app:use',
      'users:manage',
    ]);
    await expect(
      referenceApi.createRole({
        roleId: 'training:trainer',
        displayName: 'Trainer',
        description: 'Trainingsverwaltung',
        capabilities: ['app:use', 'users:manage'],
      }),
    ).resolves.toEqual(role);
    await expect(
      referenceApi.updateRole('training:trainer', {
        displayName: 'Cheftrainer',
        description: 'Trainingsverwaltung',
        capabilities: ['app:use', 'users:manage'],
      }),
    ).resolves.toEqual(updatedRole);
    await expect(referenceApi.setRoleState('training:trainer', 'inactive')).resolves.toEqual(
      inactiveRole,
    );
    await expect(referenceApi.deleteRole('training:trainer')).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/roles',
      '/api/roles/training%3Atrainer',
      '/api/roles/capabilities',
      '/api/roles',
      '/api/roles/training%3Atrainer',
      '/api/roles/training%3Atrainer/state',
      '/api/roles/training%3Atrainer',
    ]);
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[6]?.[1]).toMatchObject({ method: 'DELETE' });

    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(init.credentials).toBe('same-origin');
      if (init.body !== undefined) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty('actorPrincipalId');
      }
    }
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

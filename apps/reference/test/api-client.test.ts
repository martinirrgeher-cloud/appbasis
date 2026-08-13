import { afterEach, describe, expect, it, vi } from 'vitest';

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
    const changed = {
      ...sessionPayload,
      identity: { ...sessionPayload.identity, mustChangePassword: false },
    };
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'PERMISSION_DENIED', message: 'denied' } },
          { status: 403 },
        ),
      ),
    );

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
    const createdTask = {
      id: '7',
      title: 'Neue Aufgabe',
      description: 'Notiz',
      status: 'open' as const,
    };
    const toggledTask = { ...createdTask, status: 'completed' as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task: createdTask }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ task: toggledTask }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      referenceApi.createTask({ title: 'Neue Aufgabe', description: 'Notiz' }),
    ).resolves.toEqual(createdTask);
    await expect(referenceApi.toggleTask('7')).resolves.toEqual(toggledTask);

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/tasks/7/toggle');
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

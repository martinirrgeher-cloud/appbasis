import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  mountIdentityHttpRoutes,
  type IdentityHttpService,
} from '../src';

const currentIdentity = {
  identity: {
    identityId: 'identity-1',
    username: 'demo.user',
    displayName: 'Demo User',
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    passwordChangedAt: new Date('2026-01-01T00:00:00Z'),
    disabledAt: null,
    accountStatus: 'active' as const,
  },
  sessionToken: 'better-auth.session_token=session-value',
  access: 'full' as const,
};

function identityService(): IdentityHttpService {
  return {
    signInWithUsername: vi.fn(async () => currentIdentity),
    getCurrentIdentity: vi.fn(async () => currentIdentity),
    changeRequiredPassword: vi.fn(async () => currentIdentity),
  };
}

describe('identity HTTP runtime', () => {
  it('mounts the shared username sign-in contract and session cookie', async () => {
    const app = new Hono();
    const identity = identityService();
    mountIdentityHttpRoutes(app, { identity, secureCookies: true });

    const response = await app.request('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'demo.user', password: 'secret-value' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBe(
      'better-auth.session_token=session-value; Path=/; HttpOnly; SameSite=Lax; Secure',
    );
    expect(await response.json()).toEqual({
      identity: {
        identityId: 'identity-1',
        username: 'demo.user',
        displayName: 'Demo User',
        contactEmail: null,
        personId: null,
        mustChangePassword: false,
        accountStatus: 'active',
      },
      access: 'full',
    });
    expect(identity.signInWithUsername).toHaveBeenCalledWith({
      username: 'demo.user',
      password: 'secret-value',
    });
  });

  it('resolves the current identity from the existing cookie contract', async () => {
    const app = new Hono();
    const identity = identityService();
    const runtime = mountIdentityHttpRoutes(app, { identity });
    app.get('/protected', async (context) => {
      const current = await runtime.resolveCurrentIdentity(context);
      if (current instanceof Response) return current;
      return context.json({ identityId: current.identity.identityId });
    });

    const response = await app.request('/protected', {
      headers: { cookie: 'better-auth.session_token=session-value' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ identityId: 'identity-1' });
    expect(identity.getCurrentIdentity).toHaveBeenCalledWith(
      'better-auth.session_token=session-value',
    );
  });

  it('keeps missing sessions fail-closed', async () => {
    const app = new Hono();
    const identity = identityService();
    const runtime = mountIdentityHttpRoutes(app, { identity });
    app.get('/protected', async (context) => {
      const current = await runtime.resolveCurrentIdentity(context);
      if (current instanceof Response) return current;
      return context.json({ ok: true });
    });

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'SESSION_INVALID',
        message: 'A valid session is required.',
      },
    });
    expect(identity.getCurrentIdentity).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';

import {
  createReferenceApp,
  type ReferenceAppDependencies,
} from '../worker/app';

const sessionCookie = 'better-auth.session_token=smoke-session';
const unusedIdentity = {} as ReferenceAppDependencies['identity'];
const unusedPermissions = {} as ReferenceAppDependencies['permissions'];
const unusedTasks = {} as ReferenceAppDependencies['tasks'];

describe('Reference session termination', () => {
  it('beendet die übergebene Session über den Runtime-Adapter', async () => {
    const endedSessions: string[] = [];
    const app = createReferenceApp({
      identity: unusedIdentity,
      endSession: async (cookie) => {
        endedSessions.push(cookie);
      },
      permissions: unusedPermissions,
      tasks: unusedTasks,
    });

    const response = await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ signedOut: true });
    expect(endedSessions).toEqual([sessionCookie]);
  });

  it('scheitert ohne Session-Ende-Adapter fail-closed', async () => {
    const app = createReferenceApp({
      identity: unusedIdentity,
      permissions: unusedPermissions,
      tasks: unusedTasks,
    });

    const response = await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REFERENCE_RUNTIME_NOT_CONFIGURED' },
    });
  });
});

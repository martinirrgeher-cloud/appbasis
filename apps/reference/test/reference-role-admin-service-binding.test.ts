import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  forwardRoleAdminRequest,
  isRoleAdminGatewayPath,
  type ReferenceRoleAdminServiceBinding,
} from '../worker/index';

const referenceWrangler = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const roleAdminWrangler = JSON.parse(
  readFileSync(new URL('../wrangler.role-admin.jsonc', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const roleAdminWorkerSource = readFileSync(
  new URL('../worker/role-admin.ts', import.meta.url),
  'utf8',
);
const expectedOrigin = 'https://preview.example.test';

describe('Reference role administration Service Binding', () => {
  it('pinnt einen nicht öffentlichen Admin-Worker als einziges internes Service Binding', () => {
    expect(referenceWrangler.services).toEqual([
      {
        binding: 'ROLE_ADMIN',
        service: 'appbasis-reference-role-admin',
      },
    ]);
    expect(roleAdminWrangler).toMatchObject({
      name: 'appbasis-reference-role-admin',
      main: './worker/role-admin.ts',
      workers_dev: false,
      preview_urls: false,
      keep_vars: false,
    });
    expect(roleAdminWrangler).not.toHaveProperty('routes');
    expect(roleAdminWrangler).not.toHaveProperty('route');
    expect(roleAdminWrangler).not.toHaveProperty('services');
    expect(roleAdminWorkerSource).toContain('PostgresPermissionStore');
    expect(roleAdminWorkerSource).toContain('PostgresRoleAdministration');
    expect(roleAdminWorkerSource).toContain('roleAdminMutationProtectionResponse');
  });

  it('akzeptiert ausschließlich den expliziten öffentlichen Admin-Gateway-Pfad', () => {
    expect(isRoleAdminGatewayPath('/api/admin/roles')).toBe(true);
    expect(isRoleAdminGatewayPath('/api/admin/roles/capabilities')).toBe(true);
    expect(isRoleAdminGatewayPath('/api/admin/roles/managed%3Atrainer')).toBe(true);
    expect(isRoleAdminGatewayPath('/api/roles')).toBe(false);
    expect(isRoleAdminGatewayPath('/api/admin/role')).toBe(false);
    expect(isRoleAdminGatewayPath('/api/admin/roles-extra')).toBe(false);
  });

  it('leitet Same-Origin-JSON-Mutationen mit Cookie, Query und Body nur nach intern weiter', async () => {
    const calls: Array<{
      url: string;
      method: string;
      origin: string | null;
      cookie: string | null;
      contentType: string | null;
      body: string;
    }> = [];
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
          origin: request.headers.get('origin'),
          cookie: request.headers.get('cookie'),
          contentType: request.headers.get('content-type'),
          body: await request.text(),
        });
        return new Response(JSON.stringify({ forwarded: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      },
    };

    const response = await forwardRoleAdminRequest(
      new Request(
        'https://preview.example.test/api/admin/roles/managed%3Atrainer/state?source=ui',
        {
          method: 'PUT',
          headers: {
            origin: expectedOrigin,
            cookie: 'better-auth.session_token=session',
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({ state: 'inactive' }),
        },
      ),
      binding,
      expectedOrigin,
    );

    expect(response.status).toBe(202);
    expect(calls).toEqual([
      {
        url: 'https://preview.example.test/api/roles/managed%3Atrainer/state?source=ui',
        method: 'PUT',
        origin: expectedOrigin,
        cookie: 'better-auth.session_token=session',
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ state: 'inactive' }),
      },
    ]);
  });

  it('blockiert Cross-Origin- oder originlose Mutationen vor dem Service Binding', async () => {
    let calls = 0;
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch() {
        calls += 1;
        return new Response(null, { status: 204 });
      },
    };

    for (const origin of ['https://attacker.example.test', null]) {
      const headers = new Headers({ 'content-type': 'application/json' });
      if (origin !== null) headers.set('origin', origin);
      const response = await forwardRoleAdminRequest(
        new Request(`${expectedOrigin}/api/admin/roles`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ roleId: 'managed:test' }),
        }),
        binding,
        expectedOrigin,
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'INVALID_REQUEST_ORIGIN' },
      });
    }
    expect(calls).toBe(0);
  });

  it('blockiert CORS-safelisted text/plain JSON vor dem Service Binding', async () => {
    let calls = 0;
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch() {
        calls += 1;
        return new Response(null, { status: 204 });
      },
    };

    const response = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/admin/roles`, {
        method: 'POST',
        headers: {
          origin: expectedOrigin,
          'content-type': 'text/plain',
        },
        body: JSON.stringify({ roleId: 'managed:test' }),
      }),
      binding,
      expectedOrigin,
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
    expect(calls).toBe(0);
  });

  it('lässt read-only GET ohne Origin durch und verlangt für DELETE nur Same-Origin', async () => {
    const methods: string[] = [];
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch(request) {
        methods.push(request.method);
        return new Response(null, { status: 204 });
      },
    };

    const read = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/admin/roles`),
      binding,
      expectedOrigin,
    );
    expect(read.status).toBe(204);

    const deletion = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/admin/roles/managed%3Atest`, {
        method: 'DELETE',
        headers: { origin: expectedOrigin },
      }),
      binding,
      expectedOrigin,
    );
    expect(deletion.status).toBe(204);
    expect(methods).toEqual(['GET', 'DELETE']);
  });

  it('bleibt ohne Service Binding oder konfigurierte Base-URL fail-closed und leitet fremde Pfade nie weiter', async () => {
    const missingBinding = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/admin/roles`),
      undefined,
      expectedOrigin,
    );
    expect(missingBinding.status).toBe(503);

    let calls = 0;
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch() {
        calls += 1;
        return new Response(null, { status: 204 });
      },
    };
    const missingOriginConfig = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/admin/roles`),
      binding,
      null,
    );
    expect(missingOriginConfig.status).toBe(503);

    const outside = await forwardRoleAdminRequest(
      new Request(`${expectedOrigin}/api/tasks`),
      binding,
      expectedOrigin,
    );
    expect(outside.status).toBe(404);
    expect(calls).toBe(0);
  });
});

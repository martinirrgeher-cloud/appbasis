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
  });

  it('akzeptiert ausschließlich den expliziten öffentlichen Admin-Gateway-Pfad', () => {
    expect(isRoleAdminGatewayPath('/api/admin/roles')).toBe(true);
    expect(isRoleAdminGatewayPath('/api/admin/roles/capabilities')).toBe(true);
    expect(isRoleAdminGatewayPath('/api/admin/roles/managed%3Atrainer')).toBe(true);
    expect(isRoleAdminGatewayPath('/api/roles')).toBe(false);
    expect(isRoleAdminGatewayPath('/api/admin/role')).toBe(false);
    expect(isRoleAdminGatewayPath('/api/admin/roles-extra')).toBe(false);
  });

  it('leitet Request, Cookie, Query und Body nur mit internem Pfad-Rewrite weiter', async () => {
    const calls: Array<{
      url: string;
      method: string;
      cookie: string | null;
      contentType: string | null;
      body: string;
    }> = [];
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
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
            cookie: 'better-auth.session_token=session',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ state: 'inactive' }),
        },
      ),
      binding,
    );

    expect(response.status).toBe(202);
    expect(calls).toEqual([
      {
        url: 'https://preview.example.test/api/roles/managed%3Atrainer/state?source=ui',
        method: 'PUT',
        cookie: 'better-auth.session_token=session',
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive' }),
      },
    ]);
  });

  it('bleibt ohne Service Binding fail-closed und leitet fremde Pfade nie weiter', async () => {
    const missing = await forwardRoleAdminRequest(
      new Request('https://preview.example.test/api/admin/roles'),
      undefined,
    );
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED' },
    });

    let calls = 0;
    const binding: ReferenceRoleAdminServiceBinding = {
      async fetch() {
        calls += 1;
        return new Response(null, { status: 204 });
      },
    };
    const outside = await forwardRoleAdminRequest(
      new Request('https://preview.example.test/api/tasks'),
      binding,
    );
    expect(outside.status).toBe(404);
    expect(calls).toBe(0);
  });
});

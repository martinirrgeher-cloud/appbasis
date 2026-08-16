import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyReferenceRoleAdminPublicIngress } from './reference-role-admin-ingress.mjs';

const accountId = 'account-id';
const apiToken = 'token-value';
const worker = 'appbasis-reference-role-admin';

function successResponse(result) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockCloudflare({
  subdomain = { enabled: false, previews_enabled: false },
  domains = [],
  scripts = [{ id: worker, routes: [] }],
} = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init.headers).get('authorization') });
    if (url.endsWith(`/workers/scripts/${worker}/subdomain`)) {
      return successResponse(subdomain);
    }
    if (url.includes('/workers/domains?')) {
      return successResponse(domains);
    }
    if (url.endsWith('/workers/scripts')) {
      return successResponse(scripts);
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('verifies all public ingress surfaces with account-scoped Worker APIs', async () => {
  const { fetchImpl, calls } = mockCloudflare();

  await assert.doesNotReject(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
  );

  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /workers\/scripts\/appbasis-reference-role-admin\/subdomain$/);
  assert.match(calls[1].url, /workers\/domains\?service=appbasis-reference-role-admin$/);
  assert.match(calls[2].url, /accounts\/account-id\/workers\/scripts$/);
  assert.equal(calls.some((call) => call.url.includes('/zones')), false);
  assert.equal(calls.every((call) => call.authorization === 'Bearer token-value'), true);
});

test('rejects workers.dev and Preview URL exposure', async () => {
  for (const subdomain of [
    { enabled: true, previews_enabled: false },
    { enabled: false, previews_enabled: true },
  ]) {
    const { fetchImpl } = mockCloudflare({ subdomain });
    await assert.rejects(
      verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
      subdomain.enabled ? /workers\.dev/ : /Preview URLs/,
    );
  }
});

test('rejects a custom domain assigned to the internal Worker', async () => {
  const { fetchImpl } = mockCloudflare({
    domains: [{ id: 'domain-id', hostname: 'admin.example.test', service: worker }],
  });

  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
    /public custom domain/,
  );
});

test('rejects any account-scoped Worker route associated with the internal Worker', async () => {
  const { fetchImpl } = mockCloudflare({
    scripts: [
      {
        id: worker,
        routes: [{ id: 'route-id', pattern: 'example.test/admin/*', script: worker }],
      },
    ],
  });

  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
    /public Worker route/,
  );
});

test('accepts an omitted optional routes field as no associated routes', async () => {
  const { fetchImpl } = mockCloudflare({ scripts: [{ id: worker }] });

  await assert.doesNotReject(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
  );
});

test('accepts a null routes field as no associated routes', async () => {
  const { fetchImpl } = mockCloudflare({ scripts: [{ id: worker, routes: null }] });

  await assert.doesNotReject(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
  );
});

test('fails closed when the Worker route inventory is missing, duplicated or malformed', async () => {
  for (const scripts of [
    [],
    [{ id: worker }, { id: worker }],
    [{ id: worker, routes: 'unknown' }],
  ]) {
    const { fetchImpl } = mockCloudflare({ scripts });
    await assert.rejects(
      verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
      /route inventory/,
    );
  }
});

test('fails closed on unreadable or unsuccessful Cloudflare responses', async () => {
  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({
      accountId,
      apiToken,
      fetchImpl: async () => new Response('forbidden', { status: 403 }),
    }),
    /could not be read from Cloudflare/,
  );

  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({
      accountId,
      apiToken,
      fetchImpl: async () => successResponse(null),
    }),
    /response is invalid/,
  );
});

test('requires local Cloudflare credentials without exposing them in errors', async () => {
  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({ accountId: '', apiToken, fetchImpl: async () => successResponse({}) }),
    /CLOUDFLARE_ACCOUNT_ID/,
  );
  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken: ' token ', fetchImpl: async () => successResponse({}) }),
    /CLOUDFLARE_API_TOKEN/,
  );
});

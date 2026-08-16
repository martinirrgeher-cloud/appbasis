import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyReferenceRoleAdminPublicIngress } from './reference-role-admin-ingress.mjs';

const accountId = 'account-id';
const apiToken = 'token-value';
const worker = 'appbasis-reference-role-admin';

function successResponse(result, resultInfo) {
  const payload = { success: true, result };
  if (resultInfo !== undefined) payload.result_info = resultInfo;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockCloudflare({
  subdomain = { enabled: false, previews_enabled: false },
  domains = [],
  domainResultInfo,
  includeDomainResultInfo = true,
  zonePages = [
    {
      zones: [{ id: 'zone-1', account: { id: accountId } }],
      resultInfo: { page: 1, total_pages: 1 },
    },
  ],
  routesByZone = { 'zone-1': [] },
} = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({
      url: url.toString(),
      method: init.method,
      authorization: new Headers(init.headers).get('authorization'),
    });
    if (url.pathname.endsWith(`/workers/scripts/${worker}/subdomain`)) {
      return successResponse(subdomain);
    }
    if (url.pathname.endsWith('/workers/domains')) {
      return successResponse(
        domains,
        includeDomainResultInfo
          ? (domainResultInfo ?? { page: 1, count: domains.length, total_pages: 1 })
          : undefined,
      );
    }
    if (url.pathname === '/client/v4/zones') {
      const page = Number(url.searchParams.get('page'));
      const entry = zonePages[page - 1];
      if (entry === undefined) return new Response('not found', { status: 404 });
      return successResponse(entry.zones, entry.resultInfo);
    }
    const routeMatch = url.pathname.match(/^\/client\/v4\/zones\/([^/]+)\/workers\/routes$/);
    if (routeMatch !== null) {
      return successResponse(routesByZone[decodeURIComponent(routeMatch[1])] ?? []);
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('verifies public ingress with complete domain and authoritative zone-route inventories', async () => {
  const { fetchImpl, calls } = mockCloudflare();

  const result = await verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl });

  assert.deepEqual(result, {
    workersDevEnabled: false,
    previewUrlsEnabled: false,
    customDomainCount: 0,
    routeCount: 0,
    checkedZoneCount: 1,
  });
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /workers\/scripts\/appbasis-reference-role-admin\/subdomain$/);
  assert.match(calls[1].url, /workers\/domains\?service=appbasis-reference-role-admin$/);
  const zoneInventory = new URL(calls[2].url);
  assert.equal(zoneInventory.pathname, '/client/v4/zones');
  assert.equal(zoneInventory.searchParams.get('account.id'), accountId);
  assert.equal(zoneInventory.searchParams.get('type'), 'full,partial,secondary,internal');
  assert.equal(zoneInventory.searchParams.get('page'), '1');
  assert.equal(zoneInventory.searchParams.get('per_page'), '50');
  assert.match(calls[3].url, /zones\/zone-1\/workers\/routes$/);
  assert.equal(calls.every((call) => call.method === 'GET'), true);
  assert.equal(calls.every((call) => call.authorization === 'Bearer token-value'), true);
});

test('fails closed when filtered custom-domain pagination cannot prove completeness', async () => {
  for (const options of [
    { includeDomainResultInfo: false },
    { domainResultInfo: { page: 2, count: 0, total_pages: 2 } },
    { domainResultInfo: { page: 1, count: 1, total_pages: 1 } },
    { domainResultInfo: { page: 1, count: 0, total_pages: 2 } },
  ]) {
    const { fetchImpl } = mockCloudflare(options);
    await assert.rejects(
      verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
      /custom-domain pagination/,
    );
  }
});

test('paginates the complete account-zone inventory before accepting no routes', async () => {
  const { fetchImpl, calls } = mockCloudflare({
    zonePages: [
      {
        zones: [{ id: 'zone-1', account: { id: accountId } }],
        resultInfo: { page: 1, total_pages: 2 },
      },
      {
        zones: [{ id: 'zone-2', account: { id: accountId } }],
        resultInfo: { page: 2, total_pages: 2 },
      },
    ],
    routesByZone: { 'zone-1': [], 'zone-2': [] },
  });

  const result = await verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl });

  assert.equal(result.checkedZoneCount, 2);
  assert.equal(calls.filter((call) => new URL(call.url).pathname === '/client/v4/zones').length, 2);
  assert.equal(calls.filter((call) => call.url.endsWith('/workers/routes')).length, 2);
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

test('rejects a zone-scoped Worker route associated with the internal Worker', async () => {
  const { fetchImpl } = mockCloudflare({
    routesByZone: {
      'zone-1': [{ id: 'route-id', pattern: 'example.test/admin/*', script: worker }],
    },
  });

  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
    /public Worker route/,
  );
});

test('fails closed on incomplete, cross-account or unstable zone pagination', async () => {
  for (const zonePages of [
    [
      {
        zones: [{ id: 'zone-1', account: { id: accountId } }],
        resultInfo: undefined,
      },
    ],
    [
      {
        zones: [{ id: 'zone-1', account: { id: 'other-account' } }],
        resultInfo: { page: 1, total_pages: 1 },
      },
    ],
    [
      {
        zones: [{ id: 'zone-1', account: { id: accountId } }],
        resultInfo: { page: 1, total_pages: 2 },
      },
      {
        zones: [{ id: 'zone-2', account: { id: accountId } }],
        resultInfo: { page: 2, total_pages: 3 },
      },
    ],
  ]) {
    const { fetchImpl } = mockCloudflare({ zonePages });
    await assert.rejects(
      verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
      /zone inventory|pagination/,
    );
  }
});

test('fails closed on malformed route inventory', async () => {
  const { fetchImpl } = mockCloudflare({
    routesByZone: {
      'zone-1': [{ id: 'route-id', pattern: 'example.test/*', script: { unexpected: true } }],
    },
  });

  await assert.rejects(
    verifyReferenceRoleAdminPublicIngress({ accountId, apiToken, fetchImpl }),
    /Worker routes for zone zone-1 response is invalid/,
  );
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

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inspectK2Cloudflare, bindingsOf } from './ulc-linz-k2-cloudflare-inventory.mjs';

const ACCOUNT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN = 'mock-token-never-log-123456789';
const VERSION = '11111111-1111-4111-8111-111111111111';
const API = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT;

function fakeApi({ targetHost = 'ep-normal.example.neon.tech',
  targetDatabase = 'ordinary_preview', secretName = 'BETTER_AUTH_SECRET',
  settingsBindings, versionBindings, failEndpoint = '' } = {}) {
  const calls = [];
  async function fetchImpl(url, options) {
    calls.push({ url, method: options.method, redirect: options.redirect });
    assert.ok(url.startsWith(API));
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer ' + TOKEN);
    let result;
    if (url.endsWith('/workers/scripts'))
      result = [{ id: 'appbasis-ulc-linz' }];
    else if (url.includes('/hyperdrive/configs?page='))
      result = [{ id: 'hd-01', name: 'preview-hyperdrive' }];
    else if (url.endsWith('/hyperdrive/configs/hd-01'))
      result = { id: 'hd-01', origin: { host: targetHost, database: targetDatabase, password: 'do-not-print-this' } };
    else if (url.endsWith('/settings'))
      result = { bindings: settingsBindings ?? [{ type: 'hyperdrive', name: 'HYPERDRIVE', id: 'hd-01' }] };
    else if (url.endsWith('/secrets'))
      result = [{ type: 'secret_text', name: secretName, text: 'secret-value-never-log' }];
    else if (url.includes('/deployments?'))
      result = { deployments: [{ versions: [{ percentage: 100, version_id: VERSION }] }] };
    else if (url.endsWith('/versions/' + VERSION))
      result = { resources: { bindings: versionBindings ?? [{ type: 'hyperdrive', name: 'HYPERDRIVE', id: 'hd-01' }] } };
    else throw Error('unexpected mocked URL');
    if (failEndpoint && url.includes(failEndpoint)) {
      return { ok: false, status: 403, async json() { return { success: false, errors: [{ message: TOKEN }] }; } };
    }
    return { ok: true, status: 200, async json() { return { success: true, result }; } };
  }
  return { calls, fetchImpl };
}
async function scan(options = {}) {
  const fake = fakeApi(options);
  const result = await inspectK2Cloudflare({ accountId: ACCOUNT, apiToken: TOKEN },
    { fetchImpl: fake.fetchImpl });
  return { result, calls: fake.calls };
}
test('complete GET-only scan never claims full Cloudflare isolation', async () => {
  const { result, calls } = await scan();
  assert.equal(result.status, 'NO_K2_IN_INSPECTED_HYPERDRIVES');
  assert.deepEqual(result.findings, []);
  assert.equal(result.workerCount, 1);
  assert.equal(result.activeVersionCount, 1);
  assert.equal(result.referencedHyperdriveCount, 1);
  assert.equal(result.inspectedBindingCount, 2);
  assert.ok(calls.every(c => c.method === 'GET'));
  assert.equal(result.cloudflareAccountWideIsolationProven, false);
  for (const x of ['databaseWriteAuthorized','mergeAuthorized','deployAuthorized','productionReady','secretsValuesChecked'])
    assert.equal(result[x], false);
  assert.doesNotMatch(JSON.stringify(result), /mock-token|do-not-print-this|secret-value-never-log/);
});
test('K2 host matching even on a different database blocks', async () => {
  const { result } = await scan({ targetHost: 'ep-snowy-fog-b1xzh562.c-5.eu-central-1.aws.neon.tech' });
  assert.equal(result.status, 'K2_REFERENCE_FOUND');
  assert.deepEqual(result.findings.map(x => x.code), ['K2_ORIGIN_REFERENCE']);
});
test('K2 database matching even on a different host blocks', async () => {
  const { result } = await scan({ targetDatabase: 'ulc_linz_k2_restore_quarantine' });
  assert.equal(result.status, 'K2_REFERENCE_FOUND');
});
test('direct DB-looking secret name requires human review but value never appears', async () => {
  const { result } = await scan({ secretName: 'DATABASE_URL' });
  assert.equal(result.status, 'MANUAL_REVIEW_REQUIRED');
  assert.deepEqual(result.findings.map(x => x.code), ['POSSIBLE_DIRECT_DB_SECRET']);
  assert.doesNotMatch(JSON.stringify(result), /secret-value-never-log/);
});
test('active version binding is checked even when script settings are empty', async () => {
  const { result } = await scan({ settingsBindings: [] });
  assert.equal(result.referencedHyperdriveCount, 1);
});
test('service binding target not in account list is blocked', async () => {
  const { result } = await scan({ settingsBindings: [{ type: 'service', name: 'ROLE_ADMIN', service: 'missing-worker' }] });
  assert.equal(result.status, 'MANUAL_REVIEW_REQUIRED');
  assert.deepEqual(result.findings.map(x => x.code), ['SERVICE_TARGET_NOT_IN_WORKER_LIST']);
});
test('unrecognized hyperdrive origin and missing id fail closed', async () => {
  const a = await scan({ targetHost: null });
  assert.equal(a.result.status, 'MANUAL_REVIEW_REQUIRED');
  assert.deepEqual(a.result.findings.map(x => x.code), ['ORIGIN_UNVERIFIABLE']);
  const b = await scan({ settingsBindings: [{ type: 'hyperdrive', name: 'HYPERDRIVE' }], versionBindings: [] });
  assert.equal(b.result.status, 'MANUAL_REVIEW_REQUIRED');
  assert.deepEqual(b.result.findings.map(x => x.code), ['HYPERDRIVE_ID_MISSING']);
});
test('Cloudflare error response is never echoed or trusted', async () => {
  await assert.rejects(
    inspectK2Cloudflare({ accountId: ACCOUNT, apiToken: TOKEN },
      { fetchImpl: fakeApi({ failEndpoint: '/secrets' }).fetchImpl }),
    error => error.message === 'K2_INVENTORY_REQUEST_HTTP' && !error.message.includes(TOKEN)
  );
});
test('invalid credentials and malformed bindings block before any mutation', async () => {
  await assert.rejects(inspectK2Cloudflare({ accountId: '../not-account', apiToken: TOKEN },
    { fetchImpl: fakeApi().fetchImpl }), /K2_INVENTORY_INVALID_ACCOUNT/);
  assert.throws(() => bindingsOf(null), /K2_INVENTORY_BINDINGS_UNAVAILABLE/);
  assert.throws(() => bindingsOf({ x: null }), /K2_INVENTORY_BINDINGS_SHAPE/);
});
test('repo workflow is manual-main-only for live reads, no provider writes and no secret output', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ulc-linz-k2-cloudflare-inventory.yml', import.meta.url), 'utf8');
  const source = readFileSync(new URL('./ulc-linz-k2-cloudflare-inventory.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: ulc-k2-cloudflare-readonly/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /CLOUDFLARE_K2_READ_TOKEN/);
  assert.doesNotMatch(workflow, /NEON_API_KEY|DATABASE_URL|wrangler deploy/);
  assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
  assert.doesNotMatch(source, /console\.log\(.*(?:data|secret|binding)/);
});

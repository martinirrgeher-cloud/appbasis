/**
 * K2 Cloudflare inventory: GET-only, scope-limited, fail-closed.
 * Never writes, deploys, prints an API response, or outputs binding values.
 * A clean inventory is NOT proof that a secret contains no database URL.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4/accounts/';
const K2_COMPUTE = 'ep-snowy-fog-b1xzh562';
const K2_DATABASE = 'ulc_linz_k2_restore_quarantine';
const IDENT = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const DB_NAME = /(?:DATABASE|DB_URL|DB_HOST|POSTGRES|PGHOST|PGUSER|NEON|CONNECTION_STRING|CONNECTION_URL|PG_CONN)/i;
const MAX_ITEMS = 200;

function fail(code) {
  throw new Error('K2_INVENTORY_' + code);
}
function validateIdentity(value, label, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) fail('INVALID_' + label);
  return value;
}
async function apiGet(accountId, token, path, fetchImpl) {
  if (!path.startsWith('/') || path.includes('..') || path.includes('//')) fail('INVALID_PATH');
  const url = API + accountId + path;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail('REQUEST_TRANSPORT');
  }
  if (!response || response.ok !== true) fail('REQUEST_HTTP');
  let data;
  try { data = await response.json(); } catch { fail('RESPONSE_JSON'); }
  if (data?.success !== true || data.result === undefined) fail('RESPONSE_ENVELOPE');
  return data;
}
async function list(accountId, token, path, fetchImpl, paginated = false) {
  const values = [];
  for (let page = 1; page <= 20; page += 1) {
    const suffix = paginated ? '?page=' + page + '&per_page=100' : '';
    const data = await apiGet(accountId, token, path + suffix, fetchImpl);
    if (!Array.isArray(data.result)) fail('LIST_SHAPE');
    values.push(...data.result);
    if (values.length > MAX_ITEMS) fail('LIST_TOO_LARGE');
    const totalPages = data.result_info?.total_pages;
    if (!paginated) {
      if (Number.isInteger(totalPages) && totalPages > 1) fail('SCRIPT_LIST_TRUNCATED');
      return values;
    }
    if (Number.isInteger(totalPages)) {
      if (totalPages < page || totalPages > 20) fail('PAGINATION_SHAPE');
      if (page >= totalPages) return values;
    } else if (data.result.length < 100) {
      return values;
    }
  }
  fail('PAGINATION_LIMIT');
}
export function bindingsOf(value) {
  if (Array.isArray(value)) {
    if (!value.every(x => x && typeof x === 'object' && !Array.isArray(x))) fail('BINDINGS_SHAPE');
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([name, details]) => {
      if (!details || typeof details !== 'object' || Array.isArray(details)) fail('BINDINGS_SHAPE');
      return { ...details, name: details.name || name };
    });
  }
  fail('BINDINGS_UNAVAILABLE');
}
function isK2(origin) {
  if (!origin || typeof origin !== 'object') return null;
  if (typeof origin.host !== 'string' || typeof origin.database !== 'string') return null;
  // Treat matching compute OR matching DB as a blocker for manual review.
  return origin.host.includes(K2_COMPUTE) || origin.database === K2_DATABASE;
}
function markBinding(binding, worker, hyperdriveRefs, review, serviceEdges) {
  const type = typeof binding.type === 'string' ? binding.type.toLowerCase() : '';
  const name = typeof binding.name === 'string' ? binding.name : '';
  if (type === 'hyperdrive') {
    const id = binding.id || binding.hyperdrive_id;
    if (typeof id !== 'string' || !IDENT.test(id)) {
      review.push({ worker, code: 'HYPERDRIVE_ID_MISSING' });
    } else {
      hyperdriveRefs.add(id);
    }
  }
  if (type === 'service') {
    const target = binding.service || binding.script_name;
    if (typeof target !== 'string' || !IDENT.test(target)) {
      review.push({ worker, code: 'SERVICE_TARGET_UNKNOWN' });
    } else {
      serviceEdges.add(target);
    }
  }
  if (DB_NAME.test(name) && type !== 'hyperdrive' && type !== 'service') {
    review.push({ worker, code: 'POSSIBLE_DIRECT_DB_VARIABLE' });
  }
}
export async function inspectK2Cloudflare({ accountId, apiToken }, { fetchImpl = fetch } = {}) {
  validateIdentity(accountId, 'ACCOUNT', /^[a-f0-9]{32}$/i);
  if (typeof apiToken !== 'string' || apiToken.length < 16 || apiToken !== apiToken.trim()) fail('TOKEN');
  const scripts = await list(accountId, apiToken, '/workers/scripts', fetchImpl);
  if (scripts.length === 0) fail('NO_WORKERS');
  const hyperdriveList = await list(accountId, apiToken, '/hyperdrive/configs', fetchImpl, true);
  const hyperdriveIds = new Set();
  for (const config of hyperdriveList) {
    if (!config || typeof config.id !== 'string' || !IDENT.test(config.id) ||
        hyperdriveIds.has(config.id)) fail('HYPERDRIVE_LIST_INVALID');
    hyperdriveIds.add(config.id);
  }
  const seen = new Set();
  const review = [];
  const serviceEdges = new Set();
  const referencedHyperdrives = new Set();
  let checkedVersions = 0;
  let checkedBindings = 0;

  for (const script of scripts) {
    const worker = validateIdentity(script?.id, 'WORKER', IDENT);
    if (seen.has(worker)) fail('DUPLICATE_WORKER');
    seen.add(worker);
    const path = '/workers/scripts/' + encodeURIComponent(worker);
    // Inspect script's configured bindings, secrets metadata and all serving versions.
    const [settings, secrets, deployments] = await Promise.all([
      apiGet(accountId, apiToken, path + '/settings', fetchImpl),
      apiGet(accountId, apiToken, path + '/secrets', fetchImpl),
      apiGet(accountId, apiToken, path + '/deployments?per_page=100', fetchImpl),
    ]);
    if (settings.result?.bindings === undefined || !Array.isArray(secrets.result) ||
        !Array.isArray(deployments.result?.deployments)) fail('WORKER_METADATA_INCOMPLETE');
    const active = deployments.result.deployments[0];
    if (!active || !Array.isArray(active.versions) || active.versions.length === 0 ||
) fail('ACTIVE_DEPLOYMENT_INCOMPLETE');
    const versionIds = new Set();
    for (const version of active.versions) {
      if (typeof version?.version_id !== 'string' || !UUID.test(version.version_id) ||
          !(version.percentage > 0 && version.percentage <= 100)) fail('ACTIVE_VERSION_SHAPE');
      versionIds.add(version.version_id);
    }
    const bindingSets = [bindingsOf(settings.result.bindings)];
    for (const versionId of versionIds) {
      const version = await apiGet(
        accountId, apiToken, path + '/versions/' + encodeURIComponent(versionId), fetchImpl
      );
      if (version.result?.resources?.bindings === undefined) fail('VERSION_BINDINGS_MISSING');
      bindingSets.push(bindingsOf(version.result.resources.bindings));
      checkedVersions += 1;
    }
    for (const bindingSet of bindingSets) {
      for (const binding of bindingSet) {
        checkedBindings += 1;
        markBinding(binding, worker, referencedHyperdrives, review, serviceEdges);
      }
    }
    for (const secret of secrets.result) {
      if (typeof secret?.name !== 'string' || typeof secret?.type !== 'string') {
        fail('SECRET_METADATA_SHAPE');
      }
      // Intentionally do not inspect or print "text", "value", "key_jwk" etc.
      if (DB_NAME.test(secret.name)) review.push({ worker, code: 'POSSIBLE_DIRECT_DB_SECRET' });
    }
  }
  for (const target of serviceEdges) {
    if (!seen.has(target)) review.push({ worker: 'service-binding', code: 'SERVICE_TARGET_NOT_IN_WORKER_LIST' });
  }
  let k2References = 0;
  for (const id of referencedHyperdrives) {
    if (!hyperdriveIds.has(id)) {
      review.push({ worker: 'hyperdrive', code: 'REFERENCED_HYPERDRIVE_NOT_LISTED' });
      continue;
    }
    const config = await apiGet(
      accountId, apiToken, '/hyperdrive/configs/' + encodeURIComponent(id), fetchImpl
    );
    const match = isK2(config.result?.origin);
    if (match === true) {
      k2References += 1;
      review.push({ worker: 'hyperdrive', code: 'K2_ORIGIN_REFERENCE' });
    } else if (match === null) {
      review.push({ worker: 'hyperdrive', code: 'ORIGIN_UNVERIFIABLE' });
    }
  }
  return Object.freeze({
    status: k2References ? 'K2_REFERENCE_FOUND' :
      review.length ? 'MANUAL_REVIEW_REQUIRED' : 'NO_K2_IN_INSPECTED_HYPERDRIVES',
    workerCount: seen.size,
    activeVersionCount: checkedVersions,
    inspectedBindingCount: checkedBindings,
    hyperdriveConfigCount: hyperdriveIds.size,
    referencedHyperdriveCount: referencedHyperdrives.size,
    findings: review,
    secretsValuesChecked: false,
    cloudflareAccountWideIsolationProven: false,
    databaseWriteAuthorized: false,
    mergeAuthorized: false,
    deployAuthorized: false,
    productionReady: false,
  });
}
async function main() {
  const result = await inspectK2Cloudflare({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_K2_READ_TOKEN,
  });
  // Only explicit, bounded summary fields are ever logged.
  process.stdout.write(JSON.stringify(result) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '### K2 Cloudflare account inventory (GET only)',
      '- Status: ' + result.status,
      '- Workers checked: ' + result.workerCount,
      '- Serving versions checked: ' + result.activeVersionCount,
      '- Hyperdrive configs referenced: ' + result.referencedHyperdriveCount,
      '- Findings: ' + result.findings.length,
      '- Secret values checked: no',
      '- Full account isolation certified: **NO**',
      '- Database/Cloudflare write, merge or deployment authorized: **NO**',
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
  if (result.status === 'K2_REFERENCE_FOUND') process.exitCode = 2;
  else if (result.status === 'MANUAL_REVIEW_REQUIRED') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write('K2_INVENTORY_BLOCKED: read-only inventory incomplete or API access denied.\n');
    process.exitCode = 1;
  });
}

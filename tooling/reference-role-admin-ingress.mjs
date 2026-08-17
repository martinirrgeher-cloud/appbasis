import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLOUDFLARE_API_ROOT = 'https://api.cloudflare.com/client/v4';
const ROLE_ADMIN_WORKER = 'appbasis-reference-role-admin';

export async function verifyReferenceRoleAdminPublicIngress({
  accountId,
  apiToken,
  fetchImpl = fetch,
} = {}) {
  const normalizedAccountId = requiredValue(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const normalizedApiToken = requiredValue(apiToken, 'CLOUDFLARE_API_TOKEN');
  const accountPath = `${CLOUDFLARE_API_ROOT}/accounts/${encodeURIComponent(normalizedAccountId)}`;

  const subdomain = await cloudflareJson(
    `${accountPath}/workers/scripts/${encodeURIComponent(ROLE_ADMIN_WORKER)}/subdomain`,
    normalizedApiToken,
    fetchImpl,
    'Role administration Worker subdomain state',
  );
  const subdomainResult = requiredRecord(subdomain.result, 'Role administration Worker subdomain state');
  if (subdomainResult.enabled !== false) {
    throw new Error('Role administration Worker is exposed through workers.dev.');
  }
  if (subdomainResult.previews_enabled !== false) {
    throw new Error('Role administration Worker exposes Preview URLs.');
  }

  const domainsURL = new URL(`${accountPath}/workers/domains`);
  domainsURL.searchParams.set('service', ROLE_ADMIN_WORKER);
  const domains = await cloudflareJson(
    domainsURL,
    normalizedApiToken,
    fetchImpl,
    'Role administration Worker custom domains',
  );
  const domainResults = requiredArray(domains.result, 'Role administration Worker custom domains');
  validateOptionalDomainResultInfo(domains.result_info, domainResults.length);
  if (
    domainResults.some(
      (candidate) =>
        !isRecord(candidate) ||
        candidate.service !== ROLE_ADMIN_WORKER,
    )
  ) {
    throw new Error('Role administration Worker custom-domain inventory is invalid.');
  }
  if (domainResults.length !== 0) {
    throw new Error('Role administration Worker has a public custom domain.');
  }

  const scripts = await cloudflareJson(
    `${accountPath}/workers/scripts`,
    normalizedApiToken,
    fetchImpl,
    'Role administration Worker route inventory',
  );
  const scriptResults = requiredArray(scripts.result, 'Role administration Worker route inventory');
  const matchingScripts = scriptResults.filter(
    (candidate) => isRecord(candidate) && candidate.id === ROLE_ADMIN_WORKER,
  );
  if (matchingScripts.length !== 1) {
    throw new Error('Role administration Worker route inventory could not identify the internal Worker exactly once.');
  }
  const routes = matchingScripts[0].routes;
  if (routes !== undefined && routes !== null && !Array.isArray(routes)) {
    throw new Error('Role administration Worker route inventory is invalid.');
  }
  if (Array.isArray(routes) && routes.length !== 0) {
    throw new Error('Role administration Worker has a public Worker route.');
  }

  return Object.freeze({
    workersDevEnabled: false,
    previewUrlsEnabled: false,
    customDomainCount: 0,
    routeCount: 0,
  });
}

function validateOptionalDomainResultInfo(resultInfo, filteredResultCount) {
  if (resultInfo === undefined) return;
  if (!isRecord(resultInfo)) {
    throw new Error('Role administration Worker custom-domain result metadata is invalid.');
  }

  const count = optionalNonNegativeInteger(
    resultInfo,
    'count',
    'Role administration Worker custom-domain result metadata',
  );
  const page = optionalNonNegativeInteger(
    resultInfo,
    'page',
    'Role administration Worker custom-domain result metadata',
  );
  optionalNonNegativeInteger(
    resultInfo,
    'per_page',
    'Role administration Worker custom-domain result metadata',
  );
  optionalNonNegativeInteger(
    resultInfo,
    'total_count',
    'Role administration Worker custom-domain result metadata',
  );
  optionalNonNegativeInteger(
    resultInfo,
    'total_pages',
    'Role administration Worker custom-domain result metadata',
  );

  if (count !== undefined && count !== filteredResultCount) {
    throw new Error('Role administration Worker custom-domain result metadata is inconsistent.');
  }
  if (page !== undefined && page !== 0 && page !== 1) {
    throw new Error('Role administration Worker custom-domain result metadata is inconsistent.');
  }
}

async function cloudflareJson(url, apiToken, fetchImpl, label) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${label} could not be read from Cloudflare.`);
  }

  if (!response.ok) {
    throw new Error(`${label} could not be read from Cloudflare.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`${label} returned an unsuccessful Cloudflare response.`);
  }
  return payload;
}

function requiredValue(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${field} is required and must not contain surrounding whitespace.`);
  }
  return value;
}

function optionalNonNegativeInteger(record, field, label) {
  if (!Object.hasOwn(record, field)) return undefined;
  const value = record[field];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} response is invalid.`);
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} response is invalid.`);
  return value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main(env = process.env) {
  const result = await verifyReferenceRoleAdminPublicIngress({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  });
  console.log(
    `Reference role administration ingress verified: workers.dev=${result.workersDevEnabled}, preview URLs=${result.previewUrlsEnabled}, custom domains=${result.customDomainCount}, Worker routes=${result.routeCount}.`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Reference role administration ingress verification failed.');
    process.exitCode = 1;
  }
}

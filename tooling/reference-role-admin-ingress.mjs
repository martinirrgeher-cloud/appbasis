import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLOUDFLARE_API_ROOT = 'https://api.cloudflare.com/client/v4';
const ROLE_ADMIN_WORKER = 'appbasis-reference-role-admin';
const ZONE_PAGE_SIZE = 50;
const ALL_ZONE_TYPES = 'full,partial,secondary,internal';

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

  await verifyNoReferenceRoleAdminCustomDomains({
    accountPath,
    apiToken: normalizedApiToken,
    fetchImpl,
  });

  const zones = await listAccountZones({
    accountId: normalizedAccountId,
    apiToken: normalizedApiToken,
    fetchImpl,
  });
  for (const zone of zones) {
    const routes = await cloudflareJson(
      `${CLOUDFLARE_API_ROOT}/zones/${encodeURIComponent(zone.id)}/workers/routes`,
      normalizedApiToken,
      fetchImpl,
      `Worker routes for zone ${zone.id}`,
    );
    const routeResults = requiredArray(routes.result, `Worker routes for zone ${zone.id}`);
    for (const candidate of routeResults) {
      const route = requiredRecord(candidate, `Worker routes for zone ${zone.id}`);
      if (
        route.script !== undefined &&
        route.script !== null &&
        typeof route.script !== 'string'
      ) {
        throw new Error(`Worker routes for zone ${zone.id} response is invalid.`);
      }
      if (route.script === ROLE_ADMIN_WORKER) {
        throw new Error('Role administration Worker has a public Worker route.');
      }
    }
  }

  return Object.freeze({
    workersDevEnabled: false,
    previewUrlsEnabled: false,
    customDomainCount: 0,
    routeCount: 0,
    checkedZoneCount: zones.length,
  });
}

async function verifyNoReferenceRoleAdminCustomDomains({ accountPath, apiToken, fetchImpl }) {
  const domainsURL = new URL(`${accountPath}/workers/domains`);
  domainsURL.searchParams.set('service', ROLE_ADMIN_WORKER);
  const payload = await cloudflareJson(
    domainsURL,
    apiToken,
    fetchImpl,
    'Role administration Worker custom domains',
  );
  const domainResults = requiredArray(payload.result, 'Role administration Worker custom domains');
  const resultInfo = requiredRecord(
    payload.result_info,
    'Role administration Worker custom-domain pagination',
  );
  const page = requiredPositiveInteger(
    resultInfo.page,
    'Role administration Worker custom-domain pagination',
  );
  const count = requiredNonNegativeInteger(
    resultInfo.count,
    'Role administration Worker custom-domain pagination',
  );
  const totalPages = requiredNonNegativeInteger(
    resultInfo.total_pages,
    'Role administration Worker custom-domain pagination',
  );
  if (page !== 1 || count !== domainResults.length || totalPages > 1) {
    throw new Error('Role administration Worker custom-domain pagination is incomplete.');
  }
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
}

async function listAccountZones({ accountId, apiToken, fetchImpl }) {
  const zones = [];
  const seenZoneIds = new Set();
  let expectedTotalPages;
  let page = 1;

  while (expectedTotalPages === undefined || page <= expectedTotalPages) {
    const zonesURL = new URL(`${CLOUDFLARE_API_ROOT}/zones`);
    zonesURL.searchParams.set('account.id', accountId);
    zonesURL.searchParams.set('type', ALL_ZONE_TYPES);
    zonesURL.searchParams.set('page', String(page));
    zonesURL.searchParams.set('per_page', String(ZONE_PAGE_SIZE));

    const payload = await cloudflareJson(
      zonesURL,
      apiToken,
      fetchImpl,
      `Cloudflare zone inventory page ${page}`,
    );
    const zoneResults = requiredArray(payload.result, `Cloudflare zone inventory page ${page}`);
    const resultInfo = requiredRecord(payload.result_info, `Cloudflare zone inventory page ${page} pagination`);
    const resultPage = requiredPositiveInteger(resultInfo.page, `Cloudflare zone inventory page ${page} pagination`);
    const totalPages = requiredPositiveInteger(
      resultInfo.total_pages,
      `Cloudflare zone inventory page ${page} pagination`,
    );
    if (resultPage !== page || totalPages < page) {
      throw new Error(`Cloudflare zone inventory page ${page} pagination is invalid.`);
    }
    if (expectedTotalPages === undefined) {
      expectedTotalPages = totalPages;
    } else if (expectedTotalPages !== totalPages) {
      throw new Error('Cloudflare zone inventory pagination changed during verification.');
    }

    for (const candidate of zoneResults) {
      const zone = requiredRecord(candidate, `Cloudflare zone inventory page ${page}`);
      const zoneId = requiredValue(zone.id, `Cloudflare zone inventory page ${page} zone id`);
      const account = requiredRecord(zone.account, `Cloudflare zone inventory page ${page} zone account`);
      if (account.id !== accountId || seenZoneIds.has(zoneId)) {
        throw new Error(`Cloudflare zone inventory page ${page} response is invalid.`);
      }
      seenZoneIds.add(zoneId);
      zones.push(Object.freeze({ id: zoneId }));
    }

    page += 1;
  }

  return Object.freeze(zones);
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

function requiredPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredNonNegativeInteger(value, label) {
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
    `Reference role administration ingress verified: workers.dev=${result.workersDevEnabled}, preview URLs=${result.previewUrlsEnabled}, custom domains=${result.customDomainCount}, Worker routes=${result.routeCount}, checked zones=${result.checkedZoneCount}.`,
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

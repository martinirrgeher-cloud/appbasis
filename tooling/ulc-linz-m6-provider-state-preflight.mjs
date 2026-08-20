import { pathToFileURL } from "node:url";

import {
  ULC_LINZ_M6_MAX_NEON_PROJECT_INVENTORY,
  ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT,
  evaluateUlcLinzM6FirstProviderWritePreflight,
} from "./ulc-linz-m6-first-provider-write-preflight.mjs";

const NEON_API_ROOT = "https://console.neon.tech/api/v2";
const CLOUDFLARE_API_ROOT = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 15_000;
const EVIDENCE_WINDOW_MS = 15 * 60 * 1000;
const NEON_PROJECT_PAGE_LIMIT = 400;
const MAX_NEON_PROJECT_PAGES = 25;
const TARGET_NEON_REGION =
  ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT.firstProviderWrite.region;
const TARGET_CLOUDFLARE_WORKER =
  ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT.cloudflareWorkerCreation.workerName;

if (
  NEON_PROJECT_PAGE_LIMIT * MAX_NEON_PROJECT_PAGES !==
  ULC_LINZ_M6_MAX_NEON_PROJECT_INVENTORY
) {
  throw new Error("ULC Linz M6 Neon inventory limits drifted.");
}

export const ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD =
  "neon-api-v2-project-create-region-id";

export const ULC_LINZ_M6_READ_ONLY_PROVIDER_PREFLIGHT_CONTRACT = deepFreeze({
  schemaVersion: 1,
  application: "ulc-linz",
  environment: "production",
  readOnly: true,
  allowedHttpMethods: ["GET"],
  neon: {
    projectsEndpoint: "/projects",
    regionsEndpoint: "/regions",
    projectPageLimit: NEON_PROJECT_PAGE_LIMIT,
    maxProjectPages: MAX_NEON_PROJECT_PAGES,
    maxProjectInventory: ULC_LINZ_M6_MAX_NEON_PROJECT_INVENTORY,
    completeInventoryRequired: true,
    organizationScopedRegionInventoryRequired: true,
    targetRegion: TARGET_NEON_REGION,
    selectedCreateMethod: ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD,
  },
  cloudflare: {
    workersEndpoint: "/accounts/{accountId}/workers/scripts",
    completeInventoryRequired: true,
    targetWorkerName: TARGET_CLOUDFLARE_WORKER,
    existingProductionCandidateAllowed: false,
  },
  providerWriteAllowed: false,
});

export class UlcLinzM6ProviderStatePreflightError extends Error {
  constructor(code) {
    super("ULC Linz M6 read-only provider-state preflight failed.");
    this.name = "UlcLinzM6ProviderStatePreflightError";
    this.code = code;
  }
}

export async function runUlcLinzM6ProviderStatePreflight(
  {
    neonApiKey,
    neonCreateOrgId,
    cloudflareApiToken,
    cloudflareAccountId,
    selectedNeonCreateMethod,
  },
  { fetchImpl = fetch, now = new Date() } = {},
) {
  const nowDate = requiredDate(now);
  const safeNeonApiKey = requiredCredential(neonApiKey, "NEON_API_KEY_REQUIRED");
  const safeNeonOrgId = requiredNeonOrgId(neonCreateOrgId);
  const safeCloudflareApiToken = requiredCredential(
    cloudflareApiToken,
    "CLOUDFLARE_API_TOKEN_REQUIRED",
  );
  const safeCloudflareAccountId = requiredCloudflareAccountId(cloudflareAccountId);
  if (selectedNeonCreateMethod !== ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD) {
    fail("UNSUPPORTED_NEON_CREATE_METHOD");
  }
  if (typeof fetchImpl !== "function") fail("INVALID_FETCH_IMPLEMENTATION");

  const neonProjects = await readCompleteNeonProjectInventory({
    apiKey: safeNeonApiKey,
    orgId: safeNeonOrgId,
    fetchImpl,
  });
  const neonRegions = await readNeonRegions({
    apiKey: safeNeonApiKey,
    orgId: safeNeonOrgId,
    fetchImpl,
  });
  const cloudflareWorkers = await readCloudflareWorkers({
    apiToken: safeCloudflareApiToken,
    accountId: safeCloudflareAccountId,
    fetchImpl,
  });

  if (cloudflareWorkers.some((name) => isUlcProductionCandidate(name))) {
    fail("EXISTING_CLOUDFLARE_WORKER_CANDIDATE");
  }

  const observedAt = nowDate.toISOString();
  const validUntilOrReviewAt = new Date(nowDate.getTime() + EVIDENCE_WINDOW_MS).toISOString();

  const evaluated = evaluateUlcLinzM6FirstProviderWritePreflight(
    {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      observedAt,
      validUntilOrReviewAt,
      source: "provider-api",
      neon: {
        inventoryComplete: true,
        inventoryMatchesSelectedCreateScope: true,
        projects: neonProjects,
        targetRegionAvailable: neonRegions.includes(TARGET_NEON_REGION),
        selectedCreateMethodSupportsExplicitRegion: true,
      },
    },
    { now: nowDate },
  );

  return deepFreeze({
    ...evaluated,
    readOnlyProviderStatePreflightVerified: true,
    cloudflareWorkerInventoryVerified: true,
    noExistingCloudflareWorkerCandidate: true,
  });
}

async function readCompleteNeonProjectInventory({ apiKey, orgId, fetchImpl }) {
  const projects = [];
  const seenCursors = new Set();
  let cursor;

  for (let page = 0; page < MAX_NEON_PROJECT_PAGES; page += 1) {
    const url = new URL(`${NEON_API_ROOT}/projects`);
    url.searchParams.set("org_id", orgId);
    url.searchParams.set("limit", String(NEON_PROJECT_PAGE_LIMIT));
    url.searchParams.set("timeout", "30000");
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);

    const body = await neonJson(url, apiKey, fetchImpl);
    const response = plainRecord(body, "NEON_PROJECT_INVENTORY_INVALID");
    const projectItems = plainArray(
      ownData(response, "projects", "NEON_PROJECT_INVENTORY_INVALID"),
      "NEON_PROJECT_INVENTORY_INVALID",
    );
    if (projectItems.length > NEON_PROJECT_PAGE_LIMIT) {
      fail("NEON_PROJECT_INVENTORY_INVALID");
    }

    const unavailable = Object.hasOwn(response, "unavailable_project_ids")
      ? plainArray(
          ownData(response, "unavailable_project_ids", "NEON_PROJECT_INVENTORY_INVALID"),
          "NEON_PROJECT_INVENTORY_INVALID",
        )
      : [];
    if (unavailable.length !== 0) fail("NEON_PROJECT_INVENTORY_INCOMPLETE");

    for (const item of projectItems) {
      const project = plainRecord(item, "NEON_PROJECT_INVENTORY_INVALID");
      projects.push({
        name: requiredProviderName(
          ownData(project, "name", "NEON_PROJECT_INVENTORY_INVALID"),
          "NEON_PROJECT_INVENTORY_INVALID",
        ),
        region: requiredRegion(
          ownData(project, "region_id", "NEON_PROJECT_INVENTORY_INVALID"),
        ),
      });
    }
    if (projects.length > ULC_LINZ_M6_MAX_NEON_PROJECT_INVENTORY) {
      fail("NEON_PROJECT_INVENTORY_TOO_LARGE");
    }

    const pageKind =
      projectItems.length < NEON_PROJECT_PAGE_LIMIT ? "short" : "full";
    if (
      !Object.hasOwn(response, "pagination") ||
      ownData(response, "pagination", "NEON_PROJECT_INVENTORY_INVALID") === null
    ) {
      if (pageKind === "short") return projects;
      fail("NEON_PROJECT_INVENTORY_INCOMPLETE");
    }

    const pagination = plainRecord(
      ownData(response, "pagination", "NEON_PROJECT_INVENTORY_INVALID"),
      "NEON_PROJECT_INVENTORY_INVALID",
    );
    const nextCursor = Object.hasOwn(pagination, "cursor")
      ? ownData(pagination, "cursor", "NEON_PROJECT_INVENTORY_INVALID")
      : undefined;

    if (nextCursor === null || nextCursor === undefined || nextCursor === "") {
      if (pageKind === "short") return projects;
      fail("NEON_PROJECT_INVENTORY_INCOMPLETE");
    }

    const safeCursor = requiredCursor(nextCursor);
    if (seenCursors.has(safeCursor)) fail("NEON_PROJECT_PAGINATION_LOOP");
    seenCursors.add(safeCursor);
    cursor = safeCursor;
  }

  fail("NEON_PROJECT_INVENTORY_TOO_LARGE");
}

async function readNeonRegions({ apiKey, orgId, fetchImpl }) {
  const url = new URL(`${NEON_API_ROOT}/regions`);
  url.searchParams.set("org_id", orgId);
  const body = await neonJson(url, apiKey, fetchImpl);
  const response = plainRecord(body, "NEON_REGION_INVENTORY_INVALID");
  const regions = plainArray(
    ownData(response, "regions", "NEON_REGION_INVENTORY_INVALID"),
    "NEON_REGION_INVENTORY_INVALID",
  );
  return regions.map((item) => {
    const region = plainRecord(item, "NEON_REGION_INVENTORY_INVALID");
    return requiredRegion(ownData(region, "id", "NEON_REGION_INVENTORY_INVALID"));
  });
}

async function readCloudflareWorkers({ apiToken, accountId, fetchImpl }) {
  const url = new URL(
    `${CLOUDFLARE_API_ROOT}/accounts/${encodeURIComponent(accountId)}/workers/scripts`,
  );
  const body = await providerJson(url, apiToken, fetchImpl, "CLOUDFLARE_API_ERROR");
  const response = plainRecord(body, "CLOUDFLARE_WORKER_INVENTORY_INVALID");
  if (ownData(response, "success", "CLOUDFLARE_WORKER_INVENTORY_INVALID") !== true) {
    fail("CLOUDFLARE_API_ERROR");
  }
  const workers = plainArray(
    ownData(response, "result", "CLOUDFLARE_WORKER_INVENTORY_INVALID"),
    "CLOUDFLARE_WORKER_INVENTORY_INVALID",
  );
  return workers.map((item) => {
    const worker = plainRecord(item, "CLOUDFLARE_WORKER_INVENTORY_INVALID");
    return requiredProviderName(
      ownData(worker, "id", "CLOUDFLARE_WORKER_INVENTORY_INVALID"),
      "CLOUDFLARE_WORKER_INVENTORY_INVALID",
    );
  });
}

async function neonJson(url, apiKey, fetchImpl) {
  return providerJson(url, apiKey, fetchImpl, "NEON_API_ERROR");
}

async function providerJson(url, bearerToken, fetchImpl, errorCode) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail(errorCode);
  }
  if (
    response === null ||
    typeof response !== "object" ||
    response.ok !== true ||
    typeof response.json !== "function"
  ) {
    fail(errorCode);
  }
  try {
    return await response.json();
  } catch {
    fail(errorCode);
  }
}

function isUlcProductionCandidate(name) {
  const normalized = name.toLowerCase();
  if (normalized === TARGET_CLOUDFLARE_WORKER) return true;
  if (normalized === "ulc-linz" || normalized === "appbasis-ulc-linz") return true;
  return (
    normalized.includes("ulc-linz") &&
    (normalized.includes("production") || /(?:^|-)prod(?:-|$)/.test(normalized))
  );
}

function ownData(record, key, code) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  ) {
    fail(code);
  }
  return descriptor.value;
}

function plainRecord(value, code) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(code);
  }
  return value;
}

function plainArray(value, code) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(code);
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail(code);
    }
  }
  return value;
}

function requiredProviderName(value, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(code);
  }
  return value;
}

function requiredRegion(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 100 ||
    value !== value.trim() ||
    !/^[a-z0-9-]+$/.test(value)
  ) {
    fail("NEON_REGION_INVENTORY_INVALID");
  }
  return value;
}

function requiredCursor(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 1024 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail("NEON_PROJECT_INVENTORY_INVALID");
  }
  return value;
}

function requiredCredential(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) fail(code);
  return value;
}

function requiredNeonOrgId(value) {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,60}$/.test(value)) {
    fail("NEON_ORG_ID_INVALID");
  }
  return value;
}

function requiredCloudflareAccountId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
    fail("CLOUDFLARE_ACCOUNT_ID_INVALID");
  }
  return value;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail("INVALID_CLOCK");
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6ProviderStatePreflightError(code);
}

async function main() {
  try {
    const result = await runUlcLinzM6ProviderStatePreflight({
      neonApiKey: process.env.NEON_API_KEY,
      neonCreateOrgId: process.env.NEON_ORG_ID,
      cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
      cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      selectedNeonCreateMethod: process.env.ULC_LINZ_M6_NEON_CREATE_METHOD,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const code =
      error instanceof UlcLinzM6ProviderStatePreflightError ||
      (error && typeof error === "object" && typeof error.code === "string")
        ? error.code
        : "PREFLIGHT_FAILED";
    console.error(`ULC Linz M6 provider-state preflight blocked: ${code}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
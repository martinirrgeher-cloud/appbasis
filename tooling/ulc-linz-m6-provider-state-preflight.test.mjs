import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD,
  ULC_LINZ_M6_READ_ONLY_PROVIDER_PREFLIGHT_CONTRACT,
  UlcLinzM6ProviderStatePreflightError,
  runUlcLinzM6ProviderStatePreflight,
  verifyUlcLinzM6CreatedNeonProjectRegion,
} from "./ulc-linz-m6-provider-state-preflight.mjs";

const NOW = new Date("2026-08-18T20:00:00.000Z");
const NEON_ORG_ID = "org-muddy-morning-22453865";
const CLOUDFLARE_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const NEON_API_KEY = "neon-test-key-never-return";
const CLOUDFLARE_API_TOKEN = "cloudflare-test-token-never-return";
const NEON_PROJECT_PAGE_LIMIT = 400;

function validInputs() {
  return {
    neonApiKey: NEON_API_KEY,
    neonCreateOrgId: NEON_ORG_ID,
    cloudflareApiToken: CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: CLOUDFLARE_ACCOUNT_ID,
    selectedNeonCreateMethod: ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD,
  };
}

function makeFetch({
  projects = [
    { name: "appbasis-m3-preview", region_id: "aws-us-east-2" },
    { name: "appbasis-reference-preview", region_id: "aws-us-east-1" },
  ],
  regions = [
    { id: "aws-us-east-1" },
    { id: "aws-eu-central-1" },
  ],
  regionStatus = 200,
  workers = [{ id: "appbasis-reference-preview" }],
  unavailableProjectIds = [],
  cloudflareSuccess = true,
} = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const href = String(url);
    requests.push({ href, init });
    if (href.startsWith("https://console.neon.tech/api/v2/projects")) {
      return jsonResponse({ projects, unavailable_project_ids: unavailableProjectIds });
    }
    if (href.startsWith("https://console.neon.tech/api/v2/regions")) {
      if (regionStatus === 404) return { ok: false, status: 404 };
      return jsonResponse({ regions });
    }
    if (href.includes("api.cloudflare.com/client/v4/accounts/")) {
      return jsonResponse({ success: cloudflareSuccess, result: workers });
    }
    throw new Error(`unexpected test URL: ${href}`);
  };
  return { fetchImpl, requests };
}

function fullProjectPage(prefix, region = "aws-us-east-1") {
  return Array.from({ length: NEON_PROJECT_PAGE_LIMIT }, (_, index) => ({
    name: `${prefix}-${index}`,
    region_id: region,
  }));
}

test("ULC M6 executable provider-state preflight performs only read-only provider GETs and remains blocked before the preparation gate", async () => {
  const { fetchImpl, requests } = makeFetch();
  const result = await runUlcLinzM6ProviderStatePreflight(validInputs(), {
    fetchImpl,
    now: NOW,
  });
  assert.equal(
    result.status,
    "provider-inventory-verified-blocked-before-production-preparation-gate",
  );
  assert.equal(result.readOnlyProviderStatePreflightVerified, true);
  assert.equal(result.cloudflareWorkerInventoryVerified, true);
  assert.equal(result.noExistingCloudflareWorkerCandidate, true);
  assert.equal(result.targetRegionAvailable, true);
  assert.equal(result.targetRegionVerificationDeferredUntilPostCreate, false);
  assert.equal(result.postCreateRegionVerificationRequired, true);
  assert.equal(result.productionPreparationGateEvidenceConsumed, false);
  assert.equal(result.productionPreparationEligible, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.publicExposureAllowed, false);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.explicitApprovalRequired, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.init.method, "GET");
    assert.equal(Object.hasOwn(request.init, "body"), false);
  }
  const neonProjectsRequest = new URL(requests[0].href);
  assert.equal(neonProjectsRequest.searchParams.get("org_id"), NEON_ORG_ID);
  assert.equal(neonProjectsRequest.searchParams.get("limit"), "400");
  assert.equal(neonProjectsRequest.searchParams.get("timeout"), "30000");
  const neonRegionsRequest = new URL(requests[1].href);
  assert.equal(neonRegionsRequest.searchParams.get("org_id"), NEON_ORG_ID);
  assert.equal(
    requests[2].href,
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts`,
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(NEON_API_KEY), false);
  assert.equal(serialized.includes(CLOUDFLARE_API_TOKEN), false);
  assert.equal(serialized.includes(NEON_ORG_ID), false);
  assert.equal(serialized.includes(CLOUDFLARE_ACCOUNT_ID), false);
});

test("ULC M6 provider-state preflight defers region verification on Neon /regions 404 without authorizing a write", async () => {
  const { fetchImpl } = makeFetch({ regionStatus: 404 });
  const result = await runUlcLinzM6ProviderStatePreflight(validInputs(), {
    fetchImpl,
    now: NOW,
  });
  assert.equal(result.providerInventoryVerified, true);
  assert.equal(result.targetRegionAvailable, false);
  assert.equal(result.targetRegionVerificationDeferredUntilPostCreate, true);
  assert.equal(result.postCreateRegionVerificationRequired, true);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.executionAuthorized, false);
});

test("ULC M6 read-only provider contract pins authoritative inventory and mandatory post-create region verification", async () => {
  assert.deepEqual(ULC_LINZ_M6_READ_ONLY_PROVIDER_PREFLIGHT_CONTRACT, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    readOnly: true,
    allowedHttpMethods: ["GET"],
    neon: {
      projectsEndpoint: "/projects",
      regionsEndpoint: "/regions",
      projectPageLimit: 400,
      maxProjectPages: 25,
      maxProjectInventory: 10000,
      completeInventoryRequired: true,
      organizationScopedRegionInventoryRequired: false,
      regionInventoryNotFoundMayDeferVerification: true,
      postCreateRegionVerificationRequired: true,
      targetRegion: "aws-eu-central-1",
      selectedCreateMethod: "neon-api-v2-project-create-region-id",
    },
    cloudflare: {
      workersEndpoint: "/accounts/{accountId}/workers/scripts",
      completeInventoryRequired: true,
      targetWorkerName: "appbasis-ulc-linz-production",
      existingProductionCandidateAllowed: false,
    },
    providerWriteAllowed: false,
  });
  const source = await readFile(
    new URL("./ulc-linz-m6-provider-state-preflight.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(source), false);
  assert.equal(source.includes('method: "GET"'), true);
});

test("ULC M6 post-create verifier permits only the exact Frankfurt region", () => {
  const verified = verifyUlcLinzM6CreatedNeonProjectRegion({
    id: "project-redacted",
    region_id: "aws-eu-central-1",
  });
  assert.equal(verified.postCreateRegionVerified, true);
  assert.equal(verified.continuationAllowed, true);
  assert.equal(verified.expectedRegion, "aws-eu-central-1");
  assert.equal(verified.observedRegion, "aws-eu-central-1");
  assert.equal(Object.isFrozen(verified), true);

  assert.throws(
    () => verifyUlcLinzM6CreatedNeonProjectRegion({ region_id: "aws-us-east-1" }),
    errorWithCode("CREATED_NEON_PROJECT_REGION_MISMATCH", true),
  );
  assert.throws(
    () => verifyUlcLinzM6CreatedNeonProjectRegion({ id: "missing-region" }),
    errorWithCode("CREATED_NEON_PROJECT_INVALID", true),
  );
});

test("ULC M6 executable provider-state preflight follows Neon cursor pagination only after a full project page", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(String(url));
    requests.push({ href: parsed.href, init });
    if (parsed.pathname.endsWith("/projects")) {
      if (parsed.searchParams.get("cursor") === null) {
        return jsonResponse({
          projects: fullProjectPage("preview-first-page"),
          unavailable_project_ids: [],
          pagination: { cursor: "next-page" },
        });
      }
      assert.equal(parsed.searchParams.get("cursor"), "next-page");
      return jsonResponse({
        projects: [{ name: "appbasis-ulc-linz-production", region_id: "aws-eu-central-1" }],
        unavailable_project_ids: [],
        pagination: { cursor: "terminal-cursor" },
      });
    }
    if (parsed.pathname.endsWith("/regions")) {
      return jsonResponse({ regions: [{ id: "aws-eu-central-1" }] });
    }
    return jsonResponse({ success: true, result: [] });
  };
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("EXISTING_PRODUCTION_RESOURCE_CANDIDATE"),
  );
  assert.equal(
    requests.filter((request) => new URL(request.href).pathname.endsWith("/projects")).length,
    2,
  );
});

test("ULC M6 executable provider-state preflight treats a short Neon page as terminal even when pagination.cursor is present", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(String(url));
    requests.push({ href: parsed.href, init });
    if (parsed.pathname.endsWith("/projects")) {
      assert.equal(parsed.searchParams.get("cursor"), null);
      return jsonResponse({
        projects: [{ name: "appbasis-m3-preview", region_id: "aws-us-east-2" }],
        unavailable_project_ids: [],
        pagination: { cursor: "provider-terminal-cursor" },
      });
    }
    if (parsed.pathname.endsWith("/regions")) {
      return jsonResponse({ regions: [{ id: "aws-eu-central-1" }] });
    }
    if (parsed.pathname.endsWith("/workers/scripts")) {
      return jsonResponse({ success: true, result: [] });
    }
    throw new Error(`unexpected test URL: ${parsed.href}`);
  };

  const result = await runUlcLinzM6ProviderStatePreflight(validInputs(), {
    fetchImpl,
    now: NOW,
  });

  assert.equal(result.readOnlyProviderStatePreflightVerified, true);
  assert.equal(
    requests.filter((request) => new URL(request.href).pathname.endsWith("/projects")).length,
    1,
  );
});

test("ULC M6 executable provider-state preflight fails closed when Neon reports an incomplete project inventory", async () => {
  const { fetchImpl } = makeFetch({ unavailableProjectIds: ["unavailable-project"] });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("NEON_PROJECT_INVENTORY_INCOMPLETE", true),
  );
});

test("ULC M6 executable provider-state preflight fails closed when Frankfurt is explicitly unavailable", async () => {
  const { fetchImpl } = makeFetch({ regions: [{ id: "aws-us-east-1" }] });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("NEON_PREFLIGHT_INVALID"),
  );
});

test("ULC M6 executable provider-state preflight binds Neon /regions entries to provider field id and rejects project-style region_id", async () => {
  const { fetchImpl } = makeFetch({ regions: [{ region_id: "aws-eu-central-1" }] });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("NEON_REGION_INVENTORY_INVALID", true),
  );
});

test("ULC M6 executable provider-state preflight rejects any colliding Cloudflare production worker", async () => {
  const { fetchImpl } = makeFetch({ workers: [{ id: "legacy-ulc-linz-prod-worker" }] });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("EXISTING_CLOUDFLARE_WORKER_CANDIDATE", true),
  );
});

test("ULC M6 executable provider-state preflight fails closed on Cloudflare inventory/API anomalies", async () => {
  const invalidEnvelope = makeFetch({ cloudflareSuccess: false });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), {
      fetchImpl: invalidEnvelope.fetchImpl,
      now: NOW,
    }),
    errorWithCode("CLOUDFLARE_API_ERROR", true),
  );
  const missingWorkerId = makeFetch({ workers: [{}] });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), {
      fetchImpl: missingWorkerId.fetchImpl,
      now: NOW,
    }),
    errorWithCode("CLOUDFLARE_WORKER_INVENTORY_INVALID", true),
  );
});

test("ULC M6 executable provider-state preflight rejects create mechanisms that do not prove explicit region selection before any provider read", async () => {
  const { fetchImpl, requests } = makeFetch();
  const inputs = validInputs();
  inputs.selectedNeonCreateMethod = "connector-default-region";
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(inputs, { fetchImpl, now: NOW }),
    errorWithCode("UNSUPPORTED_NEON_CREATE_METHOD", true),
  );
  assert.equal(requests.length, 0);
});

test("ULC M6 executable provider-state preflight rejects repeated Neon cursors on full pages instead of looping", async () => {
  let projectCalls = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/projects")) {
      projectCalls += 1;
      return jsonResponse({
        projects: fullProjectPage(`preview-page-${projectCalls}`),
        unavailable_project_ids: [],
        pagination: { cursor: "same-cursor" },
      });
    }
    throw new Error("later provider reads must not run after pagination failure");
  };
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("NEON_PROJECT_PAGINATION_LOOP", true),
  );
  assert.equal(projectCalls, 2);
});

test("ULC M6 executable provider-state preflight does not leak provider credentials when a provider read fails", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    async json() { return { error: `Bearer ${NEON_API_KEY}` }; },
  });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    (error) => {
      assert.equal(error instanceof UlcLinzM6ProviderStatePreflightError, true);
      assert.equal(error.code, "NEON_API_ERROR");
      assert.equal(String(error).includes(NEON_API_KEY), false);
      assert.equal(String(error).includes(CLOUDFLARE_API_TOKEN), false);
      return true;
    },
  );
});

test("ULC M6 executable provider-state preflight rejects accessor-backed provider inventory values", async () => {
  const project = { region_id: "aws-us-east-1" };
  Object.defineProperty(project, "name", {
    enumerable: true,
    get() { throw new Error("must not execute provider-controlled accessor"); },
  });
  const { fetchImpl } = makeFetch({ projects: [project] });
  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    errorWithCode("NEON_PROJECT_INVENTORY_INVALID", true),
  );
});

function jsonResponse(value) {
  return { ok: true, status: 200, async json() { return value; } };
}

function errorWithCode(code, requireProviderStateError = false) {
  return (error) => {
    if (requireProviderStateError) {
      assert.equal(error instanceof UlcLinzM6ProviderStatePreflightError, true);
    }
    assert.equal(error?.code, code);
    return true;
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  ULC_LINZ_M6_MAX_NEON_PROJECT_INVENTORY,
  evaluateUlcLinzM6FirstProviderWritePreflight,
} from "./ulc-linz-m6-first-provider-write-preflight.mjs";
import {
  ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD,
  UlcLinzM6ProviderStatePreflightError,
  runUlcLinzM6ProviderStatePreflight,
} from "./ulc-linz-m6-provider-state-preflight.mjs";
import {
  createUlcLinzM6ExecutionBoundPlanFingerprint,
  evaluateUlcLinzM6MigrationSmokeRehearsal,
} from "./ulc-linz-m6-migration-smoke-rehearsal.mjs";

const NOW = new Date("2026-08-20T10:30:00.000Z");

function validInputs() {
  return {
    neonApiKey: "neon-test-key",
    neonCreateOrgId: "org-test-123",
    cloudflareApiToken: "cloudflare-test-token",
    cloudflareAccountId: "0123456789abcdef0123456789abcdef",
    selectedNeonCreateMethod: ULC_LINZ_M6_NEON_EXPLICIT_REGION_CREATE_METHOD,
  };
}

function jsonResponse(value) {
  return { ok: true, async json() { return value; } };
}

function regionsResponse() {
  return jsonResponse({ regions: [{ id: "aws-eu-central-1" }] });
}

function workersResponse() {
  return jsonResponse({ success: true, result: [] });
}

function cleanProjects(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    name: `unrelated-preview-${offset + index}`,
    region_id: "aws-us-east-1",
  }));
}

test("M6 Neon inventory fails closed when a full page omits pagination", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/projects")) {
      return jsonResponse({ projects: cleanProjects(400), unavailable_project_ids: [] });
    }
    throw new Error("later provider reads must not run");
  };

  await assert.rejects(
    runUlcLinzM6ProviderStatePreflight(validInputs(), { fetchImpl, now: NOW }),
    (error) => {
      assert.equal(error instanceof UlcLinzM6ProviderStatePreflightError, true);
      assert.equal(error.code, "NEON_PROJECT_INVENTORY_INCOMPLETE");
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("M6 Neon inventory accepts terminal empty and null cursor sentinels only on a short page", async () => {
  for (const terminalCursor of ["", null]) {
    const fetchImpl = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/projects")) {
        return jsonResponse({
          projects: cleanProjects(2),
          unavailable_project_ids: [],
          pagination: { cursor: terminalCursor },
        });
      }
      if (parsed.pathname.endsWith("/regions")) return regionsResponse();
      return workersResponse();
    };
    const result = await runUlcLinzM6ProviderStatePreflight(validInputs(), {
      fetchImpl,
      now: NOW,
    });
    assert.equal(result.readOnlyProviderStatePreflightVerified, true);
  }
});

test("M6 Neon inventory follows multiple pages and accepts a complete aggregate larger than 400", async () => {
  let projectCalls = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/projects")) {
      projectCalls += 1;
      if (projectCalls === 1) {
        return jsonResponse({
          projects: cleanProjects(400),
          unavailable_project_ids: [],
          pagination: { cursor: "page-2" },
        });
      }
      assert.equal(parsed.searchParams.get("cursor"), "page-2");
      return jsonResponse({
        projects: cleanProjects(3, 400),
        unavailable_project_ids: [],
        pagination: { cursor: "" },
      });
    }
    if (parsed.pathname.endsWith("/regions")) return regionsResponse();
    return workersResponse();
  };

  const result = await runUlcLinzM6ProviderStatePreflight(validInputs(), {
    fetchImpl,
    now: NOW,
  });
  assert.equal(projectCalls, 2);
  assert.equal(result.providerInventoryVerified, true);
});

test("M6 first-provider evaluator uses the aggregate pagination bound rather than one page", () => {
  assert.equal(ULC_LINZ_M6_MAX_NEON_PROJECT_INVENTORY, 10_000);
  const evidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-20T10:29:00.000Z",
    validUntilOrReviewAt: "2026-08-20T10:40:00.000Z",
    source: "provider-api",
    neon: {
      inventoryComplete: true,
      inventoryMatchesSelectedCreateScope: true,
      projects: Array.from({ length: 401 }, (_, index) => ({
        name: `other-app-${index}`,
        region: "aws-us-east-1",
      })),
      targetRegionAvailable: true,
      selectedCreateMethodSupportsExplicitRegion: true,
    },
  };
  const result = evaluateUlcLinzM6FirstProviderWritePreflight(evidence, { now: NOW });
  assert.equal(result.providerInventoryVerified, true);
});

test("M6 execution-bound migration fingerprint changes for every validated non-migration input class", async () => {
  const result = await evaluateUlcLinzM6MigrationSmokeRehearsal();
  const baseline = result.migration.planFingerprint;
  assert.match(baseline, /^sha256:[0-9a-f]{64}$/);
  const migrationFiles = result.migration.files;
  const inputs = result.validatedInputDigests;
  for (const key of Object.keys(inputs)) {
    const changedInputs = structuredClone(inputs);
    if (typeof changedInputs[key] === "string") {
      changedInputs[key] = `sha256:${"f".repeat(64)}`;
    } else {
      changedInputs[key].digest = `sha256:${"f".repeat(64)}`;
    }
    const changed = createUlcLinzM6ExecutionBoundPlanFingerprint({
      migrationFiles,
      validatedInputDigests: changedInputs,
    });
    assert.notEqual(changed, baseline, `fingerprint must bind ${key}`);
  }
});

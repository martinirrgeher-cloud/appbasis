import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzPrivateRuntimeHyperdriveBindings,
  evaluateUlcLinzPrivateRuntimeRefreshState,
  verifyUlcLinzPrivateRuntimeVersionBindings,
} from "./ulc-linz-m6-private-runtime-refresh.mjs";

const OLD_SHA = "a".repeat(40);
const CURRENT_SHA = "b".repeat(40);
const HMAC = "c".repeat(64);
const PILOT_ORIGIN_HMAC = "d".repeat(64);
const OLD_VERSION = "12345678-1234-4123-8123-123456789abc";
const CURRENT_VERSION = "87654321-4321-4123-8123-cba987654321";
const LEGACY_BASE_URL = "https://app.ulc-linz.at";
const PILOT_BASE_URL = "https://appbasis-ulc-linz-production.example.workers.dev";

function message(sha, hmac = HMAC, originHmac = null) {
  return `AppBasis ulc-linz production runtime ${sha} auth-hmac:${hmac}${originHmac === null ? "" : ` origin-hmac:${originHmac}`}`;
}

function version(id, sha, hmac = HMAC, originHmac = null) {
  return {
    id,
    annotations: {
      "workers/tag": "ulc-linz-production-runtime-v1",
      "workers/message": message(sha, hmac, originHmac),
    },
  };
}

function workerResponse() {
  return {
    success: true,
    result: {
      name: "appbasis-ulc-linz-production",
      subdomain: { enabled: false, previews_enabled: false },
      references: { domains: [] },
      deployed_on: "2026-08-23T12:00:00.000Z",
    },
  };
}

function scriptsResponse(routes = []) {
  return {
    success: true,
    result: [{ id: "appbasis-ulc-linz-production", routes }],
  };
}

function versionsResponse({ includeCurrent = false, oldHmac = HMAC, currentOriginHmac = PILOT_ORIGIN_HMAC } = {}) {
  return {
    success: true,
    result: [
      version(OLD_VERSION, OLD_SHA, oldHmac),
      ...(includeCurrent ? [version(CURRENT_VERSION, CURRENT_SHA, HMAC, currentOriginHmac)] : []),
    ],
  };
}

function deployment(versionId, percentage = 100) {
  return { versions: [{ version_id: versionId, percentage }] };
}

function deploymentsResponse(versionId = OLD_VERSION, percentage = 100) {
  return {
    success: true,
    result: {
      deployments: [deployment(versionId, percentage)],
    },
  };
}

function deploymentHistory(...deployments) {
  return { success: true, result: { deployments } };
}

function input(overrides = {}) {
  return {
    workerResponse: workerResponse(),
    versionsResponse: versionsResponse(),
    deploymentsResponse: deploymentsResponse(),
    scriptsResponse: scriptsResponse(),
    githubSha: CURRENT_SHA,
    authSecretFingerprint: HMAC,
    pilotOriginFingerprint: PILOT_ORIGIN_HMAC,
    ...overrides,
  };
}

function bindingResponse(versionId = CURRENT_VERSION, baseURL = LEGACY_BASE_URL) {
  return {
    success: true,
    result: {
      id: versionId,
      resources: {
        bindings: [
          { name: "APPBASIS_BASE_URL", type: "plain_text", text: baseURL },
          { name: "HYPERDRIVE", type: "hyperdrive", id: "app-hyperdrive" },
          { name: "SECURITY_LOG_HYPERDRIVE", type: "hyperdrive", id: "security-hyperdrive" },
          { name: "BETTER_AUTH_SECRET", type: "secret_text" },
        ],
      },
    },
  };
}

test("refresh upload state accepts one trusted historical private deployment and requests a current pilot-origin upload", () => {
  assert.deepEqual(evaluateUlcLinzPrivateRuntimeRefreshState(input()), {
    currentVersionId: null,
    deployedVersionId: OLD_VERSION,
    currentDeployment: false,
    uploadRequired: true,
    deploymentRequired: false,
  });
});

test("refresh does not confuse an exact-head legacy-origin version with the pilot-origin current version", () => {
  const legacyExactHead = versionsResponse();
  legacyExactHead.result.push(version(CURRENT_VERSION, CURRENT_SHA));
  const result = evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: legacyExactHead }));
  assert.equal(result.currentVersionId, null);
  assert.equal(result.uploadRequired, true);
});

test("refresh deploy state requires one current pilot-origin version and preserves the historical deployment until explicit deploy approval", () => {
  const result = evaluateUlcLinzPrivateRuntimeRefreshState(
    input({ versionsResponse: versionsResponse({ includeCurrent: true }) }),
    { requireCurrentVersion: true },
  );
  assert.deepEqual(result, {
    currentVersionId: CURRENT_VERSION,
    deployedVersionId: OLD_VERSION,
    currentDeployment: false,
    uploadRequired: false,
    deploymentRequired: true,
  });
});

test("refresh state is idempotent once the exact current runtime is privately deployed", () => {
  const current = input({
    versionsResponse: versionsResponse({ includeCurrent: true }),
    deploymentsResponse: deploymentsResponse(CURRENT_VERSION),
  });
  const result = evaluateUlcLinzPrivateRuntimeRefreshState(current, {
    requireCurrentVersion: true,
    requireCurrentDeployment: true,
  });
  assert.equal(result.currentDeployment, true);
  assert.equal(result.uploadRequired, false);
  assert.equal(result.deploymentRequired, false);
});

test("refresh treats the first Cloudflare deployment as active and ignores later history", () => {
  const result = evaluateUlcLinzPrivateRuntimeRefreshState(
    input({
      versionsResponse: versionsResponse({ includeCurrent: true }),
      deploymentsResponse: deploymentHistory(
        deployment(CURRENT_VERSION),
        deployment(OLD_VERSION),
      ),
    }),
    { requireCurrentVersion: true, requireCurrentDeployment: true },
  );
  assert.equal(result.deployedVersionId, CURRENT_VERSION);
  assert.equal(result.currentDeployment, true);
});

test("refresh never lets a later matching history entry hide an active deployment drift", () => {
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(
      input({
        versionsResponse: versionsResponse({ includeCurrent: true }),
        deploymentsResponse: deploymentHistory(
          deployment(OLD_VERSION),
          deployment(CURRENT_VERSION),
        ),
      }),
      { requireCurrentVersion: true, requireCurrentDeployment: true },
    ),
    /current main runtime to be the sole deployed version/,
  );
});

test("refresh fails closed on malformed or split active deployment history", () => {
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({
      deploymentsResponse: deploymentHistory(null, deployment(OLD_VERSION)),
    })),
    /invalid deployment/,
  );
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({
      deploymentsResponse: deploymentsResponse(OLD_VERSION, 50),
    })),
    /does not route 100% to one version/,
  );
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({
      deploymentsResponse: deploymentHistory({ versions: [
        { version_id: OLD_VERSION, percentage: 50 },
        { version_id: CURRENT_VERSION, percentage: 50 },
      ] }),
    })),
    /not a single-version deployment/,
  );
});

test("refresh fails closed on public ingress, untrusted history, auth-secret drift and pilot-origin drift", () => {
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ scriptsResponse: scriptsResponse(["example.com/*"]) })),
    /public routes/,
  );
  const badHistory = versionsResponse();
  badHistory.result[0].annotations["workers/tag"] = "unexpected";
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: badHistory })),
    /unrecognized version/,
  );
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: versionsResponse({ oldHmac: "e".repeat(64) }) })),
    /current auth-secret fingerprint/,
  );
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(
      input({ versionsResponse: versionsResponse({ includeCurrent: true, currentOriginHmac: "f".repeat(64) }) }),
      { requireCurrentVersion: true },
    ),
    /current main, auth secret and pilot origin/,
  );
});

test("refresh fails closed when the current version is missing or duplicated at the deploy gate", () => {
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input(), { requireCurrentVersion: true }),
    /exactly one version bound to current main/,
  );
  const duplicate = versionsResponse({ includeCurrent: true });
  duplicate.result.push(version("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CURRENT_SHA, HMAC, PILOT_ORIGIN_HMAC));
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: duplicate })),
    /duplicate current runtime versions/,
  );
});

test("refresh derives Hyperdrive IDs from only the approved legacy-to-pilot origin transition", () => {
  const expected = {
    applicationHyperdriveId: "app-hyperdrive",
    securityLogHyperdriveId: "security-hyperdrive",
  };
  assert.deepEqual(
    deriveUlcLinzPrivateRuntimeHyperdriveBindings(bindingResponse(OLD_VERSION), {
      versionId: OLD_VERSION,
      expectedBaseURL: LEGACY_BASE_URL,
      alternateBaseURL: PILOT_BASE_URL,
    }),
    expected,
  );
  assert.deepEqual(
    deriveUlcLinzPrivateRuntimeHyperdriveBindings(
      bindingResponse(CURRENT_VERSION, PILOT_BASE_URL),
      {
        versionId: CURRENT_VERSION,
        expectedBaseURL: LEGACY_BASE_URL,
        alternateBaseURL: PILOT_BASE_URL,
      },
    ),
    expected,
  );

  assert.throws(
    () => deriveUlcLinzPrivateRuntimeHyperdriveBindings(
      bindingResponse(CURRENT_VERSION, "https://unexpected.example.com"),
      {
        versionId: CURRENT_VERSION,
        expectedBaseURL: LEGACY_BASE_URL,
        alternateBaseURL: PILOT_BASE_URL,
      },
    ),
    /bindings drifted/,
  );

  const duplicate = bindingResponse(OLD_VERSION);
  duplicate.result.resources.bindings[2].id = "app-hyperdrive";
  assert.throws(
    () => deriveUlcLinzPrivateRuntimeHyperdriveBindings(duplicate, {
      versionId: OLD_VERSION,
      expectedBaseURL: LEGACY_BASE_URL,
      alternateBaseURL: PILOT_BASE_URL,
    }),
    /bindings drifted/,
  );

  const extra = bindingResponse(OLD_VERSION);
  extra.result.resources.bindings.push({ name: "FUTURE", type: "plain_text", text: "x" });
  assert.throws(
    () => deriveUlcLinzPrivateRuntimeHyperdriveBindings(extra, {
      versionId: OLD_VERSION,
      expectedBaseURL: LEGACY_BASE_URL,
      alternateBaseURL: PILOT_BASE_URL,
    }),
    /binding inventory is invalid/,
  );
});

test("refresh verifies the exact four approved current-version bindings including pilot origin", () => {
  const response = bindingResponse(CURRENT_VERSION, PILOT_BASE_URL);
  assert.equal(
    verifyUlcLinzPrivateRuntimeVersionBindings(response, {
      versionId: CURRENT_VERSION,
      applicationHyperdriveId: "app-hyperdrive",
      securityLogHyperdriveId: "security-hyperdrive",
      expectedBaseURL: PILOT_BASE_URL,
    }),
    true,
  );

  const wrongOrigin = bindingResponse(CURRENT_VERSION, LEGACY_BASE_URL);
  assert.throws(
    () => verifyUlcLinzPrivateRuntimeVersionBindings(wrongOrigin, {
      versionId: CURRENT_VERSION,
      applicationHyperdriveId: "app-hyperdrive",
      securityLogHyperdriveId: "security-hyperdrive",
      expectedBaseURL: PILOT_BASE_URL,
    }),
    /bindings drifted/,
  );

  const drift = structuredClone(response);
  drift.result.resources.bindings[1].id = "wrong-hyperdrive";
  assert.throws(
    () => verifyUlcLinzPrivateRuntimeVersionBindings(drift, {
      versionId: CURRENT_VERSION,
      applicationHyperdriveId: "app-hyperdrive",
      securityLogHyperdriveId: "security-hyperdrive",
      expectedBaseURL: PILOT_BASE_URL,
    }),
    /bindings drifted/,
  );
});

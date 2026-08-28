import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUlcLinzPrivateRuntimeRefreshState,
  verifyUlcLinzPrivateRuntimeVersionBindings,
} from "./ulc-linz-m6-private-runtime-refresh.mjs";

const OLD_SHA = "a".repeat(40);
const CURRENT_SHA = "b".repeat(40);
const HMAC = "c".repeat(64);
const OLD_VERSION = "12345678-1234-4123-8123-123456789abc";
const CURRENT_VERSION = "87654321-4321-4123-8123-cba987654321";

function message(sha, hmac = HMAC) {
  return `AppBasis ulc-linz production runtime ${sha} auth-hmac:${hmac}`;
}

function version(id, sha, hmac = HMAC) {
  return {
    id,
    annotations: {
      "workers/tag": "ulc-linz-production-runtime-v1",
      "workers/message": message(sha, hmac),
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

function versionsResponse({ includeCurrent = false, oldHmac = HMAC } = {}) {
  return {
    success: true,
    result: [
      version(OLD_VERSION, OLD_SHA, oldHmac),
      ...(includeCurrent ? [version(CURRENT_VERSION, CURRENT_SHA)] : []),
    ],
  };
}

function deploymentsResponse(versionId = OLD_VERSION, percentage = 100) {
  return {
    success: true,
    result: { deployments: [{ versions: [{ version_id: versionId, percentage }] }] },
  };
}

function input(overrides = {}) {
  return {
    workerResponse: workerResponse(),
    versionsResponse: versionsResponse(),
    deploymentsResponse: deploymentsResponse(),
    scriptsResponse: scriptsResponse(),
    githubSha: CURRENT_SHA,
    authSecretFingerprint: HMAC,
    ...overrides,
  };
}

test("refresh upload state accepts one trusted historical private deployment and requests a current upload", () => {
  assert.deepEqual(evaluateUlcLinzPrivateRuntimeRefreshState(input()), {
    currentVersionId: null,
    deployedVersionId: OLD_VERSION,
    currentDeployment: false,
    uploadRequired: true,
    deploymentRequired: false,
  });
});

test("refresh deploy state requires one current version and preserves the historical deployment until explicit deploy approval", () => {
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

test("refresh fails closed on public ingress, split deployments, untrusted history and auth-secret drift", () => {
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ scriptsResponse: scriptsResponse(["example.com/*"]) })),
    /public routes/,
  );
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ deploymentsResponse: deploymentsResponse(OLD_VERSION, 50) })),
    /exactly one 100% private deployment/,
  );
  const badHistory = versionsResponse();
  badHistory.result[0].annotations["workers/tag"] = "unexpected";
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: badHistory })),
    /unrecognized version/,
  );
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: versionsResponse({ oldHmac: "d".repeat(64) }) })),
    /current auth-secret fingerprint/,
  );
});

test("refresh fails closed when the current version is missing or duplicated at the deploy gate", () => {
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input(), { requireCurrentVersion: true }),
    /exactly one version bound to current main/,
  );
  const duplicate = versionsResponse({ includeCurrent: true });
  duplicate.result.push(version("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CURRENT_SHA));
  assert.throws(
    () => evaluateUlcLinzPrivateRuntimeRefreshState(input({ versionsResponse: duplicate })),
    /duplicate current runtime versions/,
  );
});

test("refresh verifies the exact four approved current-version bindings", () => {
  const response = {
    success: true,
    result: {
      id: CURRENT_VERSION,
      resources: {
        bindings: [
          { name: "APPBASIS_BASE_URL", type: "plain_text", text: "https://app.ulc-linz.at" },
          { name: "HYPERDRIVE", type: "hyperdrive", id: "app-hyperdrive" },
          { name: "SECURITY_LOG_HYPERDRIVE", type: "hyperdrive", id: "security-hyperdrive" },
          { name: "BETTER_AUTH_SECRET", type: "secret_text" },
        ],
      },
    },
  };
  assert.equal(
    verifyUlcLinzPrivateRuntimeVersionBindings(response, {
      versionId: CURRENT_VERSION,
      applicationHyperdriveId: "app-hyperdrive",
      securityLogHyperdriveId: "security-hyperdrive",
    }),
    true,
  );

  const drift = structuredClone(response);
  drift.result.resources.bindings[1].id = "wrong-hyperdrive";
  assert.throws(
    () => verifyUlcLinzPrivateRuntimeVersionBindings(drift, {
      versionId: CURRENT_VERSION,
      applicationHyperdriveId: "app-hyperdrive",
      securityLogHyperdriveId: "security-hyperdrive",
    }),
    /bindings drifted/,
  );
});

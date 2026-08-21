import assert from "node:assert/strict";
import test from "node:test";

import {
  ULC_LINZ_M6_PRODUCTION_WORKER_PREWRITE_CONTRACT,
  UlcLinzM6ProductionWorkerPrewriteError,
  evaluateUlcLinzM6ProductionWorkerPrewrite,
} from "./ulc-linz-m6-production-worker-prewrite.mjs";

function validProviderState() {
  return {
    application: "ulc-linz",
    environment: "production",
    readOnlyProviderStatePreflightVerified: true,
    providerInventoryVerified: true,
    cloudflareWorkerInventoryVerified: true,
    noExistingCloudflareWorkerCandidate: true,
    existingExactProductionResourceVerified: true,
    firstProviderWriteAlreadySatisfied: true,
    firstProviderWriteRequired: false,
    providerWriteAllowed: false,
    executionAuthorized: false,
    publicExposureAllowed: false,
    productionReady: false,
  };
}

test("ULC M6 production worker prewrite prepares only the closed Cloudflare worker target", () => {
  const result = evaluateUlcLinzM6ProductionWorkerPrewrite(validProviderState());
  assert.equal(result.status, "worker-create-prepared-awaiting-explicit-approval");
  assert.equal(result.priorStepVerified, "neon-production-database");
  assert.equal(result.providerWriteRequired, true);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.explicitApprovalRequired, true);
  assert.equal(result.publicExposureAllowed, false);
  assert.equal(result.productionReady, false);
  assert.deepEqual(result.worker, {
    provider: "cloudflare",
    name: "appbasis-ulc-linz-production",
    workersDev: false,
    previewUrls: false,
    publicIngress: false,
    applicationCodeUploadAllowed: false,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.worker), true);
});

test("ULC M6 production worker prewrite contract is deny-by-default", () => {
  assert.deepEqual(ULC_LINZ_M6_PRODUCTION_WORKER_PREWRITE_CONTRACT, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    stepId: "production-worker",
    provider: "cloudflare",
    workerName: "appbasis-ulc-linz-production",
    workersDev: false,
    previewUrls: false,
    publicIngress: false,
    applicationCodeUploadAllowed: false,
    explicitApprovalRequired: true,
    providerWriteAllowed: false,
    executionAuthorized: false,
  });
});

for (const [field, value] of [
  ["readOnlyProviderStatePreflightVerified", false],
  ["providerInventoryVerified", false],
  ["cloudflareWorkerInventoryVerified", false],
  ["noExistingCloudflareWorkerCandidate", false],
  ["existingExactProductionResourceVerified", false],
  ["firstProviderWriteAlreadySatisfied", false],
  ["firstProviderWriteRequired", true],
  ["providerWriteAllowed", true],
  ["executionAuthorized", true],
  ["publicExposureAllowed", true],
  ["productionReady", true],
]) {
  test(`ULC M6 production worker prewrite fails closed when ${field} drifts`, () => {
    const state = validProviderState();
    state[field] = value;
    assert.throws(
      () => evaluateUlcLinzM6ProductionWorkerPrewrite(state),
      errorWithCode("WORKER_PRECONDITIONS_NOT_MET"),
    );
  });
}

test("ULC M6 production worker prewrite rejects accessor-backed provider state", () => {
  const state = validProviderState();
  Object.defineProperty(state, "providerWriteAllowed", {
    enumerable: true,
    get() {
      return false;
    },
  });
  assert.throws(
    () => evaluateUlcLinzM6ProductionWorkerPrewrite(state),
    errorWithCode("INVALID_PROVIDER_STATE"),
  );
});

function errorWithCode(code) {
  return (error) => {
    assert.equal(error instanceof UlcLinzM6ProductionWorkerPrewriteError, true);
    assert.equal(error.code, code);
    return true;
  };
}

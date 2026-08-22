import assert from "node:assert/strict";
import test from "node:test";

import {
  ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT,
  UlcLinzM6ProductionWorkerCreatePlanError,
  planUlcLinzM6ProductionWorkerCreate,
} from "./ulc-linz-m6-production-worker-create-plan.mjs";

function validPrewrite() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    phase: "production-preparation",
    stepId: "production-worker",
    status: "worker-target-verified-blocked-awaiting-m3-gate-evidence",
    priorStepVerified: "neon-production-database",
    providerInventoryVerified: true,
    noExistingCloudflareWorkerCandidate: true,
    worker: {
      provider: "cloudflare",
      name: "appbasis-ulc-linz-production",
      workersDev: false,
      previewUrls: false,
      publicIngress: false,
      applicationCodeUploadAllowed: false,
    },
    requiredPreparationGateEvidence: ["M3_DONE"],
    productionPreparationGateEvidenceConsumed: false,
    productionPreparationEligible: false,
    providerWriteRequired: true,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    publicExposureAllowed: false,
    productionReady: false,
  };
}

test("M6 worker create plan uses metadata-only closed Cloudflare beta create contract", () => {
  const plan = planUlcLinzM6ProductionWorkerCreate(validPrewrite());
  assert.deepEqual(plan, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    phase: "production-preparation",
    stepId: "production-worker",
    provider: "cloudflare",
    apiStatus: "beta",
    method: "POST",
    path: "/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/workers",
    body: {
      name: "appbasis-ulc-linz-production",
      tags: [],
      subdomain: {
        enabled: false,
        previews_enabled: false,
      },
      observability: {
        enabled: false,
      },
      logpush: false,
      tail_consumers: [],
    },
    requiredPreparationGateEvidence: ["M3_DONE"],
    productionPreparationGateEvidenceConsumed: false,
    productionPreparationEligible: false,
    applicationCodeUploadAllowed: false,
    versionDeploymentAllowed: false,
    routeAttachmentAllowed: false,
    domainAttachmentAllowed: false,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    publicExposureAllowed: false,
    productionReady: false,
    betaCapabilityReverificationRequired: true,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.body), true);
  assert.equal(Object.isFrozen(plan.body.tags), true);
  assert.equal(Object.isFrozen(plan.body.subdomain), true);
  assert.equal(Object.isFrozen(plan.body.observability), true);
  assert.equal(Object.isFrozen(plan.body.tail_consumers), true);
  assert.equal(Object.isFrozen(plan.requiredPreparationGateEvidence), true);
});

for (const [field, value] of [
  ["schemaVersion", 2],
  ["phase", "production-ready"],
  ["priorStepVerified", "wrong-step"],
  ["providerInventoryVerified", false],
  ["noExistingCloudflareWorkerCandidate", false],
  ["providerWriteRequired", false],
  ["productionPreparationGateEvidenceConsumed", true],
  ["productionPreparationEligible", true],
  ["providerWriteAllowed", true],
  ["executionAuthorized", true],
  ["explicitApprovalRequired", false],
  ["publicExposureAllowed", true],
  ["productionReady", true],
]) {
  test(`M6 worker create plan fails closed when ${field} drifts`, () => {
    const state = validPrewrite();
    state[field] = value;
    assert.throws(
      () => planUlcLinzM6ProductionWorkerCreate(state),
      errorWithCode("WORKER_CREATE_PLAN_PRECONDITIONS_NOT_MET"),
    );
  });
}

test("M6 worker create plan fails closed when required M3 evidence drifts", () => {
  const state = validPrewrite();
  state.requiredPreparationGateEvidence = ["M4_DONE"];
  assert.throws(
    () => planUlcLinzM6ProductionWorkerCreate(state),
    errorWithCode("WORKER_CREATE_PLAN_PRECONDITIONS_NOT_MET"),
  );
});

for (const [field, value] of [
  ["name", "wrong-worker"],
  ["workersDev", true],
  ["previewUrls", true],
  ["publicIngress", true],
  ["applicationCodeUploadAllowed", true],
]) {
  test(`M6 worker create plan rejects unsafe worker ${field}`, () => {
    const state = validPrewrite();
    state.worker[field] = value;
    assert.throws(
      () => planUlcLinzM6ProductionWorkerCreate(state),
      errorWithCode("WORKER_CREATE_PLAN_PRECONDITIONS_NOT_MET"),
    );
  });
}

test("M6 worker create plan rejects accessor-backed safety state", () => {
  const state = validPrewrite();
  Object.defineProperty(state, "providerWriteAllowed", {
    enumerable: true,
    get() {
      return false;
    },
  });
  assert.throws(
    () => planUlcLinzM6ProductionWorkerCreate(state),
    errorWithCode("INVALID_PREWRITE_STATE"),
  );
});

test("M6 worker create plan rejects accessor-backed gate evidence", () => {
  const state = validPrewrite();
  const gateEvidence = [];
  Object.defineProperty(gateEvidence, "0", {
    enumerable: true,
    configurable: true,
    get() {
      return "M3_DONE";
    },
  });
  gateEvidence.length = 1;
  state.requiredPreparationGateEvidence = gateEvidence;
  assert.throws(
    () => planUlcLinzM6ProductionWorkerCreate(state),
    errorWithCode("INVALID_PREWRITE_STATE"),
  );
});

function errorWithCode(code) {
  return (error) => {
    assert.equal(error instanceof UlcLinzM6ProductionWorkerCreatePlanError, true);
    assert.equal(error.code, code);
    return true;
  };
}

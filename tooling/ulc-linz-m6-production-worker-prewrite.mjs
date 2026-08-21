const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const TARGET_WORKER = "appbasis-ulc-linz-production";

export const ULC_LINZ_M6_PRODUCTION_WORKER_PREWRITE_CONTRACT = deepFreeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  stepId: "production-worker",
  provider: "cloudflare",
  workerName: TARGET_WORKER,
  workersDev: false,
  previewUrls: false,
  publicIngress: false,
  applicationCodeUploadAllowed: false,
  explicitApprovalRequired: true,
  providerWriteAllowed: false,
  executionAuthorized: false,
});

export class UlcLinzM6ProductionWorkerPrewriteError extends Error {
  constructor(code) {
    super("ULC Linz M6 production worker pre-write failed.");
    this.name = "UlcLinzM6ProductionWorkerPrewriteError";
    this.code = code;
  }
}

export function evaluateUlcLinzM6ProductionWorkerPrewrite(providerState) {
  const state = requiredPlainRecord(providerState, "INVALID_PROVIDER_STATE");
  if (
    ownData(state, "application", "INVALID_PROVIDER_STATE") !== APPLICATION ||
    ownData(state, "environment", "INVALID_PROVIDER_STATE") !== ENVIRONMENT ||
    ownData(state, "readOnlyProviderStatePreflightVerified", "INVALID_PROVIDER_STATE") !== true ||
    ownData(state, "providerInventoryVerified", "INVALID_PROVIDER_STATE") !== true ||
    ownData(state, "cloudflareWorkerInventoryVerified", "INVALID_PROVIDER_STATE") !== true ||
    ownData(state, "noExistingCloudflareWorkerCandidate", "INVALID_PROVIDER_STATE") !== true ||
    ownData(state, "existingExactProductionResourceVerified", "INVALID_PROVIDER_STATE") !== true ||
    ownData(state, "firstProviderWriteAlreadySatisfied", "INVALID_PROVIDER_STATE") !== true ||
    ownData(state, "firstProviderWriteRequired", "INVALID_PROVIDER_STATE") !== false ||
    ownData(state, "providerWriteAllowed", "INVALID_PROVIDER_STATE") !== false ||
    ownData(state, "executionAuthorized", "INVALID_PROVIDER_STATE") !== false ||
    ownData(state, "publicExposureAllowed", "INVALID_PROVIDER_STATE") !== false ||
    ownData(state, "productionReady", "INVALID_PROVIDER_STATE") !== false
  ) {
    fail("WORKER_PRECONDITIONS_NOT_MET");
  }

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    phase: "production-preparation",
    stepId: "production-worker",
    status: "worker-create-prepared-awaiting-explicit-approval",
    priorStepVerified: "neon-production-database",
    providerInventoryVerified: true,
    noExistingCloudflareWorkerCandidate: true,
    worker: {
      provider: "cloudflare",
      name: TARGET_WORKER,
      workersDev: false,
      previewUrls: false,
      publicIngress: false,
      applicationCodeUploadAllowed: false,
    },
    providerWriteRequired: true,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    publicExposureAllowed: false,
    productionReady: false,
  });
}

function requiredPlainRecord(value, code) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(code);
  }
  return value;
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

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6ProductionWorkerPrewriteError(code);
}

const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const CLOUDFLARE_CREATE_PATH = "/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/workers";

export const ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT = deepFreeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  stepId: "production-worker",
  provider: "cloudflare",
  apiStatus: "beta",
  method: "POST",
  path: CLOUDFLARE_CREATE_PATH,
  body: {
    name: TARGET_WORKER,
    subdomain: {
      enabled: false,
      previews_enabled: false,
    },
  },
  applicationCodeUploadAllowed: false,
  versionDeploymentAllowed: false,
  routeAttachmentAllowed: false,
  domainAttachmentAllowed: false,
  providerWriteAllowed: false,
  executionAuthorized: false,
  explicitApprovalRequired: true,
  betaCapabilityReverificationRequired: true,
});

export class UlcLinzM6ProductionWorkerCreatePlanError extends Error {
  constructor(code) {
    super("ULC Linz M6 production worker create plan failed.");
    this.name = "UlcLinzM6ProductionWorkerCreatePlanError";
    this.code = code;
  }
}

export function planUlcLinzM6ProductionWorkerCreate(prewrite) {
  const state = requiredPlainRecord(prewrite, "INVALID_PREWRITE_STATE");
  if (
    ownData(state, "application", "INVALID_PREWRITE_STATE") !== APPLICATION ||
    ownData(state, "environment", "INVALID_PREWRITE_STATE") !== ENVIRONMENT ||
    ownData(state, "stepId", "INVALID_PREWRITE_STATE") !== "production-worker" ||
    ownData(state, "status", "INVALID_PREWRITE_STATE") !==
      "worker-target-verified-blocked-awaiting-m3-gate-evidence" ||
    ownData(state, "productionPreparationGateEvidenceConsumed", "INVALID_PREWRITE_STATE") !== false ||
    ownData(state, "productionPreparationEligible", "INVALID_PREWRITE_STATE") !== false ||
    ownData(state, "providerWriteAllowed", "INVALID_PREWRITE_STATE") !== false ||
    ownData(state, "executionAuthorized", "INVALID_PREWRITE_STATE") !== false ||
    ownData(state, "explicitApprovalRequired", "INVALID_PREWRITE_STATE") !== true ||
    ownData(state, "publicExposureAllowed", "INVALID_PREWRITE_STATE") !== false ||
    ownData(state, "productionReady", "INVALID_PREWRITE_STATE") !== false
  ) {
    fail("WORKER_CREATE_PLAN_PRECONDITIONS_NOT_MET");
  }

  const worker = requiredPlainRecord(
    ownData(state, "worker", "INVALID_PREWRITE_STATE"),
    "INVALID_PREWRITE_STATE",
  );
  if (
    ownData(worker, "provider", "INVALID_PREWRITE_STATE") !== "cloudflare" ||
    ownData(worker, "name", "INVALID_PREWRITE_STATE") !== TARGET_WORKER ||
    ownData(worker, "workersDev", "INVALID_PREWRITE_STATE") !== false ||
    ownData(worker, "previewUrls", "INVALID_PREWRITE_STATE") !== false ||
    ownData(worker, "publicIngress", "INVALID_PREWRITE_STATE") !== false ||
    ownData(worker, "applicationCodeUploadAllowed", "INVALID_PREWRITE_STATE") !== false
  ) {
    fail("WORKER_CREATE_PLAN_PRECONDITIONS_NOT_MET");
  }

  return ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT;
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
  throw new UlcLinzM6ProductionWorkerCreatePlanError(code);
}

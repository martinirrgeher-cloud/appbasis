import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  M3_PREVIEW_ACCEPTANCE_RUN,
  deriveM3PreviewAcceptanceEvidence,
} from "./factory-ui/m3-preview-acceptance-evidence.mjs";

const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const CLOUDFLARE_CREATE_PATH = "/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/workers";

export class UlcLinzM6ProductionWorkerM3GateError extends Error {
  constructor(code) {
    super("ULC Linz M6 production worker M3 gate failed.");
    this.name = "UlcLinzM6ProductionWorkerM3GateError";
    this.code = code;
  }
}

export async function evaluateUlcLinzM6ProductionWorkerM3Gate(
  createPlan,
  repositoryRoot = process.cwd(),
  { fetchImpl = fetch } = {},
) {
  assertSafeCreatePlan(createPlan);

  let definition;
  try {
    definition = JSON.parse(
      await readFile(
        join(resolve(repositoryRoot), "apps", M3_PREVIEW_ACCEPTANCE_RUN.appId, "appbasis.app.json"),
        "utf8",
      ),
    );
  } catch {
    return blockedResult();
  }

  let evidence;
  try {
    evidence = await deriveM3PreviewAcceptanceEvidence(definition, { fetchImpl });
  } catch {
    return blockedResult();
  }

  if (evidence?.previewAccepted !== true) return blockedResult();

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    phase: "production-preparation",
    stepId: "production-worker",
    status: "worker-create-prepared-awaiting-operator-approval",
    workerName: TARGET_WORKER,
    requiredPreparationGateEvidence: ["M3_DONE"],
    productionPreparationGateEvidenceConsumed: true,
    productionPreparationEligible: true,
    providerWriteRequired: true,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    publicExposureAllowed: false,
    productionReady: false,
    releaseAuthorized: false,
    betaCapabilityReverificationRequired: true,
  });
}

function blockedResult() {
  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    phase: "production-preparation",
    stepId: "production-worker",
    status: "worker-create-blocked-m3-evidence-unverified",
    workerName: TARGET_WORKER,
    requiredPreparationGateEvidence: ["M3_DONE"],
    productionPreparationGateEvidenceConsumed: false,
    productionPreparationEligible: false,
    providerWriteRequired: true,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    publicExposureAllowed: false,
    productionReady: false,
    releaseAuthorized: false,
    betaCapabilityReverificationRequired: true,
  });
}

function assertSafeCreatePlan(value) {
  const plan = requiredPlainRecord(value, "INVALID_CREATE_PLAN");
  if (
    ownData(plan, "schemaVersion", "INVALID_CREATE_PLAN") !== 1 ||
    ownData(plan, "application", "INVALID_CREATE_PLAN") !== APPLICATION ||
    ownData(plan, "environment", "INVALID_CREATE_PLAN") !== ENVIRONMENT ||
    ownData(plan, "phase", "INVALID_CREATE_PLAN") !== "production-preparation" ||
    ownData(plan, "stepId", "INVALID_CREATE_PLAN") !== "production-worker" ||
    ownData(plan, "provider", "INVALID_CREATE_PLAN") !== "cloudflare" ||
    ownData(plan, "apiStatus", "INVALID_CREATE_PLAN") !== "beta" ||
    ownData(plan, "method", "INVALID_CREATE_PLAN") !== "POST" ||
    ownData(plan, "path", "INVALID_CREATE_PLAN") !== CLOUDFLARE_CREATE_PATH ||
    ownData(plan, "productionPreparationGateEvidenceConsumed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "productionPreparationEligible", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "applicationCodeUploadAllowed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "versionDeploymentAllowed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "routeAttachmentAllowed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "domainAttachmentAllowed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "providerWriteAllowed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "executionAuthorized", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "explicitApprovalRequired", "INVALID_CREATE_PLAN") !== true ||
    ownData(plan, "publicExposureAllowed", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "productionReady", "INVALID_CREATE_PLAN") !== false ||
    ownData(plan, "betaCapabilityReverificationRequired", "INVALID_CREATE_PLAN") !== true
  ) {
    fail("WORKER_M3_GATE_PRECONDITIONS_NOT_MET");
  }

  const gates = requiredArray(
    ownData(plan, "requiredPreparationGateEvidence", "INVALID_CREATE_PLAN"),
    "INVALID_CREATE_PLAN",
  );
  if (
    gates.length !== 1 ||
    ownData(gates, "0", "INVALID_CREATE_PLAN") !== "M3_DONE"
  ) {
    fail("WORKER_M3_GATE_PRECONDITIONS_NOT_MET");
  }

  const body = requiredPlainRecord(
    ownData(plan, "body", "INVALID_CREATE_PLAN"),
    "INVALID_CREATE_PLAN",
  );
  const subdomain = requiredPlainRecord(
    ownData(body, "subdomain", "INVALID_CREATE_PLAN"),
    "INVALID_CREATE_PLAN",
  );
  if (
    ownData(body, "name", "INVALID_CREATE_PLAN") !== TARGET_WORKER ||
    ownData(subdomain, "enabled", "INVALID_CREATE_PLAN") !== false ||
    ownData(subdomain, "previews_enabled", "INVALID_CREATE_PLAN") !== false
  ) {
    fail("WORKER_M3_GATE_PRECONDITIONS_NOT_MET");
  }
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

function requiredArray(value, code) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
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
  throw new UlcLinzM6ProductionWorkerM3GateError(code);
}

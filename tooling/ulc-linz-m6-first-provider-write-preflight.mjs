import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";
import { ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN } from "./ulc-linz-m6-production-preflight.mjs";
import { ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT } from "./ulc-linz-m6-production-resource-binding.mjs";

const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const PROVIDER_API_SOURCE = "provider-api";
const NEON_PROVIDER = "neon";
const NEON_REGION = "aws-eu-central-1";
const NEON_PROJECT_NAME = "appbasis-ulc-linz-production";
const CLOUDFLARE_WORKER_NAME = "appbasis-ulc-linz-production";
const FIRST_PROVIDER_WRITE_STEP_ID = "neon-production-database";
const MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;

const ROOT_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "observedAt",
  "validUntilOrReviewAt",
  "source",
  "neon",
]);
const NEON_FIELDS = Object.freeze([
  "inventoryComplete",
  "projects",
  "targetRegionAvailable",
  "selectedCreateMethodSupportsExplicitRegion",
]);
const PROJECT_FIELDS = Object.freeze(["name", "region"]);
const UNSAFE_FIELD_PATTERN =
  /(?:authorization|cookie|password|secret|token|credential|connectionstring|databaseurl|api[_-]?key|requestbody|responsebody)/i;
const UNSAFE_VALUE_PATTERNS = Object.freeze([
  /^postgres(?:ql)?:\/\//i,
  /^bearer\s+/i,
  /^basic\s+/i,
]);

export const ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT = deepFreeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  firstProviderWrite: {
    stepId: FIRST_PROVIDER_WRITE_STEP_ID,
    provider: NEON_PROVIDER,
    projectName: NEON_PROJECT_NAME,
    region: NEON_REGION,
    explicitRegionSelectionRequired: true,
    providerDefaultRegionAllowed: false,
    existingProductionCandidateAllowed: false,
  },
  cloudflareWorkerCreation: {
    workerName: CLOUDFLARE_WORKER_NAME,
    workersDev: false,
    previewUrls: false,
    publicIngress: false,
    ingressStateMustBeAppliedAtInitialCreateOrFirstDeploy: true,
    closedIngressRequiredBeforeApplicationCodeUpload: true,
  },
});

export class UlcLinzM6FirstProviderWritePreflightError extends Error {
  constructor(code) {
    super("ULC Linz M6 first provider-write preflight failed.");
    this.name = "UlcLinzM6FirstProviderWritePreflightError";
    this.code = code;
  }
}

export function evaluateUlcLinzM6FirstProviderWritePreflight(
  evidence,
  { now = new Date() } = {},
) {
  assertCanonicalContracts();
  assertSafeEvidenceTree(evidence);

  const root = exactRecord(evidence, ROOT_FIELDS, "INVALID_EVIDENCE");
  if (
    root.schemaVersion !== 1 ||
    root.application !== APPLICATION ||
    root.environment !== ENVIRONMENT ||
    root.source !== PROVIDER_API_SOURCE
  ) {
    fail("INVALID_EVIDENCE");
  }

  const observedAt = canonicalTimestamp(root.observedAt);
  const validUntilOrReviewAt = canonicalTimestamp(root.validUntilOrReviewAt);
  const nowDate = requiredDate(now);
  assertFreshEvidence(observedAt, validUntilOrReviewAt, nowDate);

  const neon = exactRecord(root.neon, NEON_FIELDS, "NEON_PREFLIGHT_INVALID");
  if (
    neon.inventoryComplete !== true ||
    neon.targetRegionAvailable !== true ||
    neon.selectedCreateMethodSupportsExplicitRegion !== true
  ) {
    fail("NEON_PREFLIGHT_INVALID");
  }

  const projects = exactArray(neon.projects, "NEON_PREFLIGHT_INVALID");
  if (projects.length > 400) fail("NEON_PREFLIGHT_INVALID");

  const normalizedProjects = projects.map((value) => {
    const project = exactRecord(
      value,
      PROJECT_FIELDS,
      "NEON_PREFLIGHT_INVALID",
    );
    const name = requiredProjectName(project.name);
    const region = requiredRegion(project.region);
    return { name, region };
  });

  if (normalizedProjects.some((project) => isUlcProductionCandidate(project.name))) {
    fail("EXISTING_PRODUCTION_RESOURCE_CANDIDATE");
  }

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    status: "ready-for-explicit-provider-write-approval",
    providerInventoryVerified: true,
    noExistingProductionResourceCandidate: true,
    targetRegionAvailable: true,
    selectedCreateMethodSupportsExplicitRegion: true,
    explicitRegionSelectionRequired: true,
    providerDefaultRegionAllowed: false,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    observedAt: observedAt.toISOString(),
    validUntilOrReviewAt: validUntilOrReviewAt.toISOString(),
    firstProviderWrite:
      ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT.firstProviderWrite,
    futureCloudflareWorkerCreation:
      ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT.cloudflareWorkerCreation,
  });
}

function assertCanonicalContracts() {
  const firstStep = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps[0];
  if (
    ULC_LINZ_M5_TARGET_POLICY.appId !== APPLICATION ||
    ULC_LINZ_M5_TARGET_POLICY.productionDatabaseRegionTarget !==
      "EU / Frankfurt" ||
    ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT.application !==
      APPLICATION ||
    ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT.environment !==
      ENVIRONMENT ||
    ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT.neonRegion !==
      NEON_REGION ||
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.providerWritesEnabled !== false ||
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.firstProviderWriteStepId !==
      FIRST_PROVIDER_WRITE_STEP_ID ||
    firstStep?.id !== FIRST_PROVIDER_WRITE_STEP_ID ||
    firstStep.kind !== "provider-write" ||
    firstStep.approvalRequired !== true ||
    firstStep.target?.provider !== NEON_PROVIDER ||
    firstStep.target?.region !== NEON_REGION ||
    firstStep.target?.dedicatedProductionResource !== true
  ) {
    fail("CONTRACT_DRIFT");
  }

  const safety = ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT;
  if (
    safety.application !== APPLICATION ||
    safety.environment !== ENVIRONMENT ||
    safety.firstProviderWrite.stepId !== FIRST_PROVIDER_WRITE_STEP_ID ||
    safety.firstProviderWrite.provider !== NEON_PROVIDER ||
    safety.firstProviderWrite.projectName !== NEON_PROJECT_NAME ||
    safety.firstProviderWrite.region !== NEON_REGION ||
    safety.firstProviderWrite.explicitRegionSelectionRequired !== true ||
    safety.firstProviderWrite.providerDefaultRegionAllowed !== false ||
    safety.firstProviderWrite.existingProductionCandidateAllowed !== false ||
    safety.cloudflareWorkerCreation.workerName !== CLOUDFLARE_WORKER_NAME ||
    safety.cloudflareWorkerCreation.workersDev !== false ||
    safety.cloudflareWorkerCreation.previewUrls !== false ||
    safety.cloudflareWorkerCreation.publicIngress !== false ||
    safety.cloudflareWorkerCreation
      .ingressStateMustBeAppliedAtInitialCreateOrFirstDeploy !== true ||
    safety.cloudflareWorkerCreation
      .closedIngressRequiredBeforeApplicationCodeUpload !== true
  ) {
    fail("CONTRACT_DRIFT");
  }
}

function assertFreshEvidence(observedAt, validUntilOrReviewAt, now) {
  const age = now.getTime() - observedAt.getTime();
  const validityWindow =
    validUntilOrReviewAt.getTime() - observedAt.getTime();
  if (
    observedAt.getTime() > now.getTime() ||
    age < 0 ||
    age > MAX_EVIDENCE_AGE_MS ||
    validUntilOrReviewAt.getTime() <= now.getTime() ||
    validityWindow <= 0 ||
    validityWindow > MAX_EVIDENCE_AGE_MS
  ) {
    fail("STALE_EVIDENCE");
  }
}

function isUlcProductionCandidate(name) {
  const normalized = name.toLowerCase();
  if (normalized === NEON_PROJECT_NAME) return true;
  if (normalized === "ulc-linz" || normalized === "appbasis-ulc-linz") {
    return true;
  }
  return (
    normalized.includes("ulc-linz") &&
    (normalized.includes("production") ||
      /(?:^|-)prod(?:-|$)/.test(normalized))
  );
}

function requiredProjectName(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 64 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail("NEON_PREFLIGHT_INVALID");
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
    fail("NEON_PREFLIGHT_INVALID");
  }
  return value;
}

function exactRecord(value, fields, code) {
  if (!isPlainRecord(value)) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const expected = new Set(fields);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !expected.has(field))
  ) {
    fail(code);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail("UNSAFE_EVIDENCE");
    }
  }
  return value;
}

function exactArray(value, code) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    fail(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const expectedKeys = new Set([
    ...value.map((_, index) => String(index)),
    "length",
  ]);
  if (
    keys.length !== expectedKeys.size ||
    keys.some((key) => !expectedKeys.has(key))
  ) {
    fail(code);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail("UNSAFE_EVIDENCE");
    }
  }
  return value;
}

function assertSafeEvidenceTree(value, seen = new Set()) {
  if (value === null) return;
  if (typeof value === "string") {
    if (
      value.includes("\0") ||
      UNSAFE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
    ) {
      fail("UNSAFE_EVIDENCE");
    }
    return;
  }
  if (typeof value === "boolean" || typeof value === "number") return;
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      seen.has(value) ||
      Object.getOwnPropertySymbols(value).length > 0
    ) {
      fail("UNSAFE_EVIDENCE");
    }
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        fail("UNSAFE_EVIDENCE");
      }
      assertSafeEvidenceTree(descriptor.value, seen);
    }
    seen.delete(value);
    return;
  }
  if (!isPlainRecord(value) || seen.has(value)) fail("UNSAFE_EVIDENCE");
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) fail("UNSAFE_EVIDENCE");

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (UNSAFE_FIELD_PATTERN.test(key)) fail("UNSAFE_EVIDENCE");
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail("UNSAFE_EVIDENCE");
    }
    assertSafeEvidenceTree(descriptor.value, seen);
  }
  seen.delete(value);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") fail("INVALID_EVIDENCE");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("INVALID_EVIDENCE");
  }
  return parsed;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("INVALID_EVIDENCE");
  }
  return value;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6FirstProviderWritePreflightError(code);
}

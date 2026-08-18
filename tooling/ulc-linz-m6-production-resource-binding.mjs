import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";

const APPLICATION = ULC_LINZ_M5_TARGET_POLICY.appId;
const ENVIRONMENT = "production";
const RUNTIME_ENTRYPOINT = "./worker/index.ts";
const PROVIDER_MODEL = "standard-workers-global-transient";
const NEON_FRANKFURT_REGION = "aws-eu-central-1";
const PROVIDER_API_SOURCE = "provider-api";

const ROOT_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "observedAt",
  "validUntilOrReviewAt",
  "runtime",
  "neon",
  "cloudflare",
]);
const RUNTIME_FIELDS = Object.freeze([
  "entrypoint",
  "providerModel",
  "euOnly",
]);
const NEON_FIELDS = Object.freeze([
  "projectBindingId",
  "branchBindingId",
  "databaseBindingId",
  "region",
  "regionSource",
  "identitySource",
  "dedicatedProductionResource",
]);
const CLOUDFLARE_FIELDS = Object.freeze([
  "accountBindingId",
  "runtimeBindingId",
  "hostnameBinding",
  "databaseBindingId",
  "identitySource",
  "bindingInventoryComplete",
  "telemetryInventoryComplete",
  "unexpectedPersonalDataPersistence",
  "dedicatedProductionResource",
]);

const UNSAFE_FIELD_PATTERN =
  /(?:authorization|cookie|password|secret|token|credential|connectionstring|databaseurl|api[_-]?key|requestbody|responsebody)/i;
const UNSAFE_VALUE_PATTERNS = Object.freeze([
  /^postgres(?:ql)?:\/\//i,
  /^bearer\s+/i,
  /^basic\s+/i,
]);

export const ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT = Object.freeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  runtimeEntrypoint: RUNTIME_ENTRYPOINT,
  providerModel: PROVIDER_MODEL,
  euOnly: false,
  neonRegion: NEON_FRANKFURT_REGION,
});

export class UlcLinzProductionResourceBindingError extends Error {
  constructor(code) {
    super("ULC Linz production resource binding evidence is not valid.");
    this.name = "UlcLinzProductionResourceBindingError";
    this.code = code;
  }
}

export function evaluateUlcLinzProductionResourceBinding(
  evidence,
  { now = new Date() } = {},
) {
  assertCanonicalContract();
  assertSafeEvidenceTree(evidence);
  const root = exactRecord(evidence, ROOT_FIELDS, "INVALID_EVIDENCE");

  if (
    root.schemaVersion !== 1 ||
    root.application !== APPLICATION ||
    root.environment !== ENVIRONMENT
  ) {
    fail("INVALID_EVIDENCE");
  }

  const observedAt = canonicalTimestamp(root.observedAt);
  const validUntilOrReviewAt = canonicalTimestamp(root.validUntilOrReviewAt);
  const nowDate = requiredDate(now);
  if (
    observedAt.getTime() > nowDate.getTime() ||
    validUntilOrReviewAt.getTime() <= observedAt.getTime() ||
    validUntilOrReviewAt.getTime() <= nowDate.getTime()
  ) {
    fail("STALE_EVIDENCE");
  }

  const runtime = exactRecord(root.runtime, RUNTIME_FIELDS, "RUNTIME_CONTRACT_MISMATCH");
  if (
    runtime.entrypoint !== RUNTIME_ENTRYPOINT ||
    runtime.providerModel !== PROVIDER_MODEL ||
    runtime.euOnly !== false
  ) {
    fail("RUNTIME_CONTRACT_MISMATCH");
  }

  const neon = exactRecord(root.neon, NEON_FIELDS, "NEON_BINDING_MISMATCH");
  requireOpaqueIdentifier(neon.projectBindingId, "NEON_BINDING_MISMATCH");
  requireOpaqueIdentifier(neon.branchBindingId, "NEON_BINDING_MISMATCH");
  requireOpaqueIdentifier(neon.databaseBindingId, "NEON_BINDING_MISMATCH");
  if (
    neon.region !== NEON_FRANKFURT_REGION ||
    neon.regionSource !== PROVIDER_API_SOURCE ||
    neon.identitySource !== PROVIDER_API_SOURCE ||
    neon.dedicatedProductionResource !== true
  ) {
    fail("NEON_BINDING_MISMATCH");
  }

  const cloudflare = exactRecord(
    root.cloudflare,
    CLOUDFLARE_FIELDS,
    "CLOUDFLARE_BINDING_MISMATCH",
  );
  requireOpaqueIdentifier(
    cloudflare.accountBindingId,
    "CLOUDFLARE_BINDING_MISMATCH",
  );
  requireOpaqueIdentifier(
    cloudflare.runtimeBindingId,
    "CLOUDFLARE_BINDING_MISMATCH",
  );
  requireOpaqueIdentifier(
    cloudflare.databaseBindingId,
    "CLOUDFLARE_BINDING_MISMATCH",
  );
  requireHostname(cloudflare.hostnameBinding);
  if (
    cloudflare.identitySource !== PROVIDER_API_SOURCE ||
    cloudflare.bindingInventoryComplete !== true ||
    cloudflare.telemetryInventoryComplete !== true ||
    cloudflare.unexpectedPersonalDataPersistence !== false ||
    cloudflare.dedicatedProductionResource !== true
  ) {
    fail("CLOUDFLARE_BINDING_MISMATCH");
  }

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    observedAt: observedAt.toISOString(),
    validUntilOrReviewAt: validUntilOrReviewAt.toISOString(),
    runtimeContractVerified: true,
    productionDatabaseBound: true,
    productionWorkerBound: true,
    productionHostnameBound: true,
    databaseBindingBound: true,
    providerModel: PROVIDER_MODEL,
    euOnly: false,
    neonRegion: NEON_FRANKFURT_REGION,
    scopeComplete: true,
  });
}

function assertCanonicalContract() {
  if (
    APPLICATION !== "ulc-linz" ||
    ULC_LINZ_M5_TARGET_POLICY.productionDatabaseRegionTarget !== "EU / Frankfurt"
  ) {
    fail("CONTRACT_DRIFT");
  }
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

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireOpaqueIdentifier(value, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    fail(code);
  }
}

function requireHostname(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 253 ||
    value !== value.toLowerCase() ||
    value !== value.trim() ||
    value.includes("://") ||
    value.includes("/") ||
    value.includes("@") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    fail("CLOUDFLARE_BINDING_MISMATCH");
  }
  const labels = value.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    fail("CLOUDFLARE_BINDING_MISMATCH");
  }
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

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") deepFreeze(child);
  }
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzProductionResourceBindingError(code);
}

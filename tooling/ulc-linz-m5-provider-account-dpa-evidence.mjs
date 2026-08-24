import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "./ulc-linz-m5-provider-evidence.mjs";

const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "evidenceSource",
  "observedAt",
  "validUntilOrReviewAt",
  "cloudflare",
  "neon",
]);
const PROVIDER_KEYS = Object.freeze([
  "resourceBindingId",
  "documentReference",
  "evidenceDigest",
]);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REFERENCE_PATTERN = /^urn:appbasis:operator-contract-record:[A-Za-z0-9._:-]{1,160}$/;

export function deriveUlcLinzM5AccountBoundDpaEvidence(
  value,
  {
    cloudflareAccountBindingId,
    neonProjectBindingId,
    observedAt,
    validUntilOrReviewAt,
  },
) {
  assertPlainExact(value, ROOT_KEYS, "account DPA evidence");
  if (
    value.schemaVersion !== 1 ||
    value.application !== "ulc-linz" ||
    value.environment !== "production" ||
    value.evidenceSource !== "protected-operator-contract-record" ||
    value.observedAt !== observedAt ||
    value.validUntilOrReviewAt !== validUntilOrReviewAt
  ) {
    throw new Error("ULC M5-G account DPA evidence root binding is invalid.");
  }
  canonicalTimestamp(value.observedAt, "observedAt");
  canonicalTimestamp(value.validUntilOrReviewAt, "validUntilOrReviewAt");

  const cloudflare = providerEvidence(
    value.cloudflare,
    cloudflareAccountBindingId,
    "Cloudflare",
  );
  const neon = providerEvidence(value.neon, neonProjectBindingId, "Neon");

  return Object.freeze([
    legalEntry(
      "cloudflare",
      cloudflare.documentReference,
      cloudflare.evidenceDigest,
      observedAt,
      validUntilOrReviewAt,
    ),
    legalEntry(
      "neon-databricks",
      neon.documentReference,
      neon.evidenceDigest,
      observedAt,
      validUntilOrReviewAt,
    ),
  ]);
}

export function parseUlcLinzM5AccountBoundDpaEvidenceJson(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 16_384) {
    throw new Error("ULC M5-G account DPA evidence JSON is invalid.");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("ULC M5-G account DPA evidence JSON is invalid.");
  }
  return parsed;
}

function providerEvidence(value, expectedBindingId, label) {
  assertPlainExact(value, PROVIDER_KEYS, `${label} account DPA evidence`);
  if (
    typeof expectedBindingId !== "string" ||
    expectedBindingId.length === 0 ||
    value.resourceBindingId !== expectedBindingId ||
    typeof value.documentReference !== "string" ||
    !REFERENCE_PATTERN.test(value.documentReference) ||
    typeof value.evidenceDigest !== "string" ||
    !DIGEST_PATTERN.test(value.evidenceDigest)
  ) {
    throw new Error(`ULC M5-G ${label} account DPA binding is invalid.`);
  }
  return value;
}

function legalEntry(
  provider,
  canonicalSource,
  evidenceDigest,
  observedAt,
  validUntilOrReviewAt,
) {
  return Object.freeze({
    provider,
    documentType: "dpa-account-binding",
    canonicalSource,
    documentVersionOrUpdatedAt: evidenceDigest,
    serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[provider],
    observedAt,
    validUntilOrReviewAt,
    accountSpecific: true,
    publicBaseline: false,
    transferModelConsistentWithAdr022: null,
  });
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string") {
    throw new Error(`ULC M5-G account DPA ${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`ULC M5-G account DPA ${label} is invalid.`);
  }
  return parsed;
}

function assertPlainExact(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new Error(`ULC M5-G ${label} is invalid.`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true
    ) {
      throw new Error(`ULC M5-G ${label} is invalid.`);
    }
  }
}

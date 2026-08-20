import { createHash } from "node:crypto";

import {
  evaluateUlcLinzProviderCompliance,
  ULC_LINZ_M5_G_CRITERIA,
} from "./ulc-linz-m5-provider-evidence.mjs";
import { evaluateUlcLinzProductionResourceBinding } from "./ulc-linz-m6-production-resource-binding.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const INPUT_FIELDS = Object.freeze([
  "resourceBindingEvidence",
  "complianceEvidence",
  "complianceResourceBindingFingerprint",
]);
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function deriveUlcLinzM5GResourceBindingFingerprint(
  resourceBindingEvidence,
  { now = new Date() } = {},
) {
  const nowDate = requiredDate(now);
  evaluateUlcLinzProductionResourceBinding(resourceBindingEvidence, {
    now: nowDate,
  });
  return calculateResourceBindingFingerprint(resourceBindingEvidence);
}

export function deriveUlcLinzM5GBoundProductionEvidence(
  input,
  { now = new Date() } = {},
) {
  try {
    const root = exactRecord(input);
    const nowDate = requiredDate(now);
    const resourceBinding = evaluateUlcLinzProductionResourceBinding(
      root.resourceBindingEvidence,
      { now: nowDate },
    );
    const expectedFingerprint = calculateResourceBindingFingerprint(
      root.resourceBindingEvidence,
    );
    if (
      !isSha256Fingerprint(root.complianceResourceBindingFingerprint) ||
      root.complianceResourceBindingFingerprint !== expectedFingerprint
    ) {
      return EMPTY_EVIDENCE;
    }

    const compliance = evaluateUlcLinzProviderCompliance(
      root.complianceEvidence,
      { now: nowDate.toISOString() },
    );

    if (!isSameProductionSnapshot(resourceBinding, compliance)) {
      return EMPTY_EVIDENCE;
    }

    return Object.freeze(
      Object.fromEntries(
        ULC_LINZ_M5_G_CRITERIA.filter(
          (criterion) => compliance.criteria[criterion] === "verified",
        ).map((criterion) => [criterion, true]),
      ),
    );
  } catch {
    return EMPTY_EVIDENCE;
  }
}

function calculateResourceBindingFingerprint(evidence) {
  const canonicalBinding = [
    evidence.schemaVersion,
    evidence.application,
    evidence.environment,
    evidence.observedAt,
    evidence.validUntilOrReviewAt,
    evidence.runtime.entrypoint,
    evidence.runtime.contractDigest,
    evidence.runtime.providerModel,
    evidence.runtime.euOnly,
    evidence.neon.projectBindingId,
    evidence.neon.branchBindingId,
    evidence.neon.databaseBindingId,
    evidence.neon.region,
    evidence.neon.regionSource,
    evidence.neon.identitySource,
    evidence.neon.dedicatedProductionResource,
    evidence.cloudflare.accountBindingId,
    evidence.cloudflare.runtimeBindingId,
    evidence.cloudflare.hostnameBinding,
    evidence.cloudflare.databaseBindingId,
    evidence.cloudflare.identitySource,
    evidence.cloudflare.bindingInventoryComplete,
    evidence.cloudflare.telemetryInventoryComplete,
    evidence.cloudflare.unexpectedPersonalDataPersistence,
    evidence.cloudflare.dedicatedProductionResource,
  ];
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalBinding), "utf8")
    .digest("hex")}`;
}

function isSameProductionSnapshot(resourceBinding, compliance) {
  return (
    resourceBinding.application === compliance.application &&
    resourceBinding.environment === compliance.environment &&
    resourceBinding.providerModel === compliance.providerModel &&
    resourceBinding.euOnly === compliance.euOnly &&
    resourceBinding.observedAt === compliance.observedAt &&
    resourceBinding.validUntilOrReviewAt === compliance.validUntilOrReviewAt &&
    resourceBinding.runtimeContractVerified === true &&
    resourceBinding.productionDatabaseBound === true &&
    resourceBinding.productionWorkerBound === true &&
    resourceBinding.databaseBindingBound === true &&
    resourceBinding.scopeComplete === true &&
    resourceBinding.neonRegion ===
      compliance.providers["neon-postgresql"].regionId &&
    compliance.providers.cloudflare.runtimeClass === "standard-workers" &&
    Object.values(compliance.resourceBinding).every((value) => value === true)
  );
}

function exactRecord(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC Linz M5-G bound evidence input is invalid.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== INPUT_FIELDS.length ||
    INPUT_FIELDS.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !INPUT_FIELDS.includes(key))
  ) {
    throw new Error("ULC Linz M5-G bound evidence input is invalid.");
  }

  for (const descriptor of Object.values(descriptors)) {
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("ULC Linz M5-G bound evidence input is invalid.");
    }
  }
  return value;
}

function isSha256Fingerprint(value) {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

function requiredDate(value) {
  const parsed =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (
    parsed === null ||
    !Number.isFinite(parsed.getTime()) ||
    (typeof value === "string" && parsed.toISOString() !== value)
  ) {
    throw new Error("ULC Linz M5-G bound evidence clock is invalid.");
  }
  return parsed;
}

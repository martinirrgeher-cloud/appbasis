import { bindUlcLinzM5TargetPolicy } from "../ulc-linz-m5-target-policy.mjs";
import { deriveUlcLinzM5FAuditSecurityLoggingEvidence } from "../ulc-linz-m5-audit-security-logging-evidence.mjs";
import { deriveUlcLinzM5HControlPlaneEvidence } from "../ulc-linz-m5-control-plane-evidence.mjs";
import {
  deriveUlcLinzM5GBoundProductionEvidence,
  deriveUlcLinzM5GResourceBindingFingerprint,
} from "../ulc-linz-m5-provider-bound-evidence.mjs";
import { deriveUlcLinzHighPrivacyProductionEvidenceFromOwners } from "../ulc-linz-m5-high-privacy-evidence.mjs";
import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./repository-production-readiness-evidence.mjs";
import { deriveUlcLinzDataExportEvidence } from "./ulc-linz-data-export-evidence.mjs";
import { deriveUlcLinzLifecycleEvidence } from "./ulc-linz-lifecycle-evidence.mjs";
import { deriveUlcLinzRolesAndPermissionsEvidence } from "./ulc-linz-roles-permissions-evidence.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const EXTERNAL_INPUT_FIELDS = Object.freeze([
  "auditSecurityLoggingEvidenceInput",
  "providerBoundEvidenceInput",
  "controlPlaneEvidenceInput",
  "lifecycleActivationEvidenceInput",
  "backupRestoreEvidenceInput",
]);

export const ULC_LINZ_M5_J_OWNER_MATRIX = Object.freeze([
  Object.freeze({ owner: "providerCompliance", criteria: Object.freeze(["dataRegion", "dpa", "encryption", "subprocessors"]) }),
  Object.freeze({ owner: "rolesAndPermissions", criteria: Object.freeze(["rolesAndPermissions"]) }),
  Object.freeze({ owner: "lifecycle", criteria: Object.freeze(["deletionConcept", "retention"]) }),
  Object.freeze({ owner: "dataExport", criteria: Object.freeze(["dataExport"]) }),
  Object.freeze({ owner: "auditSecurityLogging", criteria: Object.freeze(["auditSecurityLogging"]) }),
  Object.freeze({ owner: "highPrivacy", criteria: Object.freeze(["highPrivacyProfile"]) }),
  Object.freeze({ owner: "repository", criteria: Object.freeze(["secretsOutsideAppManifests"]) }),
  Object.freeze({ owner: "controlPlane", criteria: Object.freeze(["privilegedControlPlaneIsolation"]) }),
]);

export async function deriveUlcLinzM5JProductionEvidence(
  repositoryRoot,
  definition,
  ownerInputs = {},
  { now = new Date() } = {},
) {
  try {
    bindUlcLinzM5TargetPolicy(definition);
  } catch {
    return EMPTY_EVIDENCE;
  }

  const inputs = normalizeExternalInputs(ownerInputs);
  const nowDate = requiredDate(now);
  const coherentVolatileInputs = hasCoherentVolatileResourceBinding(inputs, nowDate);

  const repositoryEvidence = await safelyDerive(() =>
    deriveRepositoryProductionReadinessEvidence(definition),
  );
  const rolesAndPermissionsEvidence = await safelyDerive(() =>
    deriveUlcLinzRolesAndPermissionsEvidence(repositoryRoot, definition),
  );
  const lifecycleEvidence =
    coherentVolatileInputs && inputs.lifecycleActivationEvidenceInput !== undefined
      ? await safelyDerive(() =>
          deriveUlcLinzLifecycleEvidence(
            repositoryRoot,
            definition,
            inputs.lifecycleActivationEvidenceInput,
            { now: nowDate },
          ),
        )
      : EMPTY_EVIDENCE;
  const auditSecurityLoggingEvidence =
    coherentVolatileInputs && inputs.auditSecurityLoggingEvidenceInput !== undefined
      ? await safelyDerive(() =>
          deriveUlcLinzM5FAuditSecurityLoggingEvidence(
            inputs.auditSecurityLoggingEvidenceInput,
            { now: nowDate },
          ),
        )
      : EMPTY_EVIDENCE;
  const dataExportEvidence = await safelyDerive(() =>
    deriveUlcLinzDataExportEvidence(
      repositoryRoot,
      definition,
      auditSecurityLoggingEvidence,
    ),
  );
  const providerComplianceEvidence =
    coherentVolatileInputs && inputs.providerBoundEvidenceInput !== undefined
      ? await safelyDerive(() =>
          deriveUlcLinzM5GBoundProductionEvidence(
            inputs.providerBoundEvidenceInput,
            { now: nowDate },
          ),
        )
      : EMPTY_EVIDENCE;
  const controlPlaneEvidence =
    coherentVolatileInputs && inputs.controlPlaneEvidenceInput !== undefined
      ? await safelyDerive(() =>
          deriveUlcLinzM5HControlPlaneEvidence(
            inputs.controlPlaneEvidenceInput,
            { now: nowDate },
          ),
        )
      : EMPTY_EVIDENCE;
  const highPrivacyEvidence = await safelyDerive(() =>
    deriveUlcLinzHighPrivacyProductionEvidenceFromOwners(
      repositoryRoot,
      definition,
      coherentVolatileInputs ? inputs : EMPTY_EVIDENCE,
      { now: nowDate },
    ),
  );

  return composeUlcLinzM5JProductionEvidence(
    Object.freeze({
      providerCompliance: providerComplianceEvidence,
      rolesAndPermissions: rolesAndPermissionsEvidence,
      lifecycle: lifecycleEvidence,
      dataExport: dataExportEvidence,
      auditSecurityLogging: auditSecurityLoggingEvidence,
      highPrivacy: highPrivacyEvidence,
      repository: repositoryEvidence,
      controlPlane: controlPlaneEvidence,
    }),
  );
}

export function composeUlcLinzM5JProductionEvidence(
  ownerEvidence,
  { criteria = REQUIRED_PRODUCTION_READINESS_CRITERIA } = {},
) {
  if (!isUlcLinzM5JOwnerMatrixComplete(criteria)) return EMPTY_EVIDENCE;
  if (!isExactOwnerContainer(ownerEvidence)) return EMPTY_EVIDENCE;

  const normalizedOwners = new Map();
  for (const entry of ULC_LINZ_M5_J_OWNER_MATRIX) {
    normalizedOwners.set(
      entry.owner,
      normalizeCriterionEvidence(ownerEvidence[entry.owner], entry.criteria),
    );
  }

  const ownerByCriterion = ownerByCriterionMap();
  const evidence = {};
  for (const criterion of criteria) {
    const owner = ownerByCriterion.get(criterion.id);
    if (owner === undefined) return EMPTY_EVIDENCE;
    const normalized = normalizedOwners.get(owner);
    if (normalized?.[criterion.id] === true) evidence[criterion.id] = true;
  }
  return Object.freeze(evidence);
}

export function isUlcLinzM5JOwnerMatrixComplete(
  criteria = REQUIRED_PRODUCTION_READINESS_CRITERIA,
) {
  if (!Array.isArray(criteria)) return false;
  const canonicalIds = [];
  for (const criterion of criteria) {
    if (
      criterion === null ||
      typeof criterion !== "object" ||
      typeof criterion.id !== "string" ||
      canonicalIds.includes(criterion.id)
    ) return false;
    canonicalIds.push(criterion.id);
  }

  const assignedIds = [];
  const ownerNames = new Set();
  for (const entry of ULC_LINZ_M5_J_OWNER_MATRIX) {
    if (ownerNames.has(entry.owner)) return false;
    ownerNames.add(entry.owner);
    for (const criterionId of entry.criteria) {
      if (assignedIds.includes(criterionId)) return false;
      assignedIds.push(criterionId);
    }
  }

  if (canonicalIds.length !== assignedIds.length) return false;
  return canonicalIds.every((criterionId) => assignedIds.includes(criterionId));
}

function hasCoherentVolatileResourceBinding(inputs, now) {
  try {
    const fingerprints = [];
    for (const candidate of [
      inputs.providerBoundEvidenceInput,
      inputs.controlPlaneEvidenceInput,
      inputs.auditSecurityLoggingEvidenceInput,
      inputs.lifecycleActivationEvidenceInput,
    ]) {
      if (candidate === undefined) continue;
      if (!isPlainObject(candidate) || !isPlainObject(candidate.resourceBindingEvidence)) return false;
      fingerprints.push(
        deriveUlcLinzM5GResourceBindingFingerprint(
          candidate.resourceBindingEvidence,
          { now },
        ),
      );
    }
    return fingerprints.length < 2 || fingerprints.every((value) => value === fingerprints[0]);
  } catch {
    return false;
  }
}

function ownerByCriterionMap() {
  const result = new Map();
  for (const entry of ULC_LINZ_M5_J_OWNER_MATRIX) {
    for (const criterionId of entry.criteria) {
      if (result.has(criterionId)) return new Map();
      result.set(criterionId, entry.owner);
    }
  }
  return result;
}

function isExactOwnerContainer(value) {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedOwners = ULC_LINZ_M5_J_OWNER_MATRIX.map((entry) => entry.owner);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== expectedOwners.length ||
    expectedOwners.some((owner) => !Object.hasOwn(descriptors, owner)) ||
    keys.some((key) => !expectedOwners.includes(key))
  ) return false;
  return Object.values(descriptors).every(
    (descriptor) =>
      Object.hasOwn(descriptor, "value") &&
      descriptor.enumerable === true &&
      descriptor.get === undefined &&
      descriptor.set === undefined,
  );
}

function normalizeExternalInputs(value) {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) return EMPTY_EVIDENCE;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.some((key) => !EXTERNAL_INPUT_FIELDS.includes(key))) return EMPTY_EVIDENCE;
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) return EMPTY_EVIDENCE;
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function normalizeCriterionEvidence(value, allowedCriteria) {
  if (value === undefined) return EMPTY_EVIDENCE;
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) return EMPTY_EVIDENCE;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.some((key) => !allowedCriteria.includes(key))) return EMPTY_EVIDENCE;
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) return EMPTY_EVIDENCE;
    if (descriptor.value === true) result[key] = true;
  }
  return Object.freeze(result);
}

async function safelyDerive(derive) {
  try {
    const evidence = await derive();
    return isPlainObject(evidence) ? evidence : EMPTY_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
  }
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("ULC Linz M5-J evidence clock is invalid.");
  }
  return new Date(value.getTime());
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

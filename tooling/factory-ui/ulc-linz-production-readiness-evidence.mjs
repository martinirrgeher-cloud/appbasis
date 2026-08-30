import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { deriveUlcLinzM5FAuditSecurityLoggingRepositoryEvidence } from "../ulc-linz-m5-audit-security-logging-evidence.mjs";
import { deriveUlcLinzM5HControlPlaneRepositoryEvidence } from "../ulc-linz-m5-control-plane-evidence.mjs";
import { deriveUlcLinzM5ProviderProductionEvidence } from "../ulc-linz-m5-provider-evidence.mjs";
import { bindUlcLinzM5TargetPolicy } from "../ulc-linz-m5-target-policy.mjs";
import { HIGH_PRIVACY_PROFILE, isCanonicalHighPrivacyProfile } from "./high-privacy-profile.mjs";
import { ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY } from "./ulc-linz-lifecycle-evidence.mjs";
import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./repository-production-readiness-evidence.mjs";
import { deriveUlcLinzDataExportEvidence } from "./ulc-linz-data-export-evidence.mjs";
import { deriveUlcLinzRolesAndPermissionsEvidence } from "./ulc-linz-roles-permissions-evidence.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const SNAPSHOT_PATH = "apps/ulc-linz/privacy/m5-security-privacy-readiness.json";
const SNAPSHOT_KEYS = Object.freeze(["schemaVersion", "application", "gate", "criteria"]);
const CRITERION_KEYS = Object.freeze(["id", "status", "evidence"]);
const PROVIDER_CRITERIA = Object.freeze([
  "dataRegion",
  "dpa",
  "encryption",
  "subprocessors",
]);
const HIGH_PRIVACY_ASSESSMENT = Object.freeze({
  schemaVersion: 1,
  application: "ulc-linz",
  operatorProfile: "Verein",
  highPrivacyProfileId: "appbasis-high-privacy-v0.1",
  applicability: Object.freeze(["children"]),
  decision: "high-privacy-required",
  basis: Object.freeze(["children-and-youth-athlete-data"]),
});

export const ULC_LINZ_M5_J_OWNER_MATRIX = Object.freeze([
  Object.freeze({ owner: "providerCompliance", criteria: Object.freeze(PROVIDER_CRITERIA) }),
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
    const root = resolve(repositoryRoot);
    const snapshot = JSON.parse(await readFile(join(root, SNAPSHOT_PATH), "utf8"));
    const ownerEvidence = await ownerEvidenceFromSnapshot(
      root,
      definition,
      snapshot,
      ownerInputs,
      now,
    );
    return composeUlcLinzM5JProductionEvidence(ownerEvidence);
  } catch {
    return EMPTY_EVIDENCE;
  }
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

async function ownerEvidenceFromSnapshot(
  repositoryRoot,
  definition,
  snapshot,
  ownerInputs,
  now,
) {
  if (!isExactRecord(snapshot, SNAPSHOT_KEYS)) throw new Error("M5 snapshot is invalid.");
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.application !== "ulc-linz" ||
    snapshot.gate !== "security-privacy-ready-v0.1" ||
    !Array.isArray(snapshot.criteria) ||
    snapshot.criteria.length !== REQUIRED_PRODUCTION_READINESS_CRITERIA.length
  ) {
    throw new Error("M5 snapshot is invalid.");
  }

  const ownerByCriterion = ownerByCriterionMap();
  const owners = Object.fromEntries(
    ULC_LINZ_M5_J_OWNER_MATRIX.map(({ owner }) => [owner, {}]),
  );
  const verifiedCriteria = new Set();

  for (let index = 0; index < REQUIRED_PRODUCTION_READINESS_CRITERIA.length; index += 1) {
    const expected = REQUIRED_PRODUCTION_READINESS_CRITERIA[index];
    const criterion = snapshot.criteria[index];
    if (!isExactRecord(criterion, CRITERION_KEYS) || criterion.id !== expected.id) {
      throw new Error("M5 criterion ordering is invalid.");
    }
    if (criterion.status !== "verified" && criterion.status !== "open") {
      throw new Error("M5 criterion status is invalid.");
    }
    if (PROVIDER_CRITERIA.includes(criterion.id) && criterion.status !== "open") {
      throw new Error("Provider M5 criteria cannot be verified by repository snapshot.");
    }
    if (!Array.isArray(criterion.evidence)) {
      throw new Error("M5 criterion evidence is invalid.");
    }
    if (criterion.status === "verified" && criterion.evidence.length < 1) {
      throw new Error("Verified M5 criterion requires evidence references.");
    }

    const seen = new Set();
    for (const path of criterion.evidence) {
      if (!isSafeRepositoryPath(path) || seen.has(path)) {
        throw new Error("M5 evidence reference is invalid.");
      }
      seen.add(path);
      await readFile(join(repositoryRoot, path));
    }
    if (criterion.status === "verified") verifiedCriteria.add(criterion.id);
  }

  const [
    providerEvidence,
    roleEvidence,
    lifecycleEvidence,
    exportEvidence,
    auditEvidence,
    highPrivacyEvidence,
    repositoryEvidence,
    controlPlaneEvidence,
  ] = await Promise.all([
    Promise.resolve(deriveProviderOwnerEvidence(ownerInputs, now)),
    deriveUlcLinzRolesAndPermissionsEvidence(repositoryRoot, definition),
    deriveLifecycleRepositoryEvidence(repositoryRoot, snapshot),
    deriveUlcLinzDataExportEvidence(repositoryRoot, definition, { auditSecurityLogging: true }),
    Promise.resolve(deriveUlcLinzM5FAuditSecurityLoggingRepositoryEvidence(repositoryRoot)),
    deriveHighPrivacyRepositoryEvidence(repositoryRoot, definition),
    Promise.resolve(deriveRepositoryProductionReadinessEvidence(definition)),
    Promise.resolve(deriveUlcLinzM5HControlPlaneRepositoryEvidence(repositoryRoot)),
  ]);

  for (const criterionId of PROVIDER_CRITERIA) {
    if (providerEvidence[criterionId] === true) {
      owners.providerCompliance[criterionId] = true;
    }
  }

  const staticOwnerChecks = Object.freeze({
    rolesAndPermissions: roleEvidence?.rolesAndPermissions === true,
    deletionConcept: lifecycleEvidence.deletionConcept === true,
    retention: lifecycleEvidence.retention === true,
    dataExport: exportEvidence?.dataExport === true,
    auditSecurityLogging: auditEvidence.auditSecurityLogging === true,
    highPrivacyProfile: highPrivacyEvidence.highPrivacyProfile === true,
    secretsOutsideAppManifests: repositoryEvidence?.secretsOutsideAppManifests === true,
    privilegedControlPlaneIsolation:
      controlPlaneEvidence.privilegedControlPlaneIsolation === true,
  });

  for (const criterionId of verifiedCriteria) {
    if (staticOwnerChecks[criterionId] !== true) continue;
    const owner = ownerByCriterion.get(criterionId);
    if (owner === undefined) throw new Error("M5 criterion owner is missing.");
    owners[owner][criterionId] = true;
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(owners).map(([owner, evidence]) => [owner, Object.freeze(evidence)]),
    ),
  );
}

function deriveProviderOwnerEvidence(ownerInputs, now) {
  const sourceEvidence = providerComplianceEvidenceFromInputs(ownerInputs);
  if (sourceEvidence === undefined) return EMPTY_EVIDENCE;
  try {
    return deriveUlcLinzM5ProviderProductionEvidence(sourceEvidence, {
      now: canonicalNow(now),
    });
  } catch {
    return EMPTY_EVIDENCE;
  }
}

function providerComplianceEvidenceFromInputs(ownerInputs) {
  if (!isPlainObject(ownerInputs) || Object.getOwnPropertySymbols(ownerInputs).length !== 0) {
    return undefined;
  }

  const direct = safeDataProperty(ownerInputs, "providerComplianceEvidence");
  if (direct.found) return direct.value;

  const bound = safeDataProperty(ownerInputs, "providerBoundEvidenceInput");
  if (!bound.found || !isPlainObject(bound.value)) return undefined;
  const nested = safeDataProperty(bound.value, "complianceEvidence");
  return nested.found ? nested.value : undefined;
}

function safeDataProperty(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return Object.freeze({ found: false, value: undefined });
  if (
    !Object.hasOwn(descriptor, "value") ||
    descriptor.enumerable !== true ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  ) {
    return Object.freeze({ found: false, value: undefined });
  }
  return Object.freeze({ found: true, value: descriptor.value });
}

function canonicalNow(value) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("M5 evidence clock is invalid.");
  return parsed.toISOString();
}

async function deriveLifecycleRepositoryEvidence(repositoryRoot, snapshot) {
  const policyByPath = new Map(
    ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.map(({ path, gitBlobSha }) => [
      path,
      gitBlobSha,
    ]),
  );
  for (const criterionId of ["deletionConcept", "retention"]) {
    const criterion = snapshot.criteria.find(({ id }) => id === criterionId);
    if (criterion === undefined || criterion.evidence.length < 1) return EMPTY_EVIDENCE;
    for (const path of criterion.evidence) {
      const expectedSha = policyByPath.get(path);
      if (expectedSha === undefined) return EMPTY_EVIDENCE;
      const raw = await readFile(join(repositoryRoot, path), "utf8");
      if (gitBlobSha(raw.replaceAll("\r\n", "\n")) !== expectedSha) return EMPTY_EVIDENCE;
    }
  }
  return Object.freeze({ deletionConcept: true, retention: true });
}

async function deriveHighPrivacyRepositoryEvidence(repositoryRoot, definition) {
  try {
    const targetPolicy = bindUlcLinzM5TargetPolicy(definition);
    if (
      !isCanonicalHighPrivacyProfile(HIGH_PRIVACY_PROFILE) ||
      targetPolicy.highPrivacyProfileId !== HIGH_PRIVACY_PROFILE.id
    ) {
      return EMPTY_EVIDENCE;
    }
    const assessment = JSON.parse(
      await readFile(
        join(repositoryRoot, "apps/ulc-linz/privacy/m5-high-privacy-assessment.json"),
        "utf8",
      ),
    );
    return isDeepStrictEqual(assessment, HIGH_PRIVACY_ASSESSMENT)
      ? Object.freeze({ highPrivacyProfile: true })
      : EMPTY_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
  }
}

function gitBlobSha(content) {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(content, "utf8")}\0`, "utf8")
    .update(content, "utf8")
    .digest("hex");
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

function isExactRecord(value, expectedKeys) {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(descriptors, key)) &&
    keys.every((key) => expectedKeys.includes(key)) &&
    Object.values(descriptors).every(
      (descriptor) =>
        Object.hasOwn(descriptor, "value") &&
        descriptor.enumerable === true &&
        descriptor.get === undefined &&
        descriptor.set === undefined,
    )
  );
}

function isSafeRepositoryPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

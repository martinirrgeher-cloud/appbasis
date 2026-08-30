import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { bindUlcLinzM5TargetPolicy } from "../ulc-linz-m5-target-policy.mjs";
import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const SNAPSHOT_PATH = "apps/ulc-linz/privacy/m5-security-privacy-readiness.json";
const SNAPSHOT_KEYS = Object.freeze(["schemaVersion", "application", "gate", "criteria"]);
const CRITERION_KEYS = Object.freeze(["id", "status", "evidence"]);

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
) {
  try {
    bindUlcLinzM5TargetPolicy(definition);
    const root = resolve(repositoryRoot);
    const snapshot = JSON.parse(await readFile(join(root, SNAPSHOT_PATH), "utf8"));
    const ownerEvidence = await ownerEvidenceFromSnapshot(root, snapshot);
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

async function ownerEvidenceFromSnapshot(repositoryRoot, snapshot) {
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

  for (let index = 0; index < REQUIRED_PRODUCTION_READINESS_CRITERIA.length; index += 1) {
    const expected = REQUIRED_PRODUCTION_READINESS_CRITERIA[index];
    const criterion = snapshot.criteria[index];
    if (!isExactRecord(criterion, CRITERION_KEYS) || criterion.id !== expected.id) {
      throw new Error("M5 criterion ordering is invalid.");
    }
    if (criterion.status !== "verified" && criterion.status !== "open") {
      throw new Error("M5 criterion status is invalid.");
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

    if (criterion.status === "verified") {
      const owner = ownerByCriterion.get(criterion.id);
      if (owner === undefined) throw new Error("M5 criterion owner is missing.");
      owners[owner][criterion.id] = true;
    }
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(owners).map(([owner, evidence]) => [owner, Object.freeze(evidence)]),
    ),
  );
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

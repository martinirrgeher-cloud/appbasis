import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  HIGH_PRIVACY_PROFILE,
  isCanonicalHighPrivacyProfile,
} from "./factory-ui/high-privacy-profile.mjs";
import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./factory-ui/production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./factory-ui/repository-production-readiness-evidence.mjs";
import { deriveUlcLinzDataExportEvidence } from "./factory-ui/ulc-linz-data-export-evidence.mjs";
import {
  deriveUlcLinzLifecycleContractDigest,
  deriveUlcLinzLifecycleEvidence,
} from "./factory-ui/ulc-linz-lifecycle-evidence.mjs";
import { deriveUlcLinzRolesAndPermissionsEvidence } from "./factory-ui/ulc-linz-roles-permissions-evidence.mjs";
import { deriveUlcLinzM5FAuditSecurityLoggingEvidence } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { deriveUlcLinzM5HControlPlaneEvidence } from "./ulc-linz-m5-control-plane-evidence.mjs";
import {
  deriveUlcLinzM5GBoundProductionEvidence,
  deriveUlcLinzM5GResourceBindingFingerprint,
} from "./ulc-linz-m5-provider-bound-evidence.mjs";
import {
  isCanonicalUlcLinzM5PermissionProvisioningBundle,
  ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
  ULC_LINZ_M5_KNOWN_CAPABILITIES,
} from "./ulc-linz-m5-permission-provisioning.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "./ulc-linz-m5-role-data-scope.mjs";
import {
  bindUlcLinzM5TargetPolicy,
  ULC_LINZ_M5_TARGET_POLICY,
} from "./ulc-linz-m5-target-policy.mjs";
import { evaluateUlcLinzProductionResourceBinding } from "./ulc-linz-m6-production-resource-binding.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const HIGH_PRIVACY_CRITERION_ID = "highPrivacyProfile";
const OWNER_INPUT_FIELDS = Object.freeze([
  "auditSecurityLoggingEvidenceInput",
  "providerBoundEvidenceInput",
  "controlPlaneEvidenceInput",
  "lifecycleActivationEvidenceInput",
  "backupRestoreEvidenceInput",
]);
const BACKUP_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "sourceDatabaseBindingId",
  "restoreTargetBindingId",
  "evidenceSource",
  "restoreTestedAt",
  "lifecycleContractDigest",
  "automaticBackupsEnabled",
  "retentionDefined",
  "preMigrationBackupDefined",
  "restoreProcedureDocumented",
  "restoreSucceeded",
  "dataIntegrityVerified",
  "authVerified",
  "permissionsVerified",
  "applicationSmokeVerified",
  "restoreReconciliationVerified",
]);
const OPERATOR_ASSESSMENT = Object.freeze({
  schemaVersion: 1,
  application: "ulc-linz",
  operatorProfile: "Verein",
  highPrivacyProfileId: "appbasis-high-privacy-v0.1",
  applicability: Object.freeze(["children"]),
  decision: "high-privacy-required",
  basis: Object.freeze(["children-and-youth-athlete-data"]),
});

export const ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS = Object.freeze([
  ...Object.keys(HIGH_PRIVACY_PROFILE.requirements),
]);

export async function deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners(
  repositoryRoot,
  definition,
  ownerInputs = {},
  { now = new Date() } = {},
) {
  assertCanonicalProfileBinding(definition);
  const inputs = validateOwnerInputs(ownerInputs);
  const nowDate = requiredDate(now);
  const volatileInputsCoherent = hasCoherentVolatileResourceBinding(inputs, nowDate);

  const [
    rolesAndPermissionsEvidence,
    lifecycleEvidence,
    operatorAssessmentEvidence,
    lifecycleContractDigest,
  ] = await Promise.all([
    deriveUlcLinzRolesAndPermissionsEvidence(repositoryRoot, definition),
    deriveUlcLinzLifecycleEvidence(
      repositoryRoot,
      definition,
      volatileInputsCoherent ? inputs.lifecycleActivationEvidenceInput : undefined,
      { now: nowDate },
    ),
    deriveOperatorUseCaseAssessmentEvidence(repositoryRoot),
    deriveLifecycleContractDigestSafely(repositoryRoot),
  ]);
  const leastPrivilegeEvidence = deriveLeastPrivilegeEvidence(
    rolesAndPermissionsEvidence,
  );
  const repositoryEvidence = deriveRepositoryProductionReadinessEvidence(definition);

  const auditSecurityLoggingEvidence =
    volatileInputsCoherent && inputs.auditSecurityLoggingEvidenceInput !== undefined
      ? deriveUlcLinzM5FAuditSecurityLoggingEvidence(
          inputs.auditSecurityLoggingEvidenceInput,
          { now: nowDate },
        )
      : EMPTY_EVIDENCE;
  const dataExportEvidence = await deriveUlcLinzDataExportEvidence(
    repositoryRoot,
    definition,
    auditSecurityLoggingEvidence,
  );
  const providerEvidence =
    volatileInputsCoherent && inputs.providerBoundEvidenceInput !== undefined
      ? deriveUlcLinzM5GBoundProductionEvidence(
          inputs.providerBoundEvidenceInput,
          { now: nowDate },
        )
      : EMPTY_EVIDENCE;
  const controlPlaneEvidence =
    volatileInputsCoherent && inputs.controlPlaneEvidenceInput !== undefined
      ? deriveUlcLinzM5HControlPlaneEvidence(
          inputs.controlPlaneEvidenceInput,
          { now: nowDate },
        )
      : EMPTY_EVIDENCE;
  const backupRestoreEvidence =
    volatileInputsCoherent &&
    inputs.backupRestoreEvidenceInput !== undefined &&
    inputs.providerBoundEvidenceInput !== undefined &&
    lifecycleContractDigest !== null
      ? deriveBackupRestoreEvidence(
          inputs.backupRestoreEvidenceInput,
          inputs.providerBoundEvidenceInput,
          lifecycleContractDigest,
          nowDate,
        )
      : EMPTY_EVIDENCE;

  const nonHighPrivacyProductionEvidence = Object.freeze({
    ...repositoryEvidence,
    ...rolesAndPermissionsEvidence,
    ...lifecycleEvidence,
    ...dataExportEvidence,
    ...auditSecurityLoggingEvidence,
    ...providerEvidence,
    ...controlPlaneEvidence,
  });

  return Object.freeze({
    securityPrivacyGate:
      isCanonicalAllRequiredSecurityPrivacyGate() &&
      hasEveryNonHighPrivacyProductionCriterion(nonHighPrivacyProductionEvidence),
    backupRestoreBeforeProduction:
      backupRestoreEvidence.backupRestoreBeforeProduction === true,
    accessControl: rolesAndPermissionsEvidence.rolesAndPermissions === true,
    privilegeModel: leastPrivilegeEvidence.leastPrivilege === true,
    secretsInNormalAppManifest:
      repositoryEvidence.secretsOutsideAppManifests === true,
    privilegedControlPlanePublicIngress:
      controlPlaneEvidence.privilegedControlPlaneIsolation === true,
    operatorUseCaseAssessment:
      operatorAssessmentEvidence.operatorUseCaseAssessment === true,
  });
}

export async function evaluateUlcLinzHighPrivacyComplianceFromOwners(
  repositoryRoot,
  definition,
  ownerInputs = {},
  options = {},
) {
  const requirementEvidence =
    await deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners(
      repositoryRoot,
      definition,
      ownerInputs,
      options,
    );
  return evaluateUlcLinzHighPrivacyCompliance(definition, requirementEvidence);
}

export async function deriveUlcLinzHighPrivacyProductionEvidenceFromOwners(
  repositoryRoot,
  definition,
  ownerInputs = {},
  options = {},
) {
  const compliance = await evaluateUlcLinzHighPrivacyComplianceFromOwners(
    repositoryRoot,
    definition,
    ownerInputs,
    options,
  );
  return compliance.highPrivacyProfile
    ? Object.freeze({ highPrivacyProfile: true })
    : EMPTY_EVIDENCE;
}

export function evaluateUlcLinzHighPrivacyCompliance(
  definition,
  requirementEvidence = {},
) {
  assertCanonicalProfileBinding(definition);
  validateRequirementEvidence(requirementEvidence);

  const requirements = Object.freeze(
    ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS.map((id) =>
      Object.freeze({
        id,
        status:
          Object.hasOwn(requirementEvidence, id) &&
          requirementEvidence[id] === true
            ? "verified"
            : "open",
      }),
    ),
  );
  const verifiedCount = requirements.filter(
    (requirement) => requirement.status === "verified",
  ).length;
  const requiredCount = requirements.length;
  const highPrivacyProfile = verifiedCount === requiredCount;

  return Object.freeze({
    appId: ULC_LINZ_M5_TARGET_POLICY.appId,
    profileId: HIGH_PRIVACY_PROFILE.id,
    status: highPrivacyProfile ? "verified" : "open",
    highPrivacyProfile,
    verifiedCount,
    requiredCount,
    requirements,
  });
}

export function deriveUlcLinzHighPrivacyProductionEvidence(
  definition,
  requirementEvidence = {},
) {
  const compliance = evaluateUlcLinzHighPrivacyCompliance(
    definition,
    requirementEvidence,
  );
  return compliance.highPrivacyProfile
    ? Object.freeze({ highPrivacyProfile: true })
    : EMPTY_EVIDENCE;
}

function deriveLeastPrivilegeEvidence(rolesAndPermissionsEvidence) {
  if (rolesAndPermissionsEvidence.rolesAndPermissions !== true) {
    return EMPTY_EVIDENCE;
  }
  if (
    !isCanonicalUlcLinzM5PermissionProvisioningBundle(
      ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
    ) ||
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.dataScopes.organizationBoundary !==
      "same-organization-only" ||
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.dataScopes.unknownCapability !== "deny" ||
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.principalPermissionMapping.unknownModule !==
      "deny"
  ) {
    return EMPTY_EVIDENCE;
  }

  const roles = ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE.roles;
  const adminRole = roles.find(
    (entry) =>
      entry.roleId === ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin,
  );
  const nonAdminRoles = ["trainer", "athlete", "parent"].map((sourceRole) =>
    roles.find(
      (entry) =>
        entry.roleId === ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds[sourceRole],
    ),
  );
  if (
    adminRole === undefined ||
    !isDeepStrictEqual(adminRole.capabilities, ULC_LINZ_M5_KNOWN_CAPABILITIES) ||
    nonAdminRoles.some(
      (entry) => entry === undefined || entry.capabilities.length !== 0,
    ) ||
    ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE.principalRoleAssignments.length !== 0
  ) {
    return EMPTY_EVIDENCE;
  }
  return Object.freeze({ leastPrivilege: true });
}

async function deriveOperatorUseCaseAssessmentEvidence(repositoryRoot) {
  try {
    const raw = await readFile(
      join(
        repositoryRoot,
        "apps",
        "ulc-linz",
        "privacy",
        "m5-high-privacy-assessment.json",
      ),
      "utf8",
    );
    const value = JSON.parse(raw);
    return isDeepStrictEqual(value, OPERATOR_ASSESSMENT)
      ? Object.freeze({ operatorUseCaseAssessment: true })
      : EMPTY_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
  }
}

async function deriveLifecycleContractDigestSafely(repositoryRoot) {
  try {
    return await deriveUlcLinzLifecycleContractDigest(repositoryRoot);
  } catch {
    return null;
  }
}

function deriveBackupRestoreEvidence(
  input,
  providerBoundEvidenceInput,
  expectedLifecycleContractDigest,
  now,
) {
  try {
    const evidence = exactRecord(input, BACKUP_FIELDS);
    const resourceBinding = evaluateUlcLinzProductionResourceBinding(
      providerBoundEvidenceInput.resourceBindingEvidence,
      { now },
    );
    if (
      resourceBinding.productionDatabaseBound !== true ||
      resourceBinding.runtimeContractVerified !== true
    ) {
      return EMPTY_EVIDENCE;
    }
    if (
      evidence.schemaVersion !== 1 ||
      evidence.application !== "ulc-linz" ||
      evidence.environment !== "production" ||
      evidence.evidenceSource !== "controlled-restore-run" ||
      evidence.lifecycleContractDigest !== expectedLifecycleContractDigest ||
      evidence.sourceDatabaseBindingId !==
        providerBoundEvidenceInput.resourceBindingEvidence.neon.databaseBindingId ||
      evidence.restoreTargetBindingId === evidence.sourceDatabaseBindingId ||
      evidence.automaticBackupsEnabled !== true ||
      evidence.retentionDefined !== true ||
      evidence.preMigrationBackupDefined !== true ||
      evidence.restoreProcedureDocumented !== true ||
      evidence.restoreSucceeded !== true ||
      evidence.dataIntegrityVerified !== true ||
      evidence.authVerified !== true ||
      evidence.permissionsVerified !== true ||
      evidence.applicationSmokeVerified !== true ||
      evidence.restoreReconciliationVerified !== true
    ) {
      return EMPTY_EVIDENCE;
    }
    requireOpaqueIdentifier(evidence.sourceDatabaseBindingId);
    requireOpaqueIdentifier(evidence.restoreTargetBindingId);
    const restoreTestedAt = canonicalTimestamp(evidence.restoreTestedAt);
    const resourceObservedAt = canonicalTimestamp(resourceBinding.observedAt);
    const resourceValidUntilOrReviewAt = canonicalTimestamp(
      resourceBinding.validUntilOrReviewAt,
    );
    if (
      restoreTestedAt === null ||
      resourceObservedAt === null ||
      resourceValidUntilOrReviewAt === null ||
      restoreTestedAt.getTime() < resourceObservedAt.getTime() ||
      restoreTestedAt.getTime() > now.getTime() ||
      restoreTestedAt.getTime() >= resourceValidUntilOrReviewAt.getTime()
    ) {
      return EMPTY_EVIDENCE;
    }
    return Object.freeze({ backupRestoreBeforeProduction: true });
  } catch {
    return EMPTY_EVIDENCE;
  }
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
      if (!isPlainObject(candidate) || !isPlainObject(candidate.resourceBindingEvidence)) {
        return false;
      }
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

function assertCanonicalProfileBinding(definition) {
  const targetPolicy = bindUlcLinzM5TargetPolicy(definition);
  if (
    !isCanonicalHighPrivacyProfile(HIGH_PRIVACY_PROFILE) ||
    targetPolicy.highPrivacyProfileId !== HIGH_PRIVACY_PROFILE.id ||
    targetPolicy.highPrivacyProfileId !== ULC_LINZ_M5_TARGET_POLICY.highPrivacyProfileId
  ) {
    throw new Error(
      "ULC Linz High-Privacy evidence is not bound to the canonical profile.",
    );
  }
}

function isCanonicalAllRequiredSecurityPrivacyGate() {
  const criterionIds = REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id);
  if (!criterionIds.includes(HIGH_PRIVACY_CRITERION_ID)) return false;
  const completeEvidence = Object.fromEntries(
    criterionIds.map((criterionId) => [criterionId, true]),
  );
  if (evaluateProductionReadiness(completeEvidence).productionReady !== true) {
    return false;
  }
  return criterionIds.every((criterionId) => {
    const incompleteEvidence = { ...completeEvidence };
    delete incompleteEvidence[criterionId];
    return evaluateProductionReadiness(incompleteEvidence).productionReady === false;
  });
}

function hasEveryNonHighPrivacyProductionCriterion(evidence) {
  return REQUIRED_PRODUCTION_READINESS_CRITERIA.filter(
    ({ id }) => id !== HIGH_PRIVACY_CRITERION_ID,
  ).every(({ id }) => evidence[id] === true);
}

function validateOwnerInputs(value) {
  if (!isPlainObject(value)) {
    throw new Error("ULC Linz High-Privacy owner inputs are invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !OWNER_INPUT_FIELDS.includes(key) ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("ULC Linz High-Privacy owner inputs are invalid.");
    }
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("ULC Linz High-Privacy owner inputs are invalid.");
  }
  return value;
}

function validateRequirementEvidence(evidence) {
  if (!isPlainObject(evidence)) {
    throw new Error(
      "ULC Linz High-Privacy requirement evidence must be a plain object.",
    );
  }
  for (const key of Reflect.ownKeys(evidence)) {
    if (
      typeof key !== "string" ||
      !ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS.includes(key)
    ) {
      throw new Error("ULC Linz High-Privacy requirement evidence is invalid.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(evidence, key);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      typeof descriptor.value !== "boolean"
    ) {
      throw new Error("ULC Linz High-Privacy requirement evidence is invalid.");
    }
  }
}

function exactRecord(value, fields) {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("ULC Linz High-Privacy operational evidence is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !fields.includes(key))
  ) {
    throw new Error("ULC Linz High-Privacy operational evidence is invalid.");
  }
  for (const descriptor of Object.values(descriptors)) {
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("ULC Linz High-Privacy operational evidence is invalid.");
    }
  }
  return value;
}

function requireOpaqueIdentifier(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new Error("ULC Linz High-Privacy operational evidence is invalid.");
  }
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }
  return parsed;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("ULC Linz High-Privacy evidence clock is invalid.");
  }
  return new Date(value.getTime());
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

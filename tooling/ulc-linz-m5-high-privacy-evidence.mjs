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
import { deriveUlcLinzLifecycleEvidence } from "./factory-ui/ulc-linz-lifecycle-evidence.mjs";
import { deriveUlcLinzRolesAndPermissionsEvidence } from "./factory-ui/ulc-linz-roles-permissions-evidence.mjs";
import { deriveUlcLinzM5HControlPlaneEvidence } from "./ulc-linz-m5-control-plane-evidence.mjs";
import { deriveUlcLinzM5GBoundProductionEvidence } from "./ulc-linz-m5-provider-bound-evidence.mjs";
import {
  bindUlcLinzM5TargetPolicy,
  ULC_LINZ_M5_TARGET_POLICY,
} from "./ulc-linz-m5-target-policy.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const HIGH_PRIVACY_CRITERION_ID = "highPrivacyProfile";
const OWNER_INPUT_FIELDS = Object.freeze([
  "auditSecurityLoggingEvidence",
  "providerBoundEvidenceInput",
  "controlPlaneEvidenceInput",
  "backupRestoreEvidence",
  "leastPrivilegeEvidence",
  "operatorUseCaseAssessmentEvidence",
]);

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
  const auditSecurityLoggingEvidence = exactOptionalOwnerEvidence(
    inputs.auditSecurityLoggingEvidence,
    "auditSecurityLogging",
  );
  const backupRestoreEvidence = exactOptionalOwnerEvidence(
    inputs.backupRestoreEvidence,
    "backupRestoreBeforeProduction",
  );
  const leastPrivilegeEvidence = exactOptionalOwnerEvidence(
    inputs.leastPrivilegeEvidence,
    "leastPrivilege",
  );
  const operatorUseCaseAssessmentEvidence = exactOptionalOwnerEvidence(
    inputs.operatorUseCaseAssessmentEvidence,
    "operatorUseCaseAssessment",
  );

  const [rolesAndPermissionsEvidence, lifecycleEvidence] = await Promise.all([
    deriveUlcLinzRolesAndPermissionsEvidence(repositoryRoot, definition),
    deriveUlcLinzLifecycleEvidence(repositoryRoot, definition),
  ]);
  const dataExportEvidence = await deriveUlcLinzDataExportEvidence(
    repositoryRoot,
    definition,
    auditSecurityLoggingEvidence,
  );
  const repositoryEvidence =
    deriveRepositoryProductionReadinessEvidence(definition);
  const providerEvidence =
    inputs.providerBoundEvidenceInput === undefined
      ? EMPTY_EVIDENCE
      : deriveUlcLinzM5GBoundProductionEvidence(
          inputs.providerBoundEvidenceInput,
          { now },
        );
  const controlPlaneEvidence =
    inputs.controlPlaneEvidenceInput === undefined
      ? EMPTY_EVIDENCE
      : deriveUlcLinzM5HControlPlaneEvidence(
          inputs.controlPlaneEvidenceInput,
          { now },
        );

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
      hasEveryNonHighPrivacyProductionCriterion(
        nonHighPrivacyProductionEvidence,
      ),
    backupRestoreBeforeProduction:
      backupRestoreEvidence.backupRestoreBeforeProduction === true,
    accessControl: rolesAndPermissionsEvidence.rolesAndPermissions === true,
    privilegeModel:
      rolesAndPermissionsEvidence.rolesAndPermissions === true &&
      leastPrivilegeEvidence.leastPrivilege === true,
    secretsInNormalAppManifest:
      repositoryEvidence.secretsOutsideAppManifests === true,
    privilegedControlPlanePublicIngress:
      controlPlaneEvidence.privilegedControlPlaneIsolation === true,
    operatorUseCaseAssessment:
      operatorUseCaseAssessmentEvidence.operatorUseCaseAssessment === true,
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

function assertCanonicalProfileBinding(definition) {
  const targetPolicy = bindUlcLinzM5TargetPolicy(definition);

  if (
    !isCanonicalHighPrivacyProfile(HIGH_PRIVACY_PROFILE) ||
    targetPolicy.highPrivacyProfileId !== HIGH_PRIVACY_PROFILE.id ||
    targetPolicy.highPrivacyProfileId !==
      ULC_LINZ_M5_TARGET_POLICY.highPrivacyProfileId
  ) {
    throw new Error(
      "ULC Linz High-Privacy evidence is not bound to the canonical profile.",
    );
  }
}

function isCanonicalAllRequiredSecurityPrivacyGate() {
  const criterionIds = REQUIRED_PRODUCTION_READINESS_CRITERIA.map(
    ({ id }) => id,
  );
  if (!criterionIds.includes(HIGH_PRIVACY_CRITERION_ID)) return false;

  const completeEvidence = Object.fromEntries(
    criterionIds.map((criterionId) => [criterionId, true]),
  );
  if (
    evaluateProductionReadiness(completeEvidence).productionReady !== true
  ) {
    return false;
  }

  return criterionIds.every((criterionId) => {
    const incompleteEvidence = { ...completeEvidence };
    delete incompleteEvidence[criterionId];
    return (
      evaluateProductionReadiness(incompleteEvidence).productionReady === false
    );
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

function exactOptionalOwnerEvidence(value, key) {
  if (value === undefined) return EMPTY_EVIDENCE;
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("ULC Linz High-Privacy owner evidence is invalid.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length === 0) return EMPTY_EVIDENCE;
  if (keys.length !== 1 || keys[0] !== key) {
    throw new Error("ULC Linz High-Privacy owner evidence is invalid.");
  }

  const descriptor = descriptors[key];
  if (
    !Object.hasOwn(descriptor, "value") ||
    descriptor.enumerable !== true ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    descriptor.value !== true
  ) {
    throw new Error("ULC Linz High-Privacy owner evidence is invalid.");
  }
  return Object.freeze({ [key]: true });
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

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

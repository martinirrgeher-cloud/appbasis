import {
  HIGH_PRIVACY_PROFILE,
  isCanonicalHighPrivacyProfile,
} from "./factory-ui/high-privacy-profile.mjs";
import {
  bindUlcLinzM5TargetPolicy,
  ULC_LINZ_M5_TARGET_POLICY,
} from "./ulc-linz-m5-target-policy.mjs";

export const ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS = Object.freeze([
  "securityPrivacyGate",
  "backupRestoreBeforeProduction",
  "accessControl",
  "privilegeModel",
  "secretsInNormalAppManifest",
  "privilegedControlPlanePublicIngress",
  "operatorUseCaseAssessment",
]);

export function evaluateUlcLinzHighPrivacyCompliance(
  definition,
  requirementEvidence = {},
) {
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
    appId: targetPolicy.appId,
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
    : Object.freeze({});
}

function validateRequirementEvidence(evidence) {
  if (!isPlainObject(evidence)) {
    throw new Error("ULC Linz High-Privacy requirement evidence must be a plain object.");
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

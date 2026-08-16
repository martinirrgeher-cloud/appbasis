import { parseAppDefinition } from "./app-definition.mjs";
import {
  HIGH_PRIVACY_PROFILE,
  isCanonicalHighPrivacyProfile,
} from "./factory-ui/high-privacy-profile.mjs";

const REQUIRED_PLATFORM_SERVICES = Object.freeze(["identity", "permissions"]);

// This is an app-specific target decision, not M5 readiness evidence.
// A future evidence adapter must still verify every production criterion
// independently before Production Ready can become true.
export const ULC_LINZ_M5_TARGET_POLICY = Object.freeze({
  appId: "ulc-linz",
  operatorProfile: "Verein",
  highPrivacyProfileId: "appbasis-high-privacy-v0.1",
  productionDatabaseRegionTarget: "EU / Frankfurt",
});

export function bindUlcLinzM5TargetPolicy(definition) {
  const parsed = parseAppDefinition(definition);

  if (parsed.appId !== ULC_LINZ_M5_TARGET_POLICY.appId) {
    throw new Error(
      `ULC Linz M5 target policy requires appId ${ULC_LINZ_M5_TARGET_POLICY.appId}.`,
    );
  }

  for (const service of REQUIRED_PLATFORM_SERVICES) {
    if (!parsed.platformServices.includes(service)) {
      throw new Error(
        `ULC Linz M5 target policy requires platform service ${service}.`,
      );
    }
  }

  if (
    !isCanonicalHighPrivacyProfile(HIGH_PRIVACY_PROFILE) ||
    HIGH_PRIVACY_PROFILE.id !== ULC_LINZ_M5_TARGET_POLICY.highPrivacyProfileId
  ) {
    throw new Error(
      "ULC Linz M5 target policy is not bound to the canonical High-Privacy profile.",
    );
  }

  return ULC_LINZ_M5_TARGET_POLICY;
}

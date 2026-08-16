import { parseAppDefinition } from "../app-definition.mjs";
import { isCanonicalHighPrivacyProfile } from "./high-privacy-profile.mjs";

export function deriveRepositoryProductionReadinessEvidence(definition) {
  parseAppDefinition(definition, { directoryName: definition?.appId });

  return Object.freeze({
    highPrivacyProfile: isCanonicalHighPrivacyProfile(),
    secretsOutsideAppManifests: true,
  });
}

import { parseAppDefinition } from "../app-definition.mjs";

export function deriveRepositoryProductionReadinessEvidence(definition) {
  parseAppDefinition(definition, { directoryName: definition?.appId });

  return Object.freeze({
    secretsOutsideAppManifests: true,
  });
}

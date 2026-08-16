export const HIGH_PRIVACY_PROFILE = deepFreeze({
  schemaVersion: 1,
  id: "appbasis-high-privacy-v0.1",
  appliesTo: ["children", "school", "sensitive-data"],
  requirements: {
    securityPrivacyGate: "all-required",
    backupRestoreBeforeProduction: "required",
    accessControl: "deny-by-default",
    privilegeModel: "least-privilege",
    secretsInNormalAppManifest: "forbidden",
    privilegedControlPlanePublicIngress: "forbidden",
    operatorUseCaseAssessment: "required",
  },
});

const EXPECTED_PROFILE = Object.freeze({
  schemaVersion: 1,
  id: "appbasis-high-privacy-v0.1",
  appliesTo: Object.freeze(["children", "school", "sensitive-data"]),
  requirements: Object.freeze({
    securityPrivacyGate: "all-required",
    backupRestoreBeforeProduction: "required",
    accessControl: "deny-by-default",
    privilegeModel: "least-privilege",
    secretsInNormalAppManifest: "forbidden",
    privilegedControlPlanePublicIngress: "forbidden",
    operatorUseCaseAssessment: "required",
  }),
});

export function isCanonicalHighPrivacyProfile(profile = HIGH_PRIVACY_PROFILE) {
  return canonicalJson(profile) === canonicalJson(EXPECTED_PROFILE);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
  } else if (isPlainObject(value)) {
    Object.values(value).forEach(deepFreeze);
  }
  return Object.freeze(value);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const PROFILE_KEYS = Object.freeze([
  "schemaVersion",
  "id",
  "appliesTo",
  "requirements",
]);
const EXPECTED_APPLIES_TO = Object.freeze([
  "children",
  "school",
  "sensitive-data",
]);
const REQUIREMENT_KEYS = Object.freeze([
  "securityPrivacyGate",
  "backupRestoreBeforeProduction",
  "accessControl",
  "privilegeModel",
  "secretsInNormalAppManifest",
  "privilegedControlPlanePublicIngress",
  "operatorUseCaseAssessment",
]);
const EXPECTED_REQUIREMENTS = Object.freeze({
  securityPrivacyGate: "all-required",
  backupRestoreBeforeProduction: "required",
  accessControl: "deny-by-default",
  privilegeModel: "least-privilege",
  secretsInNormalAppManifest: "forbidden",
  privilegedControlPlanePublicIngress: "forbidden",
  operatorUseCaseAssessment: "required",
});

export const HIGH_PRIVACY_PROFILE = deepFreeze({
  schemaVersion: 1,
  id: "appbasis-high-privacy-v0.1",
  appliesTo: [...EXPECTED_APPLIES_TO],
  requirements: { ...EXPECTED_REQUIREMENTS },
});

export function isCanonicalHighPrivacyProfile(profile = HIGH_PRIVACY_PROFILE) {
  if (!hasExactEnumerableDataProperties(profile, PROFILE_KEYS)) return false;

  const profileDescriptors = Object.getOwnPropertyDescriptors(profile);
  const schemaVersion = profileDescriptors.schemaVersion.value;
  const id = profileDescriptors.id.value;
  const appliesTo = profileDescriptors.appliesTo.value;
  const requirements = profileDescriptors.requirements.value;

  return (
    typeof schemaVersion === "number" &&
    schemaVersion === 1 &&
    typeof id === "string" &&
    id === "appbasis-high-privacy-v0.1" &&
    isExactStringArray(appliesTo, EXPECTED_APPLIES_TO) &&
    hasExactEnumerableDataProperties(requirements, REQUIREMENT_KEYS) &&
    REQUIREMENT_KEYS.every((key) => {
      const value = Object.getOwnPropertyDescriptor(requirements, key)?.value;
      return typeof value === "string" && value === EXPECTED_REQUIREMENTS[key];
    })
  );
}

function isExactStringArray(value, expected) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== expected.length
  ) {
    return false;
  }

  const expectedKeys = [
    ...expected.map((_, index) => String(index)),
    "length",
  ];
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => ownKeys.includes(key))
  ) {
    return false;
  }

  return expected.every((expectedValue, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return (
      descriptor !== undefined &&
      Object.hasOwn(descriptor, "value") &&
      descriptor.enumerable === true &&
      typeof descriptor.value === "string" &&
      descriptor.value === expectedValue
    );
  });
}

function hasExactEnumerableDataProperties(value, expectedKeys) {
  if (!isPlainObject(value)) return false;

  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return false;
  }

  return expectedKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      Object.hasOwn(descriptor, "value") &&
      descriptor.enumerable === true
    );
  });
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

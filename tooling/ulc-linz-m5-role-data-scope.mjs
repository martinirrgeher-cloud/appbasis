const ROLE_IDS = Object.freeze(["admin", "trainer", "athlete", "parent"]);

const KINDERTRAINER_MODULES = Object.freeze([
  "kindertraining",
  "u12",
  "u14",
  "countdown",
]);
const LEISTUNGSTRAINER_VIEW_MODULES = Object.freeze([
  "performance_registration",
  "training_planning",
  "training_overview",
  "training_documentation",
  "exercise_catalog",
  "training_blocks",
  "athletes",
  "countdown",
]);
const LEISTUNGSTRAINER_EDIT_MODULES = Object.freeze([
  "performance_registration",
  "training_planning",
  "training_documentation",
  "exercise_catalog",
  "training_blocks",
  "athletes",
  "countdown",
]);
const ATHLETE_VIEW_MODULES = Object.freeze([
  "performance_registration",
  "training_overview",
  "training_documentation",
  "countdown",
]);
const ATHLETE_EDIT_MODULES = Object.freeze([
  "performance_registration",
  "training_documentation",
  "countdown",
]);
const PARENT_VIEW_MODULES = Object.freeze(["kindertraining", "u12", "u14"]);

// App-specific M5 Phase-B target contract, derived from the current ULC Linz
// production source. This is policy input only: it does not make rolesRights
// verified until the ULC target runtime consumes and proves these boundaries.
export const ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY = deepFreeze({
  schemaVersion: 1,
  id: "ulc-linz-role-data-scope-v0.1",
  sourceSnapshot: {
    repository: "martinirrgeher-cloud/ulc-linz",
    commit: "682ed5d37e7206f7fa521e5dab40f840cc303f0b",
  },
  roles: [...ROLE_IDS],
  permissionModel: {
    admin: {
      role: "admin",
      mode: "own-organization-admin",
    },
    kindertrainer: {
      role: "trainer",
      view: [...KINDERTRAINER_MODULES],
      edit: [...KINDERTRAINER_MODULES],
    },
    leistungstrainer: {
      role: "trainer",
      view: [...LEISTUNGSTRAINER_VIEW_MODULES],
      edit: [...LEISTUNGSTRAINER_EDIT_MODULES],
    },
    athlete: {
      role: "athlete",
      view: [...ATHLETE_VIEW_MODULES],
      edit: [...ATHLETE_EDIT_MODULES],
    },
    parent: {
      role: "parent",
      view: [...PARENT_VIEW_MODULES],
      edit: [],
    },
  },
  dataScopes: {
    organizationBoundary: "same-organization-only",
    inactiveMembership: "deny",
    unknownCapability: "deny",
    auditVisibility: "admin-only",
    canEditImpliesView: true,
    lastActiveAdmin: "protected",
    athleteLink: {
      role: "athlete",
      relationType: "self",
      cardinality: "one",
      explicitLinksOnly: true,
    },
    parentLink: {
      role: "parent",
      relationType: "managed",
      cardinality: "many",
      explicitLinksOnly: true,
    },
  },
});

export function isCanonicalUlcLinzM5RoleDataScopePolicy(
  value = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
) {
  return exactValue(value, ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY);
}

function exactValue(value, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return false;
    }
    if (value.length !== expected.length) return false;
    return expected.every((entry, index) => exactValue(value[index], entry));
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(value)) return false;
    const expectedKeys = Reflect.ownKeys(expected);
    const valueKeys = Reflect.ownKeys(value);
    if (
      valueKeys.length !== expectedKeys.length ||
      expectedKeys.some((key) => !valueKeys.includes(key))
    ) {
      return false;
    }
    return expectedKeys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        Object.hasOwn(descriptor, "value") &&
        descriptor.enumerable === true &&
        exactValue(descriptor.value, expected[key])
      );
    });
  }

  return Object.is(value, expected);
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

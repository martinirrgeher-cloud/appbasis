const SOURCE_ROLE_IDS = Object.freeze(["admin", "trainer", "athlete", "parent"]);

const RUNTIME_ROLE_IDS = Object.freeze({
  admin: "ulc-linz:admin",
  trainer: "ulc-linz:trainer",
  athlete: "ulc-linz:athlete",
  parent: "ulc-linz:parent",
});

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
// production source. This is policy input only: it does not make
// rolesAndPermissions verified until the ULC target runtime consumes and proves
// these boundaries. ULC permission templates are defaults, not distinct source
// roles; individually managed module permissions remain authoritative and map
// to the existing AppBasis principal grant/revoke model.
export const ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY = deepFreeze({
  schemaVersion: 1,
  id: "ulc-linz-role-data-scope-v0.1",
  sourceSnapshot: {
    repository: "martinirrgeher-cloud/ulc-linz",
    commit: "682ed5d37e7206f7fa521e5dab40f840cc303f0b",
  },
  sourceRoles: [...SOURCE_ROLE_IDS],
  runtimeRoleIds: { ...RUNTIME_ROLE_IDS },
  permissionTemplates: {
    kindertrainer: {
      sourceRole: "trainer",
      semantics: "defaults-only",
      view: [...KINDERTRAINER_MODULES],
      edit: [...KINDERTRAINER_MODULES],
    },
    leistungstrainer: {
      sourceRole: "trainer",
      semantics: "defaults-only",
      view: [...LEISTUNGSTRAINER_VIEW_MODULES],
      edit: [...LEISTUNGSTRAINER_EDIT_MODULES],
    },
    athlete: {
      sourceRole: "athlete",
      semantics: "defaults-only",
      view: [...ATHLETE_VIEW_MODULES],
      edit: [...ATHLETE_EDIT_MODULES],
    },
    parent: {
      sourceRole: "parent",
      semantics: "defaults-only",
      view: [...PARENT_VIEW_MODULES],
      edit: [],
    },
  },
  principalPermissionMapping: {
    sourceField: "permissions",
    sourceShape: "module-canView-canEdit",
    targetMechanism: "principal-grants-revokes",
    capabilityNamespace: "ulc-linz:module",
    viewAction: "view",
    editAction: "edit",
    editImpliesView: true,
    unknownModule: "deny",
  },
  dataScopes: {
    organizationBoundary: "same-organization-only",
    inactiveMembership: "deny",
    unknownCapability: "deny",
    auditVisibility: "admin-only",
    lastActiveAdmin: "protected",
    athleteLink: {
      sourceRole: "athlete",
      relationType: "self",
      cardinality: "one",
      explicitLinksOnly: true,
    },
    parentLink: {
      sourceRole: "parent",
      relationType: "managed",
      cardinality: "many",
      explicitLinksOnly: true,
    },
  },
});

export function isCanonicalUlcLinzM5RoleDataScopePolicy(
  value = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
) {
  return (
    exactValue(value, ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY) &&
    hasUniqueRuntimeRoleIds(value)
  );
}

function hasUniqueRuntimeRoleIds(value) {
  if (!isPlainObject(value) || !isPlainObject(value.runtimeRoleIds)) return false;
  const roleIds = Object.values(value.runtimeRoleIds);
  return (
    roleIds.length > 0 &&
    roleIds.every((roleId) => typeof roleId === "string" && roleId.length > 0) &&
    new Set(roleIds).size === roleIds.length
  );
}

function exactValue(value, expected) {
  if (Array.isArray(expected)) {
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
    const valueKeys = Reflect.ownKeys(value);
    if (
      valueKeys.length !== expectedKeys.length ||
      expectedKeys.some((key) => !valueKeys.includes(key))
    ) {
      return false;
    }

    return expected.every((entry, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      return (
        descriptor !== undefined &&
        Object.hasOwn(descriptor, "value") &&
        descriptor.enumerable === true &&
        exactValue(descriptor.value, entry)
      );
    });
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

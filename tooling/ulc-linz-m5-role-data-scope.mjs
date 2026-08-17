import runtimePolicy from "../apps/ulc-linz/worker/role-data-scope.json" with { type: "json" };

// The real ULC runtime owns the app-specific M5 role/data-scope contract.
// Tooling consumes that exact contract so policy verification and runtime
// authorization cannot drift into parallel implementations.
export const ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY = deepFreeze(runtimePolicy);

export function isCanonicalUlcLinzM5RoleDataScopePolicy(
  value = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
) {
  return (
    exactValue(value, ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY) &&
    hasUniqueRuntimeRoleIds(value) &&
    hasConsistentAdminRuntimeRole(value)
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

function hasConsistentAdminRuntimeRole(value) {
  return (
    isPlainObject(value) &&
    isPlainObject(value.runtimeRoleIds) &&
    isPlainObject(value.adminAuthorization) &&
    value.adminAuthorization.runtimeRoleId === value.runtimeRoleIds.admin
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

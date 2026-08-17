import { ULC_LINZ_M5_MANAGED_MODULE_KEYS } from "./ulc-linz-m5-principal-permission-mapping.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "./ulc-linz-m5-role-data-scope.mjs";

const mapping = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.principalPermissionMapping;

export const ULC_LINZ_M5_KNOWN_CAPABILITIES = Object.freeze(
  ULC_LINZ_M5_MANAGED_MODULE_KEYS.flatMap((moduleKey) => [
    `${mapping.capabilityNamespace}:${moduleKey}:${mapping.viewAction}`,
    `${mapping.capabilityNamespace}:${moduleKey}:${mapping.editAction}`,
  ]).sort((left, right) => left.localeCompare(right)),
);

const emptyCapabilities = () => Object.freeze([]);

// Concrete first consumer of the existing PermissionProvisioningBundle shape.
// Admin receives every known ULC module capability through its role. All
// non-admin module rights are intentionally principal-specific, so their base
// roles remain empty and cannot silently broaden individual grants/revokes.
export const ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE = Object.freeze({
  knownCapabilities: ULC_LINZ_M5_KNOWN_CAPABILITIES,
  roles: Object.freeze([
    Object.freeze({
      roleId: ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin,
      capabilities: ULC_LINZ_M5_KNOWN_CAPABILITIES,
    }),
    Object.freeze({
      roleId: ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.trainer,
      capabilities: emptyCapabilities(),
    }),
    Object.freeze({
      roleId: ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.athlete,
      capabilities: emptyCapabilities(),
    }),
    Object.freeze({
      roleId: ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.parent,
      capabilities: emptyCapabilities(),
    }),
  ]),
  principalRoleAssignments: Object.freeze([]),
});

export function isCanonicalUlcLinzM5PermissionProvisioningBundle(
  value = ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
) {
  return exactValue(value, ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE);
}

function exactValue(value, expected) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(value) &&
      Object.getPrototypeOf(value) === Array.prototype &&
      value.length === expected.length &&
      Reflect.ownKeys(value).length === Reflect.ownKeys(expected).length &&
      expected.every((entry, index) => exactValue(value[index], entry))
    );
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(value)) return false;
    const expectedKeys = Reflect.ownKeys(expected);
    const valueKeys = Reflect.ownKeys(value);
    return (
      valueKeys.length === expectedKeys.length &&
      expectedKeys.every(
        (key) => valueKeys.includes(key) && exactValue(value[key], expected[key]),
      )
    );
  }
  return Object.is(value, expected);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

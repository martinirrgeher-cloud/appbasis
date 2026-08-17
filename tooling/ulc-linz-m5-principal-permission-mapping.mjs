import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "./ulc-linz-m5-role-data-scope.mjs";

export const ULC_LINZ_M5_MANAGED_MODULE_KEYS = Object.freeze([
  "kindertraining",
  "u12",
  "u14",
  "performance_registration",
  "training_documentation",
  "training_planning",
  "training_overview",
  "training_blocks",
  "exercise_catalog",
  "countdown",
  "athletes",
  "dropdown_settings",
  "data_import",
  "user_management",
]);

const NON_ADMIN_SOURCE_ROLES = new Set(["trainer", "athlete", "parent"]);
const USER_MANAGEMENT_MODULE = "user_management";

export function mapUlcLinzManagedPermissionsToPrincipalOverrides({
  sourceRole,
  permissions,
}) {
  assertCanonicalTargetMapping();
  if (!Array.isArray(permissions)) {
    throw new Error("ULC Linz managed permissions must be an array.");
  }

  if (sourceRole === "admin") {
    assertCanonicalAdminOverrideSemantics();
    return emptyOverrides();
  }
  if (!NON_ADMIN_SOURCE_ROLES.has(sourceRole)) {
    throw new Error(`Unsupported ULC Linz source role ${String(sourceRole)}.`);
  }

  const byModule = new Map();
  for (const permission of permissions) {
    if (!isPlainObject(permission)) {
      throw new Error("ULC Linz managed permission entries must be plain objects.");
    }
    const keys = Object.keys(permission).sort();
    if (
      keys.length !== 3 ||
      keys[0] !== "canEdit" ||
      keys[1] !== "canView" ||
      keys[2] !== "moduleKey"
    ) {
      throw new Error(
        "ULC Linz managed permission entries must contain exactly moduleKey, canView and canEdit.",
      );
    }
    const { moduleKey, canView, canEdit } = permission;
    if (!ULC_LINZ_M5_MANAGED_MODULE_KEYS.includes(moduleKey)) {
      throw new Error(`Unknown ULC Linz module ${String(moduleKey)}.`);
    }
    if (byModule.has(moduleKey)) {
      throw new Error(`Duplicate ULC Linz module permission ${moduleKey}.`);
    }
    if (typeof canView !== "boolean" || typeof canEdit !== "boolean") {
      throw new Error(`ULC Linz module permission ${moduleKey} must use boolean flags.`);
    }
    if (moduleKey === USER_MANAGEMENT_MODULE && (canView || canEdit)) {
      throw new Error(
        "ULC Linz user_management is admin-only and cannot be granted through individual permissions.",
      );
    }
    byModule.set(moduleKey, {
      canView: canView || canEdit,
      canEdit,
    });
  }

  const grants = [];
  const revokes = [];
  for (const moduleKey of ULC_LINZ_M5_MANAGED_MODULE_KEYS) {
    const permission = byModule.get(moduleKey) ?? {
      canView: false,
      canEdit: false,
    };
    const viewCapability = moduleCapability(moduleKey, "view");
    const editCapability = moduleCapability(moduleKey, "edit");

    (permission.canView ? grants : revokes).push(viewCapability);
    (permission.canEdit ? grants : revokes).push(editCapability);
  }

  return Object.freeze({
    grants: Object.freeze(grants.sort((left, right) => left.localeCompare(right))),
    revokes: Object.freeze(revokes.sort((left, right) => left.localeCompare(right))),
  });
}

export async function replaceUlcLinzPrincipalPermissions({
  administration,
  principalId,
  sourceRole,
  permissions,
  auditContext,
  constraints,
}) {
  if (
    !administration ||
    typeof administration.replacePrincipalPermissions !== "function"
  ) {
    throw new Error(
      "ULC Linz principal permission replacement requires the AppBasis principal permission administration contract.",
    );
  }
  const overrides = mapUlcLinzManagedPermissionsToPrincipalOverrides({
    sourceRole,
    permissions,
  });
  return administration.replacePrincipalPermissions(
    principalId,
    overrides,
    auditContext,
    constraints,
  );
}

function emptyOverrides() {
  return Object.freeze({
    grants: Object.freeze([]),
    revokes: Object.freeze([]),
  });
}

function moduleCapability(moduleKey, action) {
  return `${ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.principalPermissionMapping.capabilityNamespace}:${moduleKey}:${action}`;
}

function assertCanonicalTargetMapping() {
  const mapping = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.principalPermissionMapping;
  if (
    mapping.sourceField !== "permissions" ||
    mapping.sourceShape !== "module-canView-canEdit" ||
    mapping.targetMechanism !== "principal-grants-revokes" ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit" ||
    mapping.editImpliesView !== true ||
    mapping.unknownModule !== "deny"
  ) {
    throw new Error(
      "ULC Linz principal permission mapping is not bound to the canonical M5 role/data-scope policy.",
    );
  }
}

function assertCanonicalAdminOverrideSemantics() {
  const admin = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.adminAuthorization;
  if (
    admin.sourceRole !== "admin" ||
    admin.runtimeRoleId !== ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin ||
    admin.mode !== "own-organization-admin" ||
    admin.moduleAccess !== "all-known-modules-view-edit" ||
    admin.individualModulePermissionsRequired !== false ||
    admin.crossOrganization !== "deny" ||
    admin.unknownModule !== "deny"
  ) {
    throw new Error(
      "ULC Linz admin override semantics are not bound to the canonical M5 role/data-scope policy.",
    );
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

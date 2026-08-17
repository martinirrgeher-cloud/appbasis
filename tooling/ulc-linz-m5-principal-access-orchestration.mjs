import { ULC_LINZ_M5_KNOWN_CAPABILITIES } from "./ulc-linz-m5-permission-provisioning.mjs";
import { mapUlcLinzManagedPermissionsToPrincipalOverrides } from "./ulc-linz-m5-principal-permission-mapping.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "./ulc-linz-m5-role-data-scope.mjs";

export async function replaceUlcLinzPrincipalAccess({
  administration,
  principalId,
  sourceRole,
  permissions,
  auditContext,
  constraints = {},
}) {
  if (
    !administration ||
    typeof administration.replacePrincipalAccess !== "function"
  ) {
    throw new Error(
      "ULC Linz principal access replacement requires the AppBasis principal access administration contract.",
    );
  }

  const runtimeRoleId =
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds[sourceRole];
  if (runtimeRoleId === undefined) {
    throw new Error(`Unsupported ULC Linz source role ${String(sourceRole)}.`);
  }

  const adminRuntimeRoleId =
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin;
  if (sourceRole !== "admin" && constraints.expectedRoleIds === undefined) {
    throw new Error(
      "ULC Linz non-admin access replacement requires expectedRoleIds so an admin demotion cannot bypass the same-organization guard.",
    );
  }

  const overrides = mapUlcLinzManagedPermissionsToPrincipalOverrides({
    sourceRole,
    permissions,
  });
  const demotingFromAdmin =
    sourceRole !== "admin" &&
    constraints.expectedRoleIds.includes(adminRuntimeRoleId);
  const requiredRemainingCapabilities = sourceRole !== "admin"
    ? ULC_LINZ_M5_KNOWN_CAPABILITIES
    : [];
  const requiredRemainingRoleIds = demotingFromAdmin
    ? [adminRuntimeRoleId]
    : [];
  const resolveRequiredRoleHolderPrincipalScope = demotingFromAdmin
    ? constraints.resolveActiveOrganizationPrincipalScope
    : undefined;

  if (
    demotingFromAdmin &&
    typeof resolveRequiredRoleHolderPrincipalScope !== "function"
  ) {
    throw new Error(
      "ULC Linz admin demotion requires a transactional resolver for active principals in the target organization.",
    );
  }

  return administration.replacePrincipalAccess(
    principalId,
    [runtimeRoleId],
    overrides,
    auditContext,
    {
      expectedRoleIds: constraints.expectedRoleIds,
      expectedGrants: constraints.expectedGrants,
      expectedRevokes: constraints.expectedRevokes,
      requiredRemainingCapabilities,
      requiredRemainingRoleIds,
      ...(resolveRequiredRoleHolderPrincipalScope === undefined
        ? {}
        : { resolveRequiredRoleHolderPrincipalScope }),
    },
  );
}

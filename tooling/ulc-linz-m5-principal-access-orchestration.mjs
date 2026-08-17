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

  const overrides = mapUlcLinzManagedPermissionsToPrincipalOverrides({
    sourceRole,
    permissions,
  });
  const requiredRemainingCapabilities =
    sourceRole === "admin" ? [] : ULC_LINZ_M5_KNOWN_CAPABILITIES;

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
    },
  );
}

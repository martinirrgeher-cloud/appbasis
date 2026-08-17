import type { IdentityService } from "@appbasis/identity";
import {
  principalId,
  roleId,
  type PermissionStore,
  type PrincipalId,
  type PrincipalPermissions,
  type PostgresPrincipalAccessAdministration,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";

const QUARANTINE_AUDIT_REASON = "ULC Linz pre-delete access quarantine";
const ADMIN_ROLE_ID = roleId(roleDataScope.runtimeRoleIds.admin);
const KNOWN_NON_ADMIN_ROLE_IDS = new Set(
  Object.entries(roleDataScope.runtimeRoleIds)
    .filter(([sourceRole]) => sourceRole !== "admin")
    .map(([, runtimeRoleId]) => runtimeRoleId),
);
const CAPABILITY_PREFIX = `${roleDataScope.principalPermissionMapping.capabilityNamespace}:`;

export type UlcLinzLifecycleBlockedCode =
  | "ADMIN_LIFECYCLE_SCOPE_UNBOUND"
  | "UNKNOWN_PERMISSION_STATE";

export class UlcLinzLifecycleBlockedError extends Error {
  readonly code: UlcLinzLifecycleBlockedCode;

  constructor(code: UlcLinzLifecycleBlockedCode) {
    super("ULC Linz lifecycle write blocked.");
    this.name = "UlcLinzLifecycleBlockedError";
    this.code = code;
  }
}

export interface UlcLinzLifecycleAuthorization {
  readonly actorPrincipalId: PrincipalId;
}

export interface UlcLinzPreDeleteQuarantineDependencies {
  readonly identity: Pick<IdentityService, "disableIdentity">;
  readonly permissions: PermissionStore;
  readonly accessAdministration: Pick<
    PostgresPrincipalAccessAdministration,
    "replacePrincipalAccess"
  >;
  readonly authorizeLifecycleWrite: (input: {
    readonly targetIdentityId: string;
  }) => Promise<UlcLinzLifecycleAuthorization>;
}

export interface UlcLinzPreDeleteQuarantineResult {
  readonly identityId: string;
  readonly permissionsChanged: boolean;
  readonly identityDisabled: true;
}

/**
 * First write slice of the ULC M5 deletion lifecycle.
 *
 * This deliberately does not delete or anonymize data. It removes known ULC
 * application access through the existing permissions owner before disabling
 * the identity through the existing identity owner. Better Auth's admin ban
 * used by IdentityService.disableIdentity() revokes the user's active sessions.
 *
 * ULC administrators are blocked until the authoritative membership backing
 * store can participate in the existing transactional last-required-role
 * holder guard. Unknown permission state is also fail-closed.
 */
export async function quarantineUlcLinzIdentityBeforeDeletion(
  dependencies: UlcLinzPreDeleteQuarantineDependencies,
  identityId: string,
): Promise<UlcLinzPreDeleteQuarantineResult> {
  const normalizedIdentityId = requiredIdentifier(identityId);
  const authorization = await dependencies.authorizeLifecycleWrite({
    targetIdentityId: normalizedIdentityId,
  });
  const targetPrincipalId = principalId(normalizedIdentityId);
  const current = await dependencies.permissions.findPrincipal(targetPrincipalId);

  let permissionsChanged = false;
  if (current !== null) {
    assertQuarantinablePermissionState(current, targetPrincipalId);
    if (hasApplicationAccessState(current)) {
      await dependencies.accessAdministration.replacePrincipalAccess(
        targetPrincipalId,
        [],
        { grants: [], revokes: [] },
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: QUARANTINE_AUDIT_REASON,
        },
        {
          expectedRoleIds: current.roleIds,
          expectedGrants: current.grants,
          expectedRevokes: current.revokes,
        },
      );
      permissionsChanged = true;
    }
  }

  // Permission removal happens first. If the identity-owner write then fails,
  // application authorization still remains deny-by-default rather than
  // leaving an active principal behind.
  await dependencies.identity.disableIdentity(normalizedIdentityId);

  return Object.freeze({
    identityId: normalizedIdentityId,
    permissionsChanged,
    identityDisabled: true,
  });
}

function assertQuarantinablePermissionState(
  current: PrincipalPermissions,
  expectedPrincipalId: PrincipalId,
): void {
  if (current.principalId !== expectedPrincipalId) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  if (current.roleIds.includes(ADMIN_ROLE_ID)) {
    throw new UlcLinzLifecycleBlockedError("ADMIN_LIFECYCLE_SCOPE_UNBOUND");
  }
  if (
    !current.roleIds.every((currentRoleId) =>
      KNOWN_NON_ADMIN_ROLE_IDS.has(String(currentRoleId)),
    )
  ) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  if (
    ![...current.grants, ...current.revokes].every((capability) =>
      String(capability).startsWith(CAPABILITY_PREFIX),
    )
  ) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
}

function hasApplicationAccessState(current: PrincipalPermissions): boolean {
  return (
    current.roleIds.length > 0 ||
    current.grants.length > 0 ||
    current.revokes.length > 0
  );
}

function requiredIdentifier(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  return value;
}

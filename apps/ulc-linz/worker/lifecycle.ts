import {
  principalId,
  roleId,
  type PermissionStore,
  type PrincipalId,
  type PrincipalPermissions,
  type PostgresPrincipalAccessAdministration,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";

type UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;
type UlcLinzQuarantinableSourceRole = Exclude<UlcLinzSourceRole, "admin">;

const QUARANTINE_AUDIT_REASON = "ULC Linz pre-delete access quarantine";
const DELETION_QUARANTINE_AUDIT_REASON =
  "ULC Linz identity deletion pre-delete access quarantine";
const ADMIN_ROLE_ID = roleId(roleDataScope.runtimeRoleIds.admin);
const QUARANTINABLE_SOURCE_ROLES = new Set<UlcLinzQuarantinableSourceRole>([
  "trainer",
  "athlete",
  "parent",
]);
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
  /**
   * Authoritative ULC membership role for the target identity. The lifecycle
   * authorizer must resolve this from the application-owned membership scope;
   * the coordinator never infers it from a missing/empty permission principal
   * because that would make last-admin protection ambiguous.
   */
  readonly targetSourceRole: string;
}

/** Narrow local port for the existing IdentityService.disableIdentity() owner operation. */
export interface UlcLinzIdentityLifecycleOwner {
  disableIdentity(identityId: string): Promise<unknown>;
}

/** Narrow local port for the destructive @appbasis/identity PostgreSQL owner boundary. */
export interface UlcLinzIdentityDeletionOwner {
  isDeletionCompleted(identityId: string): Promise<boolean>;
  deleteDisabledIdentity(identityId: string): Promise<{
    readonly identityId: string;
    readonly alreadyDeleted: boolean;
  }>;
}

/** Narrow local port for destructive principal cleanup in @appbasis/permissions. */
export interface UlcLinzPrincipalLifecycleOwner {
  deleteQuarantinedPrincipal(principalId: PrincipalId): Promise<boolean>;
}

export interface UlcLinzPreDeleteQuarantineDependencies {
  readonly identity: UlcLinzIdentityLifecycleOwner;
  readonly permissions: PermissionStore;
  readonly accessAdministration: Pick<
    PostgresPrincipalAccessAdministration,
    "replacePrincipalAccess"
  >;
  readonly authorizeLifecycleWrite: (input: {
    readonly targetIdentityId: string;
  }) => Promise<UlcLinzLifecycleAuthorization>;
}

export interface UlcLinzDeletionDependencies
  extends UlcLinzPreDeleteQuarantineDependencies {
  readonly identityDeletion: UlcLinzIdentityDeletionOwner;
  readonly principalLifecycle: UlcLinzPrincipalLifecycleOwner;
}

export interface UlcLinzPreDeleteQuarantineResult {
  readonly identityId: string;
  readonly permissionsChanged: boolean;
  readonly identityDisabled: true;
}

export interface UlcLinzDeletionResult {
  readonly identityId: string;
  readonly permissionsChanged: boolean;
  readonly permissionPrincipalDeleted: boolean;
  readonly identityDeleted: true;
  readonly alreadyDeleted: boolean;
}

type QuarantineMode = {
  readonly auditReason: string;
  readonly requirePermissionPrincipal: boolean;
  readonly forceAudit: boolean;
};

/**
 * Safety stage before destructive deletion. This deliberately does not count as
 * deletion: it removes known ULC access before disabling the identity owner.
 */
export async function quarantineUlcLinzIdentityBeforeDeletion(
  dependencies: UlcLinzPreDeleteQuarantineDependencies,
  identityId: string,
): Promise<UlcLinzPreDeleteQuarantineResult> {
  const normalizedIdentityId = requiredIdentifier(identityId);
  const authorization = await dependencies.authorizeLifecycleWrite({
    targetIdentityId: normalizedIdentityId,
  });
  return quarantineAuthorizedIdentity(
    dependencies,
    normalizedIdentityId,
    authorization,
    {
      auditReason: QUARANTINE_AUDIT_REASON,
      requirePermissionPrincipal: false,
      forceAudit: false,
    },
  );
}

/**
 * Destructive M5-C slice for the persistent ULC owners that exist today.
 *
 * Authorization and authoritative source-role proof happen before owner state
 * is inspected. The existing permission administration audit is deliberately
 * used as the privileged deletion audit: an exact principal must exist and its
 * role/permission state is replaced (even if already empty) with a deletion-
 * specific server-side reason before physical identity deletion starts.
 *
 * The permission principal stays present but empty until identity deletion has
 * completed. That order keeps an identity-owner failure safely retryable. If
 * permission cleanup fails after identity deletion, the completed identity
 * tombstone plus an empty principal allows a later retry to finish cleanup
 * without re-running destructive identity work.
 */
export async function deleteUlcLinzIdentity(
  dependencies: UlcLinzDeletionDependencies,
  identityId: string,
): Promise<UlcLinzDeletionResult> {
  const normalizedIdentityId = requiredIdentifier(identityId);
  const authorization = await dependencies.authorizeLifecycleWrite({
    targetIdentityId: normalizedIdentityId,
  });
  const targetSourceRole = requiredQuarantinableSourceRole(
    authorization.targetSourceRole,
  );
  const targetPrincipalId = principalId(normalizedIdentityId);

  if (await dependencies.identityDeletion.isDeletionCompleted(normalizedIdentityId)) {
    const permissionPrincipalDeleted = await cleanupCompletedDeletionPrincipal(
      dependencies,
      targetPrincipalId,
      targetSourceRole,
    );
    return Object.freeze({
      identityId: normalizedIdentityId,
      permissionsChanged: false,
      permissionPrincipalDeleted,
      identityDeleted: true,
      alreadyDeleted: true,
    });
  }

  const quarantine = await quarantineAuthorizedIdentity(
    dependencies,
    normalizedIdentityId,
    authorization,
    {
      auditReason: DELETION_QUARANTINE_AUDIT_REASON,
      requirePermissionPrincipal: true,
      forceAudit: true,
    },
  );

  // Keep the empty permission principal until physical identity deletion has
  // succeeded. If identity deletion fails, retry can still prove and re-audit
  // the exact principal rather than getting stuck after a partial cross-owner
  // write.
  const identityDeletion = await dependencies.identityDeletion.deleteDisabledIdentity(
    normalizedIdentityId,
  );

  const permissionPrincipalDeleted =
    await dependencies.principalLifecycle.deleteQuarantinedPrincipal(
      targetPrincipalId,
    );
  if (!permissionPrincipalDeleted) {
    const remainingPrincipal = await dependencies.permissions.findPrincipal(
      targetPrincipalId,
    );
    if (remainingPrincipal !== null) {
      throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
    }
  }

  return Object.freeze({
    identityId: normalizedIdentityId,
    permissionsChanged: quarantine.permissionsChanged,
    permissionPrincipalDeleted,
    identityDeleted: true,
    alreadyDeleted: identityDeletion.alreadyDeleted,
  });
}

async function cleanupCompletedDeletionPrincipal(
  dependencies: UlcLinzDeletionDependencies,
  targetPrincipalId: PrincipalId,
  targetSourceRole: UlcLinzQuarantinableSourceRole,
): Promise<boolean> {
  const remainingPrincipal = await dependencies.permissions.findPrincipal(
    targetPrincipalId,
  );
  if (remainingPrincipal === null) return false;

  assertQuarantinablePermissionState(
    remainingPrincipal,
    targetPrincipalId,
    targetSourceRole,
  );
  if (hasApplicationAccessState(remainingPrincipal)) {
    // A completed identity must never silently cause a newly granted or stale
    // permission state to be deleted. Reconciliation must resolve that drift.
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }

  const deleted = await dependencies.principalLifecycle.deleteQuarantinedPrincipal(
    targetPrincipalId,
  );
  if (deleted) return true;

  const afterCleanup = await dependencies.permissions.findPrincipal(
    targetPrincipalId,
  );
  if (afterCleanup !== null) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  return false;
}

async function quarantineAuthorizedIdentity(
  dependencies: UlcLinzPreDeleteQuarantineDependencies,
  normalizedIdentityId: string,
  authorization: UlcLinzLifecycleAuthorization,
  mode: QuarantineMode,
): Promise<UlcLinzPreDeleteQuarantineResult> {
  const targetSourceRole = requiredQuarantinableSourceRole(
    authorization.targetSourceRole,
  );
  const targetPrincipalId = principalId(normalizedIdentityId);
  const current = await dependencies.permissions.findPrincipal(targetPrincipalId);

  if (current === null && mode.requirePermissionPrincipal) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }

  let permissionsChanged = false;
  if (current !== null) {
    assertQuarantinablePermissionState(
      current,
      targetPrincipalId,
      targetSourceRole,
    );
    permissionsChanged = hasApplicationAccessState(current);
    if (permissionsChanged || mode.forceAudit) {
      await dependencies.accessAdministration.replacePrincipalAccess(
        targetPrincipalId,
        [],
        { grants: [], revokes: [] },
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: mode.auditReason,
        },
        {
          expectedRoleIds: current.roleIds,
          expectedGrants: current.grants,
          expectedRevokes: current.revokes,
        },
      );
    }
  }

  // Permission removal happens first. If the identity-owner write then fails,
  // application authorization remains deny-by-default rather than leaving an
  // active principal behind. Retry requires renewed non-admin role proof.
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
  targetSourceRole: UlcLinzQuarantinableSourceRole,
): void {
  if (current.principalId !== expectedPrincipalId) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  if (current.roleIds.includes(ADMIN_ROLE_ID)) {
    throw new UlcLinzLifecycleBlockedError("ADMIN_LIFECYCLE_SCOPE_UNBOUND");
  }

  if (current.roleIds.length > 0) {
    const expectedRuntimeRoleId = roleId(
      roleDataScope.runtimeRoleIds[targetSourceRole],
    );
    if (
      current.roleIds.length !== 1 ||
      current.roleIds[0] !== expectedRuntimeRoleId
    ) {
      throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
    }
  }

  if (
    ![...current.grants, ...current.revokes].every((capability) =>
      String(capability).startsWith(CAPABILITY_PREFIX),
    )
  ) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
}

function requiredQuarantinableSourceRole(
  value: string,
): UlcLinzQuarantinableSourceRole {
  if (value === "admin") {
    throw new UlcLinzLifecycleBlockedError("ADMIN_LIFECYCLE_SCOPE_UNBOUND");
  }
  if (!QUARANTINABLE_SOURCE_ROLES.has(value as UlcLinzQuarantinableSourceRole)) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  return value as UlcLinzQuarantinableSourceRole;
}

function hasApplicationAccessState(current: PrincipalPermissions): boolean {
  return (
    current.roleIds.length > 0 ||
    current.grants.length > 0 ||
    current.revokes.length > 0
  );
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  return value;
}

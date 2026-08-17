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
const IDENTITY_DELETION_AUDIT_REASON = "ULC Linz identity deletion";
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

/** Narrow local port for destructive principal lifecycle writes in @appbasis/permissions. */
export interface UlcLinzPrincipalLifecycleOwner {
  recordIdentityDeletionAttempt(
    principalId: PrincipalId,
    auditContext: {
      readonly actorPrincipalId: PrincipalId;
      readonly reason: string;
    },
  ): Promise<void>;
  deleteQuarantinedPrincipal(
    principalId: PrincipalId,
    auditContext: {
      readonly actorPrincipalId: PrincipalId;
      readonly reason: string;
    },
  ): Promise<boolean>;
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
  );
}

/**
 * Destructive M5-C slice for the persistent ULC owners that exist today.
 *
 * Authorization and authoritative source-role proof happen before owner state
 * is inspected. Access is quarantined first, the permission principal is then
 * removed through its own audited owner boundary, and only then may the
 * disabled identity be physically deleted through @appbasis/identity.
 *
 * If a later owner fails, the function returns an error and earlier stages stay
 * in their safer no-access state. The identity owner keeps a completed delete
 * tombstone so an ambiguous client retry can return without producing duplicate
 * destructive writes or audit attempts.
 */
export async function deleteUlcLinzIdentity(
  dependencies: UlcLinzDeletionDependencies,
  identityId: string,
): Promise<UlcLinzDeletionResult> {
  const normalizedIdentityId = requiredIdentifier(identityId);
  const authorization = await dependencies.authorizeLifecycleWrite({
    targetIdentityId: normalizedIdentityId,
  });
  requiredQuarantinableSourceRole(authorization.targetSourceRole);
  const targetPrincipalId = principalId(normalizedIdentityId);

  if (await dependencies.identityDeletion.isDeletionCompleted(normalizedIdentityId)) {
    const remainingPrincipal = await dependencies.permissions.findPrincipal(targetPrincipalId);
    if (remainingPrincipal !== null) {
      throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
    }
    return Object.freeze({
      identityId: normalizedIdentityId,
      permissionsChanged: false,
      permissionPrincipalDeleted: false,
      identityDeleted: true,
      alreadyDeleted: true,
    });
  }

  const quarantine = await quarantineAuthorizedIdentity(
    dependencies,
    normalizedIdentityId,
    authorization,
  );
  const auditContext = Object.freeze({
    actorPrincipalId: authorization.actorPrincipalId,
    reason: IDENTITY_DELETION_AUDIT_REASON,
  });

  // Record the privileged destructive intent before data disappears. The audit
  // contains identifiers and metadata only, never the deleted user payload.
  await dependencies.principalLifecycle.recordIdentityDeletionAttempt(
    targetPrincipalId,
    auditContext,
  );
  const permissionPrincipalDeleted =
    await dependencies.principalLifecycle.deleteQuarantinedPrincipal(
      targetPrincipalId,
      auditContext,
    );

  const identityDeletion = await dependencies.identityDeletion.deleteDisabledIdentity(
    normalizedIdentityId,
  );

  return Object.freeze({
    identityId: normalizedIdentityId,
    permissionsChanged: quarantine.permissionsChanged,
    permissionPrincipalDeleted,
    identityDeleted: true,
    alreadyDeleted: identityDeletion.alreadyDeleted,
  });
}

async function quarantineAuthorizedIdentity(
  dependencies: UlcLinzPreDeleteQuarantineDependencies,
  normalizedIdentityId: string,
  authorization: UlcLinzLifecycleAuthorization,
): Promise<UlcLinzPreDeleteQuarantineResult> {
  const targetSourceRole = requiredQuarantinableSourceRole(
    authorization.targetSourceRole,
  );
  const targetPrincipalId = principalId(normalizedIdentityId);
  const current = await dependencies.permissions.findPrincipal(targetPrincipalId);

  let permissionsChanged = false;
  if (current !== null) {
    assertQuarantinablePermissionState(
      current,
      targetPrincipalId,
      targetSourceRole,
    );
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
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
  }
  return value;
}

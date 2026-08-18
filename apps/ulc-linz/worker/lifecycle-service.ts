import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";

import type { UlcLinzCurrentIdentity } from "./authorization";
import {
  deleteUlcLinzIdentity,
  UlcLinzLifecycleBlockedError,
  type UlcLinzDeletionDependencies,
  type UlcLinzDeletionResult,
} from "./lifecycle";
import roleDataScope from "./role-data-scope.json";
import type {
  PostgresUlcLinzScopePersistence,
  UlcLinzDeletableSourceRole,
  UlcLinzRetentionException,
} from "./scope-persistence";

const ADMIN_ROLE_ID = roleId(roleDataScope.runtimeRoleIds.admin);

type CanonicalAdminScopes = Pick<
  PostgresUlcLinzScopePersistence,
  "resolveMembership"
>;

export interface UlcLinzCanonicalDeletionDependencies
  extends Omit<UlcLinzDeletionDependencies, "authorizeLifecycleWrite"> {
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    | "resolveMembership"
    | "findLifecycleTarget"
    | "findDeletionMarker"
    | "completeIdentityDeletion"
  >;
}

export interface UlcLinzCanonicalDeletionRequest {
  readonly organizationId: string;
  readonly targetIdentityId: string;
}

export interface UlcLinzCanonicalRetentionExceptionDependencies {
  readonly permissions: PermissionStore;
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    "resolveMembership" | "findLifecycleTarget" | "setRetentionException"
  >;
}

export interface UlcLinzCanonicalRetentionExceptionRequest {
  readonly organizationId: string;
  readonly targetIdentityId: string;
  readonly reason: string;
  readonly reviewAt: Date;
}

/**
 * Canonical M5-C application boundary. The audit actor comes from the
 * authenticated identity and both actor/target organization scope are resolved
 * from the real app-owned PostgreSQL membership store before owner writes.
 */
export async function deleteUlcLinzIdentityWithCanonicalAuthorization(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCanonicalDeletionDependencies,
  request: UlcLinzCanonicalDeletionRequest,
): Promise<UlcLinzDeletionResult> {
  const organizationId = requiredIdentifier(request.organizationId);
  const targetIdentityId = requiredIdentifier(request.targetIdentityId);
  const { actorIdentityId, actorPrincipalId } = await assertCanonicalLifecycleAdmin(
    current,
    dependencies.permissions,
    dependencies.scopes,
    organizationId,
  );
  if (actorIdentityId === targetIdentityId) blocked();

  const [target, marker] = await Promise.all([
    dependencies.scopes.findLifecycleTarget(targetIdentityId),
    dependencies.scopes.findDeletionMarker(targetIdentityId),
  ]);
  if (target !== null && marker !== null) blocked();

  let targetSourceRole: UlcLinzDeletableSourceRole;
  if (target !== null) {
    if (target.organizationId !== organizationId || target.sourceRole === "admin") blocked();
    targetSourceRole = requiredDeletableSourceRole(target.sourceRole);
  } else if (marker !== null) {
    if (marker.organizationId !== organizationId) blocked();
    targetSourceRole = marker.sourceRole;
  } else {
    blocked();
  }

  const result = await deleteUlcLinzIdentity(
    {
      identity: dependencies.identity,
      identityDeletion: dependencies.identityDeletion,
      permissions: dependencies.permissions,
      accessAdministration: dependencies.accessAdministration,
      principalLifecycle: dependencies.principalLifecycle,
      async authorizeLifecycleWrite({ targetIdentityId: authorizedTarget }) {
        if (authorizedTarget !== targetIdentityId) blocked();
        return { actorPrincipalId, targetSourceRole };
      },
    },
    targetIdentityId,
  );

  const completedMarker = await dependencies.scopes.completeIdentityDeletion(
    targetIdentityId,
  );
  if (
    completedMarker.organizationId !== organizationId ||
    completedMarker.sourceRole !== targetSourceRole
  ) {
    blocked();
  }
  return result;
}

/**
 * Canonical M5-D exception boundary. Only an authenticated, active same-org ULC
 * admin with the canonical persisted admin role can create a retention hold.
 * The store accepts it only after the ordinary 12-month retention is already due
 * and requires a reason plus a future review date.
 */
export async function setUlcLinzRetentionExceptionWithCanonicalAuthorization(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCanonicalRetentionExceptionDependencies,
  request: UlcLinzCanonicalRetentionExceptionRequest,
): Promise<UlcLinzRetentionException> {
  const organizationId = requiredIdentifier(request.organizationId);
  const targetIdentityId = requiredIdentifier(request.targetIdentityId);
  const { actorIdentityId, actorPrincipalId } = await assertCanonicalLifecycleAdmin(
    current,
    dependencies.permissions,
    dependencies.scopes,
    organizationId,
  );
  if (actorIdentityId === targetIdentityId) blocked();

  const target = await dependencies.scopes.findLifecycleTarget(targetIdentityId);
  if (
    target === null ||
    target.organizationId !== organizationId ||
    target.active ||
    target.sourceRole === "admin"
  ) {
    blocked();
  }

  return dependencies.scopes.setRetentionException({
    identityId: targetIdentityId,
    organizationId,
    actor: String(actorPrincipalId),
    reason: request.reason,
    reviewAt: request.reviewAt,
  });
}

async function assertCanonicalLifecycleAdmin(
  current: UlcLinzCurrentIdentity,
  permissions: PermissionStore,
  scopes: CanonicalAdminScopes,
  organizationId: string,
): Promise<{
  actorIdentityId: string;
  actorPrincipalId: ReturnType<typeof principalId>;
}> {
  assertIdentityActionAllowed(current, "application");
  const actorIdentityId = requiredIdentifier(current.identity.identityId);
  const actorMembership = await scopes.resolveMembership({
    identityId: actorIdentityId,
    organizationId,
  });
  if (
    actorMembership === null ||
    actorMembership.organizationId !== organizationId ||
    actorMembership.active !== true ||
    actorMembership.sourceRole !== "admin"
  ) {
    blocked();
  }

  const actorPrincipalId = principalId(actorIdentityId);
  await assertCanonicalAdminPrincipal(permissions, actorPrincipalId);
  return { actorIdentityId, actorPrincipalId };
}

async function assertCanonicalAdminPrincipal(
  permissions: PermissionStore,
  actorPrincipalId: ReturnType<typeof principalId>,
): Promise<void> {
  const principal = await permissions.findPrincipal(actorPrincipalId);
  if (
    principal === null ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== ADMIN_ROLE_ID ||
    principal.grants.length !== 0 ||
    principal.revokes.length !== 0
  ) {
    blocked();
  }
}

function requiredDeletableSourceRole(value: string): UlcLinzDeletableSourceRole {
  if (value !== "trainer" && value !== "athlete" && value !== "parent") blocked();
  return value;
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    blocked();
  }
  return value;
}

function blocked(): never {
  throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
}

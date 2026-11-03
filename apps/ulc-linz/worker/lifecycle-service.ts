import type { AthleteMasterdataDeletionMarker, PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import type { TrainingPlanLifecycleRepository } from "@appbasis/training-plans";
import type {
  TrainingBlockSubjectUsageLifecycleRepository,
} from "@appbasis/training-blocks";
import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
import type {
  TrainingBlockFavoriteDeletionResult,
} from "@appbasis/training-blocks";

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
const MANUAL_DELETION_AUDIT_REASON = "manual-identity-deletion";
const ULC_PERMISSION_PREFIX = roleDataScope.principalPermissionMapping.capabilityNamespace + ":";

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
type AuthorizedDeletionTarget = Readonly<{
  organizationId: string;
  targetIdentityId: string;
  actorPrincipalId: ReturnType<typeof principalId>;
  targetSourceRole: UlcLinzDeletableSourceRole;
  hadCompletedAppMarker: boolean;
}>;

/**
 * Separate privileged app-owned composition, intentionally NOT installed as an
 * HTTP endpoint or as an automatic ULC deletion/retention/restore caller.
 * Only activate once the module-owned schema-v5 migration, backup restore
 * policy, and other application subject lifecycles are independently verified.
 */
export interface UlcLinzCanonicalFavoriteDeletionDependencies
  extends UlcLinzCanonicalDeletionDependencies {
  readonly favorites: Readonly<{
    deletePrincipalFavorites(
      organizationId: string,
      principalIdentityId: string,
    ): Promise<TrainingBlockFavoriteDeletionResult>;
  }>;
}

export interface UlcLinzCanonicalFavoriteDeletionResult
  extends UlcLinzDeletionResult {
  readonly favoriteMarkerInserted: boolean;
  readonly deletedTrainingBlockFavorites: number;
}

/**
 * A principal's favorite key is the IDENTITY id, not the athlete/subject id.
 * All canonical admin/organization/target checks happen before the first
 * module-owned write. The module's schema-v5 protected transaction happens
 * before destructive Identity writes; on failure Identity stays untouched.
 * Retries of a later Identity failure are intentionally idempotent.
 */
export async function deleteUlcLinzIdentityWithCanonicalFavoriteDeletion(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCanonicalFavoriteDeletionDependencies,
  request: UlcLinzCanonicalDeletionRequest,
): Promise<UlcLinzCanonicalFavoriteDeletionResult> {
  if (
    !dependencies || !dependencies.favorites ||
    typeof dependencies.favorites.deletePrincipalFavorites !== "function"
  ) {
    blocked();
  }
  const authorized = await authorizeCanonicalDeletionTarget(
    current, dependencies, request,
  );
  // The underlying Identity owner independently validates this when it
  // performs its own write. Inspect the target principal *before* a module
  // deletion so a stale admin role or foreign grants cannot cause partial
  // cross-owner erasure.
  await assertFavoriteDeletionTargetPermissionState(dependencies, authorized);
  const favoriteResult = await dependencies.favorites.deletePrincipalFavorites(
    authorized.organizationId,
    authorized.targetIdentityId,
  );
  if (
    !favoriteResult ||
    typeof favoriteResult.markerInserted !== "boolean" ||
    !Number.isSafeInteger(favoriteResult.deletedFavorites) ||
    favoriteResult.deletedFavorites < 0
  ) {
    blocked();
  }
  const identityResult = await executeCanonicalDeletion(dependencies, authorized);
  return Object.freeze({
    ...identityResult,
    favoriteMarkerInserted: favoriteResult.markerInserted,
    deletedTrainingBlockFavorites: favoriteResult.deletedFavorites,
  });
}

/**
 * PRIVILEGED, UNWIRED post-retention follow-up after the ATHLETES owner has
 * already finished and persisted its 12-month retention deletion.
 *
 * A merely inactive athlete is NOT eligible. The same canonical app
 * administrator authorization as M5 identity deletion is required before
 * reading sensitive owner state or making any module-owned write.
 */
export interface UlcLinzAthleteSubjectDeletionDependencies {
  readonly permissions: PermissionStore;
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    "resolveMembership" | "hasRelation"
  >;
  readonly athletes: Pick<
    PostgresAthleteMasterdataRepository,
    "findCurrentAthleteDeletionMarker"
  >;
  readonly plans: Pick<TrainingPlanLifecycleRepository, "deleteSubjectData">;
  readonly usage: Pick<
    TrainingBlockSubjectUsageLifecycleRepository,
    "markSubjectDeletedAndRemoveAttributedUsage"
  >;
  readonly now: () => Date;
}

export interface UlcLinzAthleteSubjectDeletionRequest {
  readonly organizationId: string;
  /** An athlete SUBJECT id, never an identity/principal id. */
  readonly subjectId: string;
}

export interface UlcLinzAthleteSubjectDeletionFollowUpResult {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly completedAt: Date;
  readonly deletedPlans: number;
  readonly deletedPlanRevisions: number;
  readonly deletedPlanItems: number;
  readonly usageMarkerInserted: boolean;
  readonly deletedAttributedUsageEvents: number;
}

/**
 * Deletion marker is the only authorization to begin dependent erasure.
 * Plans and blocks have separate owner transactions: a partial failure
 * propagates and MUST be retried with the same source marker. This is
 * deliberately not equivalent to one atomic app-wide delete.
 *
 * No HTTP/runtime/caller is installed. Marker expiry, restoration, unowned
 * legacy events, cross-owner race/plan edits and post-delete verification
 * remain independent blockers before any production activation.
 */
export async function deleteUlcLinzAthleteSubjectDependentsAfterRetention(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzAthleteSubjectDeletionDependencies,
  request: UlcLinzAthleteSubjectDeletionRequest,
): Promise<UlcLinzAthleteSubjectDeletionFollowUpResult> {
  if (
    !dependencies ||
    !dependencies.athletes ||
    typeof dependencies.athletes.findCurrentAthleteDeletionMarker !== "function" ||
    !dependencies.plans ||
    typeof dependencies.plans.deleteSubjectData !== "function" ||
    !dependencies.usage ||
    typeof dependencies.usage.markSubjectDeletedAndRemoveAttributedUsage !== "function" ||
    typeof dependencies.now !== "function" ||
    typeof dependencies.scopes?.hasRelation !== "function"
  ) {
    blocked();
  }
  const organizationId = requiredIdentifier(request.organizationId);
  const subjectId = requiredIdentifier(request.subjectId);
  const { actorIdentityId } = await assertCanonicalLifecycleAdmin(
    current, dependencies.permissions, dependencies.scopes, organizationId,
  );
  if (await dependencies.scopes.hasRelation({
    identityId: actorIdentityId,
    organizationId,
    subjectId,
    relationType: "self",
  })) {
    blocked();
  }
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) blocked();
  const marker = await dependencies.athletes.findCurrentAthleteDeletionMarker(
    organizationId, subjectId, now,
  );
  const completedAt = validateCanonicalAthleteDeletionMarker(
    marker, organizationId, subjectId, now,
  );

  // Idempotent module-owner steps: the first owner may have committed when
  // the second fails. Never claim the app-wide operation succeeded then.
  const plans = await dependencies.plans.deleteSubjectData(
    organizationId, subjectId, completedAt,
  );
  if (
    !plans ||
    !validDeletionCount(plans.deletedPlans) ||
    !validDeletionCount(plans.deletedRevisions) ||
    !validDeletionCount(plans.deletedItems)
  ) {
    blocked();
  }

  const usage = await dependencies.usage.markSubjectDeletedAndRemoveAttributedUsage(
    organizationId, subjectId, completedAt,
  );
  if (
    !usage ||
    typeof usage.markerInserted !== "boolean" ||
    !validDeletionCount(usage.deletedUsageEvents)
  ) {
    blocked();
  }
  return Object.freeze({
    organizationId,
    subjectId,
    completedAt: new Date(completedAt.getTime()),
    deletedPlans: plans.deletedPlans,
    deletedPlanRevisions: plans.deletedRevisions,
    deletedPlanItems: plans.deletedItems,
    usageMarkerInserted: usage.markerInserted,
    deletedAttributedUsageEvents: usage.deletedUsageEvents,
  });
}

function validateCanonicalAthleteDeletionMarker(
  marker: AthleteMasterdataDeletionMarker | null,
  organizationId: string,
  subjectId: string,
  now: Date,
): Date {
  if (
    marker === null ||
    marker.entityType !== "athlete" ||
    marker.entityId !== subjectId ||
    marker.organizationId !== organizationId ||
    !(marker.completedAt instanceof Date) ||
    !(marker.purgeAfter instanceof Date) ||
    !Number.isFinite(marker.completedAt.getTime()) ||
    !Number.isFinite(marker.purgeAfter.getTime()) ||
    marker.completedAt.getTime() > now.getTime() ||
    marker.purgeAfter.getTime() < now.getTime() ||
    marker.purgeAfter.getTime() - marker.completedAt.getTime() !==
      35 * 24 * 60 * 60 * 1000
  ) {
    blocked();
  }
  return new Date(marker.completedAt.getTime());
}

function validDeletionCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Existing canonical M5-C flow stays behaviorally unchanged. */
export async function deleteUlcLinzIdentityWithCanonicalAuthorization(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCanonicalDeletionDependencies,
  request: UlcLinzCanonicalDeletionRequest,
): Promise<UlcLinzDeletionResult> {
  const authorized = await authorizeCanonicalDeletionTarget(
    current, dependencies, request,
  );
  return executeCanonicalDeletion(dependencies, authorized);
}

async function authorizeCanonicalDeletionTarget(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCanonicalDeletionDependencies,
  request: UlcLinzCanonicalDeletionRequest,
): Promise<AuthorizedDeletionTarget> {
  const organizationId = requiredIdentifier(request.organizationId);
  const targetIdentityId = requiredIdentifier(request.targetIdentityId);
  const { actorIdentityId, actorPrincipalId } = await assertCanonicalLifecycleAdmin(
    current, dependencies.permissions, dependencies.scopes, organizationId,
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
  return Object.freeze({
    organizationId, targetIdentityId, actorPrincipalId, targetSourceRole,
    hadCompletedAppMarker: marker !== null,
  });
}

async function assertFavoriteDeletionTargetPermissionState(
  dependencies: UlcLinzCanonicalFavoriteDeletionDependencies,
  target: AuthorizedDeletionTarget,
): Promise<void> {
  const targetPrincipalId = principalId(target.targetIdentityId);
  const principal = await dependencies.permissions.findPrincipal(targetPrincipalId);
  if (principal === null) {
    // A retry after physical Identity deletion may legitimately have no
    // permission principal, but a still-live target may not skip its role check.
    if (!await dependencies.identityDeletion.isDeletionCompleted(target.targetIdentityId)) {
      blocked();
    }
    return;
  }
  const expectedRole = roleId(roleDataScope.runtimeRoleIds[target.targetSourceRole]);
  if (
    principal.principalId !== targetPrincipalId ||
    principal.roleIds.length > 1 ||
    (principal.roleIds.length === 1 && principal.roleIds[0] !== expectedRole) ||
    ![...principal.grants, ...principal.revokes].every((value) =>
      String(value).startsWith(ULC_PERMISSION_PREFIX)
    ) ||
    (target.hadCompletedAppMarker &&
      (principal.roleIds.length > 0 ||
        principal.grants.length > 0 ||
        principal.revokes.length > 0))
  ) {
    blocked();
  }
}

async function executeCanonicalDeletion(
  dependencies: UlcLinzCanonicalDeletionDependencies,
  authorized: AuthorizedDeletionTarget,
): Promise<UlcLinzDeletionResult> {
  const {
    organizationId, targetIdentityId, actorPrincipalId, targetSourceRole,
  } = authorized;
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

  const completedMarker = await dependencies.scopes.completeIdentityDeletion({
    identityId: targetIdentityId,
    actor: String(actorPrincipalId),
    reason: MANUAL_DELETION_AUDIT_REASON,
  });
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
 * and records actor, reason, creation time and future review time atomically.
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

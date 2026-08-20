import { principalId } from "@appbasis/permissions";

import {
  deleteUlcLinzIdentity,
  UlcLinzLifecycleBlockedError,
  type UlcLinzDeletionDependencies,
} from "./lifecycle";
import type {
  PostgresUlcLinzScopePersistence,
  UlcLinzDeletableSourceRole,
  UlcLinzLifecycleTarget,
  UlcLinzRetentionState,
} from "./scope-persistence";

const RETENTION_ACTOR = principalId("ulc-linz:retention-system");
const RETENTION_DELETION_AUDIT_REASON = "retention-expired";

export interface UlcLinzIdentityDeletionRetention {
  purgeExpiredCompletedDeletions(): Promise<number>;
}

export interface UlcLinzRetentionDependencies
  extends Omit<UlcLinzDeletionDependencies, "authorizeLifecycleWrite"> {
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    | "evaluateRetention"
    | "completeIdentityDeletion"
    | "purgeExpiredDeletionMarkers"
    | "purgeExpiredLifecycleAuditEvents"
  >;
  readonly identityDeletionRetention: UlcLinzIdentityDeletionRetention;
}

export interface UlcLinzRetentionRunResult {
  readonly deletedIdentityIds: readonly string[];
  readonly exceptionIdentityIds: readonly string[];
  readonly purgedAppDeletionMarkers: number;
  readonly purgedIdentityDeletionTombstones: number;
  readonly purgedLifecycleAuditEvents: number;
}

/**
 * Non-request-runtime retention executor for the current ULC member/contact
 * lifecycle plus bounded delete markers and app-local lifecycle audit. Permission
 * administration audit keeps its separate existing 12-month owner-local primitive.
 * No generic scheduler or future module/object-storage lifecycle is invented.
 */
export async function runUlcLinzRetention(
  dependencies: UlcLinzRetentionDependencies,
): Promise<UlcLinzRetentionRunResult> {
  const states = await dependencies.scopes.evaluateRetention();
  const deletedIdentityIds: string[] = [];
  const exceptionIdentityIds: string[] = [];

  for (const state of states) {
    if (state.status === "exception") {
      exceptionIdentityIds.push(state.target.identityId);
      continue;
    }
    if (state.status !== "due") continue;

    const sourceRole = deletableSourceRole(state);
    const targetIdentityId = state.target.identityId;
    await deleteUlcLinzIdentity(
      {
        identity: dependencies.identity,
        identityDeletion: dependencies.identityDeletion,
        permissions: dependencies.permissions,
        accessAdministration: dependencies.accessAdministration,
        principalLifecycle: dependencies.principalLifecycle,
        async authorizeLifecycleWrite({ targetIdentityId: authorizedTarget }) {
          if (authorizedTarget !== targetIdentityId) blocked();
          await revalidateDueRetentionState(
            dependencies.scopes,
            state.target,
            sourceRole,
          );
          return {
            actorPrincipalId: RETENTION_ACTOR,
            targetSourceRole: sourceRole,
          };
        },
      },
      targetIdentityId,
    );
    await dependencies.scopes.completeIdentityDeletion({
      identityId: targetIdentityId,
      actor: String(RETENTION_ACTOR),
      reason: RETENTION_DELETION_AUDIT_REASON,
    });
    deletedIdentityIds.push(targetIdentityId);
  }

  const purgedAppDeletionMarkers =
    await dependencies.scopes.purgeExpiredDeletionMarkers();
  const purgedIdentityDeletionTombstones =
    await dependencies.identityDeletionRetention.purgeExpiredCompletedDeletions();
  const purgedLifecycleAuditEvents =
    await dependencies.scopes.purgeExpiredLifecycleAuditEvents();

  return Object.freeze({
    deletedIdentityIds: Object.freeze(deletedIdentityIds),
    exceptionIdentityIds: Object.freeze(exceptionIdentityIds),
    purgedAppDeletionMarkers,
    purgedIdentityDeletionTombstones,
    purgedLifecycleAuditEvents,
  });
}

async function revalidateDueRetentionState(
  scopes: Pick<PostgresUlcLinzScopePersistence, "evaluateRetention">,
  expectedTarget: UlcLinzLifecycleTarget,
  expectedSourceRole: UlcLinzDeletableSourceRole,
): Promise<void> {
  const currentStates = await scopes.evaluateRetention();
  const matches = currentStates.filter(
    (candidate) => candidate.target.identityId === expectedTarget.identityId,
  );
  if (matches.length !== 1) retentionStateChanged();
  const current = matches[0];
  if (
    current === undefined ||
    current.status !== "due" ||
    deletableSourceRole(current) !== expectedSourceRole ||
    !sameLifecycleTarget(current.target, expectedTarget)
  ) {
    retentionStateChanged();
  }
}

function sameLifecycleTarget(
  current: UlcLinzLifecycleTarget,
  expected: UlcLinzLifecycleTarget,
): boolean {
  return (
    current.identityId === expected.identityId &&
    current.organizationId === expected.organizationId &&
    current.subjectId === expected.subjectId &&
    current.sourceRole === expected.sourceRole &&
    current.active === expected.active &&
    current.endedAt?.getTime() === expected.endedAt?.getTime()
  );
}

function deletableSourceRole(
  state: Extract<UlcLinzRetentionState, { status: "due" }>,
): UlcLinzDeletableSourceRole {
  const value = state.target.sourceRole;
  if (value !== "trainer" && value !== "athlete" && value !== "parent") blocked();
  return value;
}

function retentionStateChanged(): never {
  throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
}

function blocked(): never {
  throw new UlcLinzLifecycleBlockedError("ADMIN_LIFECYCLE_SCOPE_UNBOUND");
}

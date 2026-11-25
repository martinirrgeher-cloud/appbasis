import { principalId } from "@appbasis/permissions";

import {
  deleteUlcLinzIdentity,
  UlcLinzLifecycleBlockedError,
  type UlcLinzDeletionDependencies,
} from "./lifecycle";
import type {
  PostgresUlcLinzScopePersistence,
  UlcLinzDeletableSourceRole,
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
    | "claimDueRetentionDeletion"
    | "completeIdentityDeletion"
    | "purgeExpiredDeletionMarkers"
    | "purgeExpiredLifecycleAuditEvents"
  >;
  readonly identityDeletionRetention: UlcLinzIdentityDeletionRetention;
}

export interface UlcLinzRetentionRunResult {
  readonly deletedIdentityIds: readonly string[];
  readonly exceptionIdentityIds: readonly string[];
  /** Due athletes awaiting separately authorized eight-owner T07 erasure. */
  readonly deferredAthleteIdentityIds: readonly string[];
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

  // Retention does not own all eight T07 athlete repositories. Only defer
  // the athlete identity; unrelated due members must still be processed.
  const deferredAthleteIdentityIds: string[] = [];
  const deletedIdentityIds: string[] = [];
  const exceptionIdentityIds: string[] = [];

  for (const state of states) {
    if (state.status === "exception") {
      exceptionIdentityIds.push(state.target.identityId);
      continue;
    }
    if (state.status !== "due") continue;
    if (state.target.sourceRole === "athlete") {
      deferredAthleteIdentityIds.push(state.target.identityId);
      continue;
    }

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
          await dependencies.scopes.claimDueRetentionDeletion(state.target);
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
    deferredAthleteIdentityIds: Object.freeze(deferredAthleteIdentityIds),
    purgedAppDeletionMarkers,
    purgedIdentityDeletionTombstones,
    purgedLifecycleAuditEvents,
  });
}

function deletableSourceRole(
  state: Extract<UlcLinzRetentionState, { status: "due" }>,
): UlcLinzDeletableSourceRole {
  const value = state.target.sourceRole;
  if (value !== "trainer" && value !== "athlete" && value !== "parent" && value !== "functionary") blocked();
  return value;
}

function blocked(): never {
  throw new UlcLinzLifecycleBlockedError("ADMIN_LIFECYCLE_SCOPE_UNBOUND");
}

import { principalId } from "@appbasis/permissions";

import {
  deleteUlcLinzIdentity,
  UlcLinzLifecycleBlockedError,
  type UlcLinzDeletionDependencies,
} from "./lifecycle";
import {
  reconcileDeletedRegistrationScheduleActor,
  replayRegistrationScheduleActorErasureForCurrentMarkers,
  type UlcRegistrationScheduleLifecyclePrivacyHook,
} from "./registration-schedule-lifecycle";
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
  /** A02.4 opt-in only. Must be present before v12 retention activation. */
  readonly registrationSchedulePrivacy?: UlcRegistrationScheduleLifecyclePrivacyHook;
  /**
   * Required for enabled A02.4 retention: scan current authoritative
   * app-deletion markers before any can be purged. Independent v11
   * retention callers need not provide this dependency.
   */
  readonly registrationScheduleDeletedMarkers?: Readonly<{
    listCurrentDeletionMarkers(): Promise<readonly {
      identityId: string;
      organizationId: string;
      subjectId: string;
      sourceRole: "trainer" | "athlete" | "parent" | "functionary";
      completedAt: Date;
      purgeAfter: Date;
    }[]>;
  }>;
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
  if (dependencies.registrationSchedulePrivacy) {
    if (!dependencies.registrationScheduleDeletedMarkers) blocked();
    // Reconcile orphaned actor-redaction work from a prior interrupted
    // deletion. This MUST precede marker expiration/purge.
    await replayRegistrationScheduleActorErasureForCurrentMarkers(
      dependencies.registrationScheduleDeletedMarkers,
      dependencies.registrationSchedulePrivacy,
    );
  }
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
          await dependencies.scopes.claimDueRetentionDeletion(state.target);
          return {
            actorPrincipalId: RETENTION_ACTOR,
            targetSourceRole: sourceRole,
          };
        },
      },
      targetIdentityId,
    );
    const completedMarker = await dependencies.scopes.completeIdentityDeletion({
      identityId: targetIdentityId,
      actor: String(RETENTION_ACTOR),
      reason: RETENTION_DELETION_AUDIT_REASON,
    });
    if (completedMarker.identityId !== targetIdentityId ||
        completedMarker.organizationId !== state.target.organizationId ||
        completedMarker.sourceRole !== sourceRole) blocked();
    await reconcileDeletedRegistrationScheduleActor(
      dependencies.registrationSchedulePrivacy, completedMarker,
    );
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

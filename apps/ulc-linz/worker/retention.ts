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

export interface UlcLinzIdentityDeletionRetention {
  purgeExpiredCompletedDeletions(): Promise<number>;
}

export interface UlcLinzRetentionDependencies
  extends Omit<UlcLinzDeletionDependencies, "authorizeLifecycleWrite"> {
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    "evaluateRetention" | "completeIdentityDeletion" | "purgeExpiredDeletionMarkers"
  >;
  readonly identityDeletionRetention: UlcLinzIdentityDeletionRetention;
}

export interface UlcLinzRetentionRunResult {
  readonly deletedIdentityIds: readonly string[];
  readonly exceptionIdentityIds: readonly string[];
  readonly purgedAppDeletionMarkers: number;
  readonly purgedIdentityDeletionTombstones: number;
}

/**
 * Non-request-runtime retention executor for the current ULC member/contact
 * lifecycle plus bounded delete markers. Permission-administration audit has a
 * separate existing owner-local 12-month retention primitive; keeping owner
 * cleanup independent avoids coupling ULC to Permissions implementation details.
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
          return {
            actorPrincipalId: RETENTION_ACTOR,
            targetSourceRole: sourceRole,
          };
        },
      },
      targetIdentityId,
    );
    await dependencies.scopes.completeIdentityDeletion(targetIdentityId);
    deletedIdentityIds.push(targetIdentityId);
  }

  const purgedAppDeletionMarkers =
    await dependencies.scopes.purgeExpiredDeletionMarkers();
  const purgedIdentityDeletionTombstones =
    await dependencies.identityDeletionRetention.purgeExpiredCompletedDeletions();

  return Object.freeze({
    deletedIdentityIds: Object.freeze(deletedIdentityIds),
    exceptionIdentityIds: Object.freeze(exceptionIdentityIds),
    purgedAppDeletionMarkers,
    purgedIdentityDeletionTombstones,
  });
}

function deletableSourceRole(
  state: Extract<UlcLinzRetentionState, { status: "due" }>,
): UlcLinzDeletableSourceRole {
  const value = state.target.sourceRole;
  if (value !== "trainer" && value !== "athlete" && value !== "parent") blocked();
  return value;
}

function blocked(): never {
  throw new UlcLinzLifecycleBlockedError("ADMIN_LIFECYCLE_SCOPE_UNBOUND");
}

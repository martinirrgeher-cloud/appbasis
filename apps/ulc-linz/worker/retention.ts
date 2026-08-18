import type { PostgresIdentityDeletionRetention } from "@appbasis/identity/postgres-deletion-retention";
import {
  principalId,
  type PostgresPermissionAdministrationAuditRetention,
} from "@appbasis/permissions";

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

export interface UlcLinzRetentionDependencies
  extends Omit<UlcLinzDeletionDependencies, "authorizeLifecycleWrite"> {
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    "evaluateRetention" | "completeIdentityDeletion" | "purgeExpiredDeletionMarkers"
  >;
  readonly identityDeletionRetention: Pick<
    PostgresIdentityDeletionRetention,
    "purgeExpiredCompletedDeletions"
  >;
  readonly permissionAuditRetention: Pick<
    PostgresPermissionAdministrationAuditRetention,
    "deleteExpiredAuditEvents"
  >;
}

export interface UlcLinzRetentionRunResult {
  readonly deletedIdentityIds: readonly string[];
  readonly exceptionIdentityIds: readonly string[];
  readonly purgedPermissionAuditEvents: number;
  readonly purgedAppDeletionMarkers: number;
  readonly purgedIdentityDeletionTombstones: number;
}

/**
 * Non-request-runtime retention executor for all currently materialized ULC
 * personal lifecycle classes: member/contact identity + principal state, the
 * app-owned membership/subject scope, permission administration audit and the
 * bounded deletion reconciliation markers. It intentionally does not invent a
 * generic scheduler or claim future module/object-storage coverage.
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

  const purgedPermissionAuditEvents =
    await dependencies.permissionAuditRetention.deleteExpiredAuditEvents();

  // App marker first, then Identity owner tombstone. Both use the same confirmed
  // 35-day backup window and strictly-older semantics in their owner boundary.
  const purgedAppDeletionMarkers =
    await dependencies.scopes.purgeExpiredDeletionMarkers();
  const purgedIdentityDeletionTombstones =
    await dependencies.identityDeletionRetention.purgeExpiredCompletedDeletions();

  return Object.freeze({
    deletedIdentityIds: Object.freeze(deletedIdentityIds),
    exceptionIdentityIds: Object.freeze(exceptionIdentityIds),
    purgedPermissionAuditEvents,
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

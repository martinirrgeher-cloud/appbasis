import type { IdentityPostgresRuntimeSqlClient } from "@appbasis/identity/postgres-runtime";
import { principalId } from "@appbasis/permissions";

import {
  deleteUlcLinzIdentity,
  UlcLinzLifecycleBlockedError,
  type UlcLinzDeletionDependencies,
} from "./lifecycle";
import type {
  PostgresUlcLinzScopePersistence,
  UlcLinzDeletionMarker,
} from "./scope-persistence";

const RESTORE_RECONCILIATION_ACTOR = principalId("ulc-linz:restore-reconciliation");

type SqlClient = IdentityPostgresRuntimeSqlClient;

export interface UlcLinzDeletionReconciliationSource {
  listCurrentDeletionMarkers(): Promise<readonly UlcLinzDeletionMarker[]>;
}

/**
 * Read-only source for deletion decisions that still fall inside the confirmed
 * 35-day backup window. A restore must obtain this from an authoritative newer
 * ULC database before a restored older database can be promoted.
 */
export class PostgresUlcLinzDeletionReconciliationSource
  implements UlcLinzDeletionReconciliationSource
{
  constructor(
    private readonly sql: SqlClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCurrentDeletionMarkers(): Promise<readonly UlcLinzDeletionMarker[]> {
    const now = validNow(this.now()).toISOString();
    const rows = await this.sql.unsafe(
      `SELECT identity_id, organization_id, subject_id, source_role, completed_at, purge_after
       FROM ulc_linz_lifecycle_deletion
       WHERE purge_after >= $1
       ORDER BY completed_at ASC, identity_id ASC`,
      [now],
    );
    return Object.freeze(rows.map((row) => markerFromRow(row)));
  }
}

export interface UlcLinzRestoreReconciliationDependencies
  extends Omit<UlcLinzDeletionDependencies, "authorizeLifecycleWrite"> {
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    "findLifecycleTarget" | "findDeletionMarker" | "completeIdentityDeletion"
  >;
}

export interface UlcLinzRestoreReconciliationResult {
  readonly requiredDeletionCount: number;
  readonly reconciledIdentityIds: readonly string[];
}

/**
 * Replays authoritative completed deletion decisions into a restored older ULC
 * database before production promotion. Any role/org/subject drift blocks the
 * restore instead of guessing that an old backup is safe to activate.
 */
export async function reconcileUlcLinzRestoredDatabase(
  source: UlcLinzDeletionReconciliationSource,
  target: UlcLinzRestoreReconciliationDependencies,
): Promise<UlcLinzRestoreReconciliationResult> {
  const markers = await source.listCurrentDeletionMarkers();
  const seen = new Set<string>();
  const reconciledIdentityIds: string[] = [];

  for (const marker of markers) {
    if (seen.has(marker.identityId)) blocked();
    seen.add(marker.identityId);

    const [restoredMembership, restoredMarker] = await Promise.all([
      target.scopes.findLifecycleTarget(marker.identityId),
      target.scopes.findDeletionMarker(marker.identityId),
    ]);
    if (restoredMembership !== null && restoredMarker !== null) blocked();

    if (restoredMarker !== null) {
      assertSameMarker(marker, restoredMarker);
    } else if (
      restoredMembership === null ||
      restoredMembership.organizationId !== marker.organizationId ||
      restoredMembership.subjectId !== marker.subjectId ||
      restoredMembership.sourceRole !== marker.sourceRole
    ) {
      blocked();
    }

    await deleteUlcLinzIdentity(
      {
        identity: target.identity,
        identityDeletion: target.identityDeletion,
        permissions: target.permissions,
        accessAdministration: target.accessAdministration,
        principalLifecycle: target.principalLifecycle,
        async authorizeLifecycleWrite({ targetIdentityId }) {
          if (targetIdentityId !== marker.identityId) blocked();
          return {
            actorPrincipalId: RESTORE_RECONCILIATION_ACTOR,
            targetSourceRole: marker.sourceRole,
          };
        },
      },
      marker.identityId,
    );

    const completed = await target.scopes.completeIdentityDeletion(marker.identityId);
    if (
      completed.organizationId !== marker.organizationId ||
      completed.subjectId !== marker.subjectId ||
      completed.sourceRole !== marker.sourceRole
    ) {
      blocked();
    }
    reconciledIdentityIds.push(marker.identityId);
  }

  return Object.freeze({
    requiredDeletionCount: markers.length,
    reconciledIdentityIds: Object.freeze(reconciledIdentityIds),
  });
}

function assertSameMarker(
  source: UlcLinzDeletionMarker,
  target: UlcLinzDeletionMarker,
): void {
  if (
    source.identityId !== target.identityId ||
    source.organizationId !== target.organizationId ||
    source.subjectId !== target.subjectId ||
    source.sourceRole !== target.sourceRole
  ) {
    blocked();
  }
}

function markerFromRow(row: Record<string, unknown>): UlcLinzDeletionMarker {
  const sourceRole = row.source_role;
  if (sourceRole !== "trainer" && sourceRole !== "athlete" && sourceRole !== "parent") {
    blocked();
  }
  return Object.freeze({
    identityId: requiredIdentifier(row.identity_id),
    organizationId: requiredIdentifier(row.organization_id),
    subjectId: requiredIdentifier(row.subject_id),
    sourceRole,
    completedAt: requiredDate(row.completed_at),
    purgeAfter: requiredDate(row.purge_after),
  });
}

function requiredIdentifier(value: unknown): string {
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

function requiredDate(value: unknown): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(date.getTime())) blocked();
  return date;
}

function validNow(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) blocked();
  return value;
}

function blocked(): never {
  throw new UlcLinzLifecycleBlockedError("UNKNOWN_PERMISSION_STATE");
}

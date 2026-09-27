import type {
  AthleteMasterdataDeletionMarker,
  AthleteMasterdataDeletionReplayResult,
} from './postgres-masterdata-repository';

export interface AthleteMasterdataDeletionReconciliationSource {
  listCurrentDeletionMarkers(): Promise<
    readonly AthleteMasterdataDeletionMarker[]
  >;
}

export interface AthleteMasterdataDeletionReconciliationTarget {
  reconcileDeletionMarker(
    marker: AthleteMasterdataDeletionMarker,
  ): Promise<AthleteMasterdataDeletionReplayResult>;
}

export interface AthleteMasterdataRestoreReconciliationResult {
  readonly requiredDeletionCount: number;
  readonly insertedMarkerCount: number;
  readonly deletedEntityCount: number;
  readonly deletedGroupMembershipCount: number;
}

/**
 * Replays authoritative module-owned deletion markers into a restored older
 * athletes schema. The target implementation remains responsible for the SQL
 * organization boundary and for fail-closed marker consistency.
 */
export async function reconcileAthleteMasterdataRestoredDatabase(
  source: AthleteMasterdataDeletionReconciliationSource,
  target: AthleteMasterdataDeletionReconciliationTarget,
): Promise<AthleteMasterdataRestoreReconciliationResult> {
  const markers = await source.listCurrentDeletionMarkers();
  const seen = new Set<string>();
  for (const marker of markers) {
    const key = markerKey(marker);
    if (seen.has(key)) {
      throw new Error('Athletes restore reconciliation contains duplicate markers.');
    }
    seen.add(key);
  }

  let insertedMarkerCount = 0;
  let deletedEntityCount = 0;
  let deletedGroupMembershipCount = 0;

  for (const marker of markers) {
    const replay = await target.reconcileDeletionMarker(marker);
    if (replay.markerInserted) insertedMarkerCount += 1;
    if (replay.deletedEntity) deletedEntityCount += 1;
    deletedGroupMembershipCount += replay.deletedGroupMemberships;
  }

  return Object.freeze({
    requiredDeletionCount: markers.length,
    insertedMarkerCount,
    deletedEntityCount,
    deletedGroupMembershipCount,
  });
}

function markerKey(marker: AthleteMasterdataDeletionMarker): string {
  if (
    (marker.entityType !== 'athlete' && marker.entityType !== 'trainer') ||
    typeof marker.entityId !== 'string' ||
    marker.entityId.length === 0 ||
    marker.entityId.trim() !== marker.entityId ||
    marker.entityId.length > 200 ||
    typeof marker.organizationId !== 'string' ||
    marker.organizationId.length === 0 ||
    marker.organizationId.trim() !== marker.organizationId ||
    marker.organizationId.length > 200 ||
    !(marker.completedAt instanceof Date) ||
    !Number.isFinite(marker.completedAt.getTime()) ||
    !(marker.purgeAfter instanceof Date) ||
    !Number.isFinite(marker.purgeAfter.getTime()) ||
    marker.purgeAfter.getTime() - marker.completedAt.getTime() !==
      35 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Athletes restore reconciliation marker is invalid.');
  }
  return `${marker.entityType}:${marker.entityId}`;
}

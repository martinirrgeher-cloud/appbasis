import { normalizeTrainingBlockIdentifier } from "./training-block";
import type {
  TrainingBlockFavoriteDeletionMarker,
  TrainingBlockFavoriteDeletionResult,
  TrainingBlockFavoriteReconciliationRepository,
} from "./repository";

const MARKER_RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

export interface TrainingBlockFavoriteRestoreResult {
  readonly requiredDeletionCount: number;
  readonly insertedMarkerCount: number;
  readonly deletedFavorites: number;
}

/**
 * Offline recovery only. The caller must independently prove that source is an
 * authoritative NEWER recovery point, keep restored target writes disabled,
 * and block promotion until every replay succeeds. An empty source is NOT
 * proof that no deletions occurred, and this function does not promote data.
 */
export async function reconcileTrainingBlockFavoritesRestoredDatabase(
  source: Pick<TrainingBlockFavoriteReconciliationRepository, "listCurrentDeletionMarkers">,
  target: Pick<TrainingBlockFavoriteReconciliationRepository, "reconcileDeletionMarker">,
  now: Date,
): Promise<TrainingBlockFavoriteRestoreResult> {
  const current = requiredDate(now);
  const sourceMarkers = await source.listCurrentDeletionMarkers(current);
  if (!Array.isArray(sourceMarkers)) {
    throw new Error("Training block authoritative deletion markers are invalid.");
  }

  // Validate the entire authority snapshot before mutating the restored target.
  const seen = new Set<string>();
  const markers = sourceMarkers.map((marker) => {
    const validated = requiredMarker(marker, current);
    const key = JSON.stringify([validated.organizationId, validated.principalId]);
    if (seen.has(key)) {
      throw new Error("Training block authoritative deletion markers contain duplicates.");
    }
    seen.add(key);
    return validated;
  });

  let insertedMarkerCount = 0;
  let deletedFavorites = 0;
  for (const marker of markers) {
    const result = requiredReplayResult(await target.reconcileDeletionMarker(marker));
    if (result.markerInserted) insertedMarkerCount++;
    deletedFavorites += result.deletedFavorites;
  }
  return Object.freeze({
    requiredDeletionCount: markers.length,
    insertedMarkerCount,
    deletedFavorites,
  });
}

function requiredMarker(
  marker: TrainingBlockFavoriteDeletionMarker,
  now: Date,
): TrainingBlockFavoriteDeletionMarker {
  if (marker === null || typeof marker !== "object") {
    throw new Error("Training block restore deletion marker is invalid.");
  }
  const organizationId = normalizeTrainingBlockIdentifier(marker.organizationId, "Organization id");
  const principalId = normalizeTrainingBlockIdentifier(marker.principalId, "Principal id");
  const completedAt = requiredDate(marker.completedAt);
  const purgeAfter = requiredDate(marker.purgeAfter);
  if (
    completedAt.getTime() > now.getTime() ||
    purgeAfter.getTime() < now.getTime() ||
    purgeAfter.getTime() - completedAt.getTime() !== MARKER_RETENTION_MS
  ) {
    throw new Error("Training block restore marker retention is invalid.");
  }
  return Object.freeze({ organizationId, principalId, completedAt, purgeAfter });
}

function requiredDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Training block restore timestamp is invalid.");
  }
  return new Date(value.getTime());
}

function requiredReplayResult(
  result: TrainingBlockFavoriteDeletionResult,
): TrainingBlockFavoriteDeletionResult {
  if (
    result === null || typeof result !== "object" ||
    typeof result.markerInserted !== "boolean" ||
    !Number.isSafeInteger(result.deletedFavorites) ||
    result.deletedFavorites < 0
  ) {
    throw new Error("Training block restore replay result is invalid.");
  }
  return result;
}

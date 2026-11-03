import { normalizeTrainingBlockIdentifier } from "./training-block";
import type {
  TrainingBlockSubjectUsageDeletionMarker,
  TrainingBlockSubjectUsageDeletionResult,
  TrainingBlockSubjectUsageReconciliationRepository,
} from "./repository";

const RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

export interface TrainingBlockSubjectUsageRestoreResult {
  readonly requiredDeletionCount: number;
  readonly insertedMarkerCount: number;
  readonly deletedUsageEvents: number;
}

/**
 * OFFLINE recovery only. The caller must independently prove a newer,
 * complete and authoritative source, freeze the target, and deny promotion
 * until every app/module owner has reconciled and verified its own data.
 *
 * An empty list (or a successful run) does NOT prove that all historic
 * deletion decisions have been recovered. Expired markers remain effective.
 */
export async function reconcileTrainingBlockSubjectUsageRestoredDatabase(
  source: Pick<
    TrainingBlockSubjectUsageReconciliationRepository,
    "listSubjectUsageDeletionMarkers"
  >,
  target: Pick<
    TrainingBlockSubjectUsageReconciliationRepository,
    "reconcileSubjectUsageDeletionMarker"
  >,
  now: Date,
): Promise<TrainingBlockSubjectUsageRestoreResult> {
  const current = requiredDate(now);
  const authority = await source.listSubjectUsageDeletionMarkers(current);
  if (!Array.isArray(authority)) {
    throw new Error("Training block subject restore authority is invalid.");
  }

  // Validate all source decisions BEFORE touching the offline target.
  const seen = new Set<string>();
  const markers = authority.map((raw) => {
    const marker = validatedMarker(raw, current);
    const key = JSON.stringify([marker.organizationId, marker.subjectId]);
    if (seen.has(key)) {
      throw new Error("Training block subject restore authority contains duplicates.");
    }
    seen.add(key);
    return marker;
  });

  let insertedMarkerCount = 0;
  let deletedUsageEvents = 0;
  for (const marker of markers) {
    const outcome = validatedResult(
      await target.reconcileSubjectUsageDeletionMarker(marker),
    );
    if (outcome.markerInserted) insertedMarkerCount++;
    deletedUsageEvents += outcome.deletedUsageEvents;
  }
  return Object.freeze({
    requiredDeletionCount: markers.length,
    insertedMarkerCount,
    deletedUsageEvents,
  });
}

function validatedMarker(
  marker: TrainingBlockSubjectUsageDeletionMarker,
  now: Date,
): TrainingBlockSubjectUsageDeletionMarker {
  if (marker === null || typeof marker !== "object") {
    throw new Error("Training block subject restore marker is invalid.");
  }
  const organizationId = normalizeTrainingBlockIdentifier(
    marker.organizationId, "Organization id",
  );
  const subjectId = normalizeTrainingBlockIdentifier(
    marker.subjectId, "Subject id",
  );
  const completedAt = requiredDate(marker.completedAt);
  const purgeAfter = requiredDate(marker.purgeAfter);
  if (
    completedAt.getTime() > now.getTime() ||
    purgeAfter.getTime() - completedAt.getTime() !== RETENTION_MS
  ) {
    throw new Error("Training block subject restore marker retention is invalid.");
  }
  return Object.freeze({ organizationId, subjectId, completedAt, purgeAfter });
}

function requiredDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Training block subject restore timestamp is invalid.");
  }
  return new Date(value.getTime());
}

function validatedResult(
  result: TrainingBlockSubjectUsageDeletionResult,
): TrainingBlockSubjectUsageDeletionResult {
  if (
    result === null || typeof result !== "object" ||
    typeof result.markerInserted !== "boolean" ||
    !Number.isSafeInteger(result.deletedUsageEvents) ||
    result.deletedUsageEvents < 0
  ) {
    throw new Error("Training block subject restore replay result is invalid.");
  }
  return result;
}

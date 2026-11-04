import { normalizeTrainingDocumentationIdentifier } from "./training-documentation";
import type {
  TrainingDocumentationSubjectDeletionMarker,
  TrainingDocumentationSubjectDeletionResult,
  TrainingDocumentationSubjectRestoreRepository,
} from "./repository";

export const TRAINING_DOCUMENTATION_MARKER_RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

export interface TrainingDocumentationRestoreResult {
  readonly requiredDeletionCount: number;
  readonly insertedMarkerCount: number;
  readonly deletedDocuments: number;
  readonly deletedRevisions: number;
  readonly redactedOtherSubjectRevisions: number;
}

/**
 * OFFLINE ONLY. The operator must prove that the source is newer and is a
 * complete authoritative marker snapshot, freeze the restore target, and
 * reconcile every app/module owner before any promotion or access.
 *
 * This is deliberately not atomic ACROSS markers. A failed replay leaves the
 * restore candidate quarantined and requires a verified idempotent retry.
 * Neither an empty list nor a successful replay proves a complete deletion
 * history, especially if a source once purged its markers.
 */
export async function reconcileTrainingDocumentationRestoredDatabase(
  source: Pick<TrainingDocumentationSubjectRestoreRepository, "listSubjectDeletionMarkers">,
  target: Pick<TrainingDocumentationSubjectRestoreRepository, "reconcileSubjectDeletionMarker">,
  now: Date,
): Promise<TrainingDocumentationRestoreResult> {
  const current = requiredTrainingDocumentationRestoreDate(now);
  const decisions = await source.listSubjectDeletionMarkers(current);
  if (!Array.isArray(decisions)) {
    throw new Error("Training documentation restore authority is invalid.");
  }

  // Validate the ENTIRE source snapshot before any target writes.
  const keys = new Set<string>();
  const markers = decisions.map((raw) => {
    const marker = requiredTrainingDocumentationDeletionMarker(raw, current);
    const key = JSON.stringify([marker.organizationId, marker.subjectId]);
    if (keys.has(key)) {
      throw new Error("Training documentation restore authority contains duplicates.");
    }
    keys.add(key);
    return marker;
  });

  let insertedMarkerCount = 0;
  let deletedDocuments = 0;
  let deletedRevisions = 0;
  let redactedOtherSubjectRevisions = 0;
  for (const marker of markers) {
    const result = validatedReplayResult(
      await target.reconcileSubjectDeletionMarker(marker),
    );
    if (result.markerInserted) insertedMarkerCount++;
    deletedDocuments += result.deletedDocuments;
    deletedRevisions += result.deletedRevisions;
    redactedOtherSubjectRevisions += result.redactedOtherSubjectRevisions;
    if (![deletedDocuments, deletedRevisions, redactedOtherSubjectRevisions].every(Number.isSafeInteger)) {
      throw new Error("Training documentation restore totals exceeded safe precision.");
    }
  }
  return Object.freeze({
    requiredDeletionCount: markers.length,
    insertedMarkerCount,
    deletedDocuments,
    deletedRevisions,
    redactedOtherSubjectRevisions,
  });
}

export function requiredTrainingDocumentationRestoreDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Training documentation restore timestamp is invalid.");
  }
  return new Date(value.getTime());
}

export function requiredTrainingDocumentationDeletionMarker(
  raw: TrainingDocumentationSubjectDeletionMarker,
  now?: Date,
): TrainingDocumentationSubjectDeletionMarker {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Training documentation restore marker is invalid.");
  }
  const organizationId = normalizeTrainingDocumentationIdentifier(
    raw.organizationId, "Documentation organization",
  );
  const subjectId = normalizeTrainingDocumentationIdentifier(
    raw.subjectId, "Documentation subject",
  );
  const completedAt = requiredTrainingDocumentationRestoreDate(raw.completedAt);
  const purgeAfter = requiredTrainingDocumentationRestoreDate(raw.purgeAfter);
  if (
    purgeAfter.getTime() - completedAt.getTime() !== TRAINING_DOCUMENTATION_MARKER_RETENTION_MS ||
    (now !== undefined && completedAt.getTime() > requiredTrainingDocumentationRestoreDate(now).getTime())
  ) {
    throw new Error("Training documentation restore marker retention is invalid.");
  }
  return Object.freeze({ organizationId, subjectId, completedAt, purgeAfter });
}

function validatedReplayResult(
  result: TrainingDocumentationSubjectDeletionResult,
): TrainingDocumentationSubjectDeletionResult {
  if (
    result === null || typeof result !== "object" ||
    typeof result.markerInserted !== "boolean" ||
    ![result.deletedDocuments, result.deletedRevisions, result.redactedOtherSubjectRevisions]
      .every((count) => Number.isSafeInteger(count) && count >= 0) ||
    result.deletedRevisions < result.deletedDocuments
  ) {
    throw new Error("Training documentation restore replay result is invalid.");
  }
  return result;
}

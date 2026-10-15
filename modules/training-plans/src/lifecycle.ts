import {
  TrainingPlanValidationError,
  normalizeTrainingPlanIdentifier,
} from "./training-plan";
import type {
  TrainingPlanDeletionReplayResult,
  TrainingPlanLifecycleRepository,
  TrainingPlanSubjectDeletionMarker,
  TrainingPlanSubjectDeletionResult,
} from "./repository";

const DELETION_MARKER_RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

export interface TrainingPlanLifecycleServiceOptions {
  readonly repository: TrainingPlanLifecycleRepository;
  readonly now?: () => Date;
}

export interface TrainingPlanRestoreReconciliationResult {
  readonly requiredDeletionCount: number;
  readonly insertedMarkerCount: number;
  readonly deletedPlans: number;
  readonly deletedRevisions: number;
  readonly deletedItems: number;
}

/**
 * Privileged lifecycle boundary for plan-owned subject data.
 *
 * Policy timing and authorization stay application-owned. A module-owned,
 * short-lived deletion marker closes the race between an app-level subject
 * disable and already-authorized plan creates: create/update/purge all
 * serialize on the same subject lock and writes fail closed while the marker
 * exists. The marker is retained for the restore-reconciliation window.
 */
export class TrainingPlanLifecycleService {
  readonly #repository: TrainingPlanLifecycleRepository;
  readonly #now: () => Date;

  constructor(options: TrainingPlanLifecycleServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object" ||
      typeof options.repository.deleteSubjectData !== "function" ||
      typeof options.repository.listCurrentDeletionMarkers !== "function" ||
      typeof options.repository.reconcileDeletionMarker !== "function" ||
      typeof options.repository.purgeExpiredDeletionMarkers !== "function"
    ) {
      throw new TrainingPlanValidationError(
        "Training plan lifecycle service options are invalid.",
      );
    }
    this.#repository = options.repository;
    this.#now = options.now ?? (() => new Date());
  }

  async deleteSubjectData(
    organizationId: string,
    subjectId: string,
  ): Promise<TrainingPlanSubjectDeletionResult> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const subject = normalizeTrainingPlanIdentifier(
      subjectId,
      "Training plan subject",
    );
    const result = await this.#repository.deleteSubjectData(
      organization,
      subject,
      requiredDate(this.#now()),
    );
    return requiredDeletionResult(result);
  }

  async listCurrentDeletionMarkers(): Promise<
    readonly TrainingPlanSubjectDeletionMarker[]
  > {
    const markers = await this.#repository.listCurrentDeletionMarkers(
      requiredDate(this.#now()),
    );
    if (!Array.isArray(markers)) {
      throw new Error(
        "Training plan lifecycle repository returned invalid deletion markers.",
      );
    }
    const seen = new Set<string>();
    return Object.freeze(
      markers.map((marker) => {
        const normalized = requiredDeletionMarker(marker);
        const key = normalized.organizationId + "\u0000" + normalized.subjectId;
        if (seen.has(key)) {
          throw new Error(
            "Training plan lifecycle repository returned duplicate deletion markers.",
          );
        }
        seen.add(key);
        return normalized;
      }),
    );
  }

  async purgeExpiredDeletionMarkers(): Promise<number> {
    const count = await this.#repository.purgeExpiredDeletionMarkers(
      requiredDate(this.#now()),
    );
    if (!nonNegativeInteger(count)) {
      throw new Error(
        "Training plan lifecycle repository returned an invalid marker purge count.",
      );
    }
    return count;
  }
}

export async function reconcileTrainingPlanRestoredDatabase(
  source: Pick<TrainingPlanLifecycleService, "listCurrentDeletionMarkers">,
  target: Pick<TrainingPlanLifecycleRepository, "reconcileDeletionMarker">,
): Promise<TrainingPlanRestoreReconciliationResult> {
  const markers = await source.listCurrentDeletionMarkers();
  let insertedMarkerCount = 0;
  let deletedPlans = 0;
  let deletedRevisions = 0;
  let deletedItems = 0;

  for (const marker of markers) {
    const replay = requiredReplayResult(
      await target.reconcileDeletionMarker(marker),
    );
    if (replay.markerInserted) insertedMarkerCount += 1;
    deletedPlans += replay.deletedPlans;
    deletedRevisions += replay.deletedRevisions;
    deletedItems += replay.deletedItems;
  }

  return Object.freeze({
    requiredDeletionCount: markers.length,
    insertedMarkerCount,
    deletedPlans,
    deletedRevisions,
    deletedItems,
  });
}

function requiredDeletionResult(
  result: TrainingPlanSubjectDeletionResult,
): TrainingPlanSubjectDeletionResult {
  if (
    result === null ||
    typeof result !== "object" ||
    !nonNegativeInteger(result.deletedPlans) ||
    !nonNegativeInteger(result.deletedRevisions) ||
    !nonNegativeInteger(result.deletedItems)
  ) {
    throw new Error(
      "Training plan lifecycle repository returned an invalid deletion result.",
    );
  }
  return Object.freeze({
    deletedPlans: result.deletedPlans,
    deletedRevisions: result.deletedRevisions,
    deletedItems: result.deletedItems,
  });
}

function requiredReplayResult(
  result: TrainingPlanDeletionReplayResult,
): TrainingPlanDeletionReplayResult {
  const deletion = requiredDeletionResult(result);
  if (typeof result.markerInserted !== "boolean") {
    throw new Error(
      "Training plan lifecycle repository returned an invalid replay result.",
    );
  }
  return Object.freeze({
    markerInserted: result.markerInserted,
    ...deletion,
  });
}

function requiredDeletionMarker(
  marker: TrainingPlanSubjectDeletionMarker,
): TrainingPlanSubjectDeletionMarker {
  if (
    marker === null ||
    typeof marker !== "object" ||
    typeof marker.organizationId !== "string" ||
    typeof marker.subjectId !== "string"
  ) {
    throw new Error("Training plan deletion marker is invalid.");
  }
  const organizationId = normalizeTrainingPlanIdentifier(
    marker.organizationId,
    "Deletion marker organization id",
  );
  const subjectId = normalizeTrainingPlanIdentifier(
    marker.subjectId,
    "Deletion marker subject id",
  );
  const completedAt = requiredDate(marker.completedAt);
  const purgeAfter = requiredDate(marker.purgeAfter);
  if (
    purgeAfter.getTime() - completedAt.getTime() !==
    DELETION_MARKER_RETENTION_MS
  ) {
    throw new Error("Training plan deletion marker retention is invalid.");
  }
  return Object.freeze({
    organizationId,
    subjectId,
    completedAt,
    purgeAfter,
  });
}

function requiredDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TrainingPlanValidationError(
      "Training plan lifecycle clock is invalid.",
    );
  }
  return new Date(value.getTime());
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

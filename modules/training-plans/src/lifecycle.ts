import {
  TrainingPlanValidationError,
  normalizeTrainingPlanIdentifier,
} from "./training-plan";
import type {
  TrainingPlanLifecycleRepository,
  TrainingPlanSubjectDeletionResult,
} from "./repository";

export interface TrainingPlanLifecycleServiceOptions {
  readonly repository: TrainingPlanLifecycleRepository;
}

/**
 * Privileged lifecycle boundary for plan-owned subject data.
 *
 * Policy timing and authorization stay application-owned. The caller must make
 * the subject non-writable before purging; the module lock only serializes
 * already in-flight plan writes and does not own subject activation state.
 * This service validates the module-local scope and delegates the physical
 * purge to the module repository.
 */
export class TrainingPlanLifecycleService {
  readonly #repository: TrainingPlanLifecycleRepository;

  constructor(options: TrainingPlanLifecycleServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object" ||
      typeof options.repository.deleteSubjectData !== "function"
    ) {
      throw new TrainingPlanValidationError(
        "Training plan lifecycle service options are invalid.",
      );
    }
    this.#repository = options.repository;
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
    );

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
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

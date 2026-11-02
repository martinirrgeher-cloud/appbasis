import { normalizeTrainingBlockIdentifier } from "./training-block";
import type {
  TrainingBlockFavoriteDeletionRepository,
  TrainingBlockFavoriteDeletionResult,
  TrainingBlockPersonalDataLifecycleRepository,
} from "./repository";

export interface TrainingBlockLifecycleServiceOptions {
  readonly repository: TrainingBlockPersonalDataLifecycleRepository;
}

/**
 * Privileged module-owned primitive, not a public user-deletion endpoint.
 *
 * The calling application must enforce organization and subject authorization
 * and separately stop new writes. This alone is NOT a full deletion lifecycle:
 * it supplies neither tombstones nor restore reconciliation.
 */
export class TrainingBlockLifecycleService {
  readonly #repository: TrainingBlockPersonalDataLifecycleRepository;

  constructor(options: TrainingBlockLifecycleServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object" ||
      typeof options.repository.deletePrincipalFavorites !== "function"
    ) {
      throw new Error("Training-block personal-data lifecycle options are invalid.");
    }
    this.#repository = options.repository;
  }

  async deletePrincipalFavorites(
    organizationId: string,
    principalId: string,
  ): Promise<number> {
    const organization = normalizeTrainingBlockIdentifier(organizationId, "Organization id");
    const principal = normalizeTrainingBlockIdentifier(principalId, "Principal id");
    const deleted = await this.#repository.deletePrincipalFavorites(organization, principal);
    if (!Number.isSafeInteger(deleted) || deleted < 0) {
      throw new Error("Training-block favorites cleanup returned an invalid count.");
    }
    return deleted;
  }
}

/**
 * Controlled, tombstone-protected deletion. This prevents subsequent favorite
 * recreation in the same module owner. An authorized application must invoke it
 * instead of the legacy, non-guarding deletion method.
 *
 * Restore reconciliation and usage subject ownership remain blocked.
 */
export class TrainingBlockFavoriteDeletionService {
  readonly #repository: TrainingBlockFavoriteDeletionRepository;
  readonly #now: () => Date;

  constructor(options: {
    readonly repository: TrainingBlockFavoriteDeletionRepository;
    readonly now?: () => Date;
  }) {
    if (
      !options ||
      typeof options !== "object" ||
      !options.repository ||
      typeof options.repository.markPrincipalDeletedAndDeleteFavorites !== "function" ||
      (options.now !== undefined && typeof options.now !== "function")
    ) {
      throw new Error("Training block deletion service options are invalid.");
    }
    this.#repository = options.repository;
    this.#now = options.now ?? (() => new Date());
  }

  async deletePrincipalFavorites(
    organizationId: string,
    principalId: string,
  ): Promise<TrainingBlockFavoriteDeletionResult> {
    const organization = normalizeTrainingBlockIdentifier(organizationId, "Organization id");
    const principal = normalizeTrainingBlockIdentifier(principalId, "Principal id");
    const completedAt = this.#now();
    if (!(completedAt instanceof Date) || !Number.isFinite(completedAt.getTime())) {
      throw new Error("Training block deletion clock is invalid.");
    }
    const result = await this.#repository.markPrincipalDeletedAndDeleteFavorites(
      organization, principal, new Date(completedAt),
    );
    if (
      !result ||
      typeof result.markerInserted !== "boolean" ||
      !Number.isSafeInteger(result.deletedFavorites) ||
      result.deletedFavorites < 0
    ) {
      throw new Error("Training block deletion repository returned an invalid result.");
    }
    return Object.freeze({
      markerInserted: result.markerInserted,
      deletedFavorites: result.deletedFavorites,
    });
  }
}

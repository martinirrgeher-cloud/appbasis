import { normalizeTrainingBlockIdentifier } from "./training-block";
import type { TrainingBlockPersonalDataLifecycleRepository } from "./repository";

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

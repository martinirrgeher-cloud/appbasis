import {
  ExerciseCatalogValidationError,
  assertExerciseCatalogDefinition,
} from "./domain/catalog";
import { createExerciseCatalogItem } from "./domain/item";
import type {
  CreateExerciseCatalogItemInput,
  ExerciseCatalogDefinition,
  ExerciseCatalogItem,
} from "./domain/types";
import { requiredIdentifier } from "./domain/validation";
import type { ExerciseCatalogRepository } from "./repository";

export type UpdateExerciseCatalogItemInput =
  Partial<CreateExerciseCatalogItemInput>;

export interface ExerciseCatalogItemView {
  readonly item: ExerciseCatalogItem;
  readonly isFavorite: boolean;
}

export interface ExerciseCatalogServiceOptions {
  readonly repository: ExerciseCatalogRepository;
  readonly definition: ExerciseCatalogDefinition;
  readonly createId?: () => string;
}

export class ExerciseCatalogService {
  readonly #repository: ExerciseCatalogRepository;
  readonly #definition: ExerciseCatalogDefinition;
  readonly #createId: () => string;

  constructor(options: ExerciseCatalogServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object"
    ) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog service options are invalid.",
      );
    }
    this.#repository = options.repository;
    this.#definition = assertExerciseCatalogDefinition(options.definition);
    this.#createId = options.createId ?? (() => crypto.randomUUID());
  }

  get definition(): ExerciseCatalogDefinition {
    return this.#definition;
  }

  async list(
    organizationId: string,
    principalId?: string | null,
  ): Promise<readonly ExerciseCatalogItemView[]> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = optionalPrincipalId(principalId);
    const [storedItems, favoriteIds] = await Promise.all([
      this.#repository.listItems(organization),
      principal === null
        ? Promise.resolve([] as readonly string[])
        : this.#repository.listFavoriteExerciseIds(organization, principal),
    ]);

    const items = storedItems.map((item) =>
      this.#normalizePersistedItem(item, organization),
    );
    const ids = new Set(items.map((item) => item.id));
    for (const favoriteId of favoriteIds) {
      if (!ids.has(favoriteId)) {
        throw new Error(
          "Exercise catalog favorite references an unknown item.",
        );
      }
    }
    const favorites = new Set(favoriteIds);
    return Object.freeze(
      items.map((item) =>
        Object.freeze({
          item,
          isFavorite: favorites.has(item.id),
        }),
      ),
    );
  }

  async findById(
    organizationId: string,
    exerciseId: string,
    principalId?: string | null,
  ): Promise<ExerciseCatalogItemView | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    const principal = optionalPrincipalId(principalId);
    const stored = await this.#repository.findItemById(organization, id);
    if (stored === undefined) return undefined;
    const item = this.#normalizePersistedItem(stored, organization);
    const favoriteIds =
      principal === null
        ? []
        : await this.#repository.listFavoriteExerciseIds(
            organization,
            principal,
          );
    return Object.freeze({
      item,
      isFavorite: favoriteIds.includes(item.id),
    });
  }

  async create(
    organizationId: string,
    input: CreateExerciseCatalogItemInput,
  ): Promise<ExerciseCatalogItem> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(this.#createId(), "Generated exercise id");
    const item = createExerciseCatalogItem(input, {
      id,
      organizationId: organization,
      definition: this.#definition,
    });
    const stored = await this.#repository.createItem(item);
    return this.#normalizePersistedItem(stored, organization);
  }

  async update(
    organizationId: string,
    exerciseId: string,
    input: UpdateExerciseCatalogItemInput,
  ): Promise<ExerciseCatalogItem | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog update input is invalid.",
      );
    }

    const stored = await this.#repository.updateItemFromCurrent(
      organization,
      id,
      (current) => {
        const normalizedCurrent = this.#normalizePersistedItem(
          current,
          organization,
        );
        return createExerciseCatalogItem(
          mergeUpdateInput(normalizedCurrent, input),
          {
            id,
            organizationId: organization,
            definition: this.#definition,
          },
        );
      },
    );
    if (stored === undefined) return undefined;
    return this.#normalizePersistedItem(stored, organization);
  }

  async deactivate(
    organizationId: string,
    exerciseId: string,
  ): Promise<ExerciseCatalogItem | undefined> {
    return this.update(organizationId, exerciseId, { isActive: false });
  }

  async setFavorite(
    organizationId: string,
    principalId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<boolean> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = requiredIdentifier(principalId, "Principal id");
    const id = requiredIdentifier(exerciseId, "Exercise id");
    if (typeof favorite !== "boolean") {
      throw new ExerciseCatalogValidationError(
        "Exercise favorite flag is invalid.",
      );
    }
    const item = await this.#repository.findItemById(organization, id);
    if (item === undefined) return false;
    this.#normalizePersistedItem(item, organization);
    await this.#repository.setFavorite(
      organization,
      principal,
      id,
      favorite,
    );
    return true;
  }

  #normalizePersistedItem(
    item: ExerciseCatalogItem,
    expectedOrganizationId: string,
  ): ExerciseCatalogItem {
    if (
      item === null ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      item.organizationId !== expectedOrganizationId
    ) {
      throw new Error(
        "Exercise catalog repository returned an invalid organization scope.",
      );
    }
    return createExerciseCatalogItem(
      {
        name: item.name,
        categoryKey: item.categoryKey,
        subcategory: item.subcategory,
        goal: item.goal,
        description: item.description,
        coachingCues: item.coachingCues,
        commonMistakes: item.commonMistakes,
        equipment: item.equipment,
        videoUrl: item.videoUrl,
        audienceIds: item.audienceIds,
        parameters: item.parameters,
        isActive: item.isActive,
      },
      {
        id: item.id,
        organizationId: item.organizationId,
        definition: this.#definition,
      },
    );
  }
}

function optionalPrincipalId(value: string | null | undefined): string | null {
  return value === undefined || value === null
    ? null
    : requiredIdentifier(value, "Principal id");
}

function mergeUpdateInput(
  current: ExerciseCatalogItem,
  input: UpdateExerciseCatalogItemInput,
): CreateExerciseCatalogItemInput {
  return {
    name: input.name === undefined ? current.name : input.name,
    categoryKey:
      input.categoryKey === undefined
        ? current.categoryKey
        : input.categoryKey,
    subcategory:
      input.subcategory === undefined
        ? current.subcategory
        : input.subcategory,
    goal: input.goal === undefined ? current.goal : input.goal,
    description:
      input.description === undefined
        ? current.description
        : input.description,
    coachingCues:
      input.coachingCues === undefined
        ? current.coachingCues
        : input.coachingCues,
    commonMistakes:
      input.commonMistakes === undefined
        ? current.commonMistakes
        : input.commonMistakes,
    equipment:
      input.equipment === undefined ? current.equipment : input.equipment,
    videoUrl:
      input.videoUrl === undefined ? current.videoUrl : input.videoUrl,
    audienceIds:
      input.audienceIds === undefined
        ? current.audienceIds
        : input.audienceIds,
    parameters:
      input.parameters === undefined ? current.parameters : input.parameters,
    isActive:
      input.isActive === undefined ? current.isActive : input.isActive,
  };
}

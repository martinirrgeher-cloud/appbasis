import {
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogItem,
  type ExerciseCatalogPostgresClient,
} from "@appbasis/exercise-catalog";

import {
  createUlcExerciseCatalogItem,
  type UlcExerciseCatalogItem,
} from "./exercise-catalog-domain";
import {
  PostgresUlcExerciseCatalogRepository,
  UlcExerciseCatalogConflictError,
  UlcExerciseCatalogNotFoundError,
  type UlcExerciseCatalogRecord,
} from "./exercise-catalog-postgres";
import type {
  UlcExerciseCatalogRepository,
} from "./exercise-catalog-service";

export type UlcExerciseCatalogStorageMode =
  | "legacy"
  | "quiesced"
  | "standard";

export class UlcExerciseCatalogQuiescedError extends Error {
  readonly code = "EXERCISE_CATALOG_QUIESCED";

  constructor() {
    super("Exercise catalog writes are temporarily quiesced for runtime cutover.");
    this.name = "UlcExerciseCatalogQuiescedError";
  }
}

export function resolveUlcExerciseCatalogStorageMode(
  value: unknown,
): UlcExerciseCatalogStorageMode | null {
  if (value === undefined) return "legacy";
  return value === "legacy" ||
    value === "quiesced" ||
    value === "standard"
    ? value
    : null;
}

export function createUlcExerciseCatalogRepositoryForMode(
  client: ExerciseCatalogPostgresClient,
  mode: UlcExerciseCatalogStorageMode,
): UlcExerciseCatalogRepository {
  if (mode === "legacy") {
    return new PostgresUlcExerciseCatalogRepository(client);
  }
  if (mode === "quiesced") {
    return new QuiescedUlcExerciseCatalogRepository(
      new PostgresUlcExerciseCatalogRepository(client),
    );
  }
  return new StandardUlcExerciseCatalogRepository(client);
}

export class QuiescedUlcExerciseCatalogRepository
  implements UlcExerciseCatalogRepository
{
  readonly #delegate: UlcExerciseCatalogRepository;

  constructor(delegate: UlcExerciseCatalogRepository) {
    this.#delegate = delegate;
  }

  list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly UlcExerciseCatalogRecord[]> {
    return this.#delegate.list(organizationId, identityId);
  }

  read(
    organizationId: string,
    identityId: string,
    exerciseId: string,
  ): Promise<UlcExerciseCatalogRecord | null> {
    return this.#delegate.read(organizationId, identityId, exerciseId);
  }

  create(): Promise<void> {
    return rejectQuiesced();
  }

  update(): Promise<void> {
    return rejectQuiesced();
  }

  deactivate(): Promise<void> {
    return rejectQuiesced();
  }

  setFavorite(): Promise<void> {
    return rejectQuiesced();
  }
}

export class StandardUlcExerciseCatalogRepository
  implements UlcExerciseCatalogRepository
{
  readonly #repository: PostgresExerciseCatalogRepository;

  constructor(client: ExerciseCatalogPostgresClient) {
    this.#repository = new PostgresExerciseCatalogRepository(client);
  }

  async list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly UlcExerciseCatalogRecord[]> {
    const snapshot = await this.#repository.listItemsWithFavorites(
      organizationId,
      identityId,
    );
    const favorites = new Set(snapshot.favoriteExerciseIds);
    return Object.freeze(
      snapshot.items.map((item) =>
        toUlcRecord(item, favorites.has(item.id)),
      ),
    );
  }

  async read(
    organizationId: string,
    identityId: string,
    exerciseId: string,
  ): Promise<UlcExerciseCatalogRecord | null> {
    const rows = await this.list(organizationId, identityId);
    return rows.find((item) => item.id === exerciseId) ?? null;
  }

  async create(item: UlcExerciseCatalogItem): Promise<void> {
    try {
      await this.#repository.createItem(toStandardItem(item));
    } catch (error) {
      translateConflict(error);
    }
  }

  async update(item: UlcExerciseCatalogItem): Promise<void> {
    try {
      const updated = await this.#repository.updateItemFromCurrent(
        item.organizationId,
        item.id,
        () => toStandardItem(item),
      );
      if (updated === undefined) throw new UlcExerciseCatalogNotFoundError();
    } catch (error) {
      if (error instanceof UlcExerciseCatalogNotFoundError) throw error;
      translateConflict(error);
    }
  }

  async deactivate(
    organizationId: string,
    exerciseId: string,
  ): Promise<void> {
    const updated = await this.#repository.updateItemFromCurrent(
      organizationId,
      exerciseId,
      (current) => {
        if (!current.isActive) throw new UlcExerciseCatalogNotFoundError();
        return Object.freeze({ ...current, isActive: false });
      },
    );
    if (updated === undefined) throw new UlcExerciseCatalogNotFoundError();
  }

  async setFavorite(
    organizationId: string,
    identityId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<void> {
    const item = await this.#repository.findItemById(
      organizationId,
      exerciseId,
    );
    if (item === undefined) throw new UlcExerciseCatalogNotFoundError();
    await this.#repository.setFavorite(
      organizationId,
      identityId,
      exerciseId,
      favorite,
    );
  }
}

function toStandardItem(item: UlcExerciseCatalogItem): ExerciseCatalogItem {
  return Object.freeze({
    id: item.id,
    organizationId: item.organizationId,
    name: item.name,
    categoryKey: item.categoryKey,
    subcategory: item.subcategory,
    goal: item.goal,
    description: item.description,
    coachingCues: item.coachingCues,
    commonMistakes: item.commonMistakes,
    equipment: item.equipment,
    videoUrl: item.videoUrl,
    audienceIds: item.groupIds,
    parameters: item.parameters,
    isActive: item.isActive,
  });
}

function toUlcRecord(
  item: ExerciseCatalogItem,
  isFavorite: boolean,
): UlcExerciseCatalogRecord {
  const normalized = createUlcExerciseCatalogItem(
    {
      name: item.name,
      categoryKey: item.categoryKey as UlcExerciseCatalogItem["categoryKey"],
      subcategory: item.subcategory,
      goal: item.goal,
      description: item.description,
      coachingCues: item.coachingCues,
      commonMistakes: item.commonMistakes,
      equipment: item.equipment,
      videoUrl: item.videoUrl,
      groupIds: item.audienceIds,
      parameters: item.parameters.map((parameter) => ({
        key: parameter.key as UlcExerciseCatalogItem["parameters"][number]["key"],
        label: parameter.label,
        unit: parameter.unit,
        inputType: parameter.inputType,
        defaultValue: parameter.defaultValue,
        minValue: parameter.minValue,
        maxValue: parameter.maxValue,
        stepValue: parameter.stepValue,
        isRequired: parameter.isRequired,
        sortOrder: parameter.sortOrder,
      })),
      isActive: item.isActive,
    },
    {
      id: item.id,
      organizationId: item.organizationId,
    },
  );
  return Object.freeze({ ...normalized, isFavorite });
}

function translateConflict(error: unknown): never {
  if (isPostgresUniqueViolation(error)) {
    throw new UlcExerciseCatalogConflictError();
  }
  throw error;
}

function isPostgresUniqueViolation(
  error: unknown,
): error is { readonly code: "23505" } {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505"
  );
}

function rejectQuiesced(): Promise<never> {
  return Promise.reject(new UlcExerciseCatalogQuiescedError());
}

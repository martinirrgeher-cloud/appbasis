import {
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogItem,
  type ExerciseCatalogRepository,
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
  type UlcExerciseCatalogSqlClient,
} from "./exercise-catalog-postgres";
import type { UlcExerciseCatalogRepository } from "./exercise-catalog-service";

export type UlcExerciseCatalogRuntimeMode =
  | "legacy"
  | "legacy-read-writes-blocked"
  | "standard-module";

export class UlcExerciseCatalogWriteQuiescedError extends Error {
  readonly code = "EXERCISE_CATALOG_WRITE_QUIESCED";

  constructor() {
    super("Exercise catalog source writes are quiesced for runtime cutover.");
    this.name = "UlcExerciseCatalogWriteQuiescedError";
  }
}

export function createUlcExerciseCatalogRuntimeRepository({
  mode,
  sql,
}: {
  readonly mode: UlcExerciseCatalogRuntimeMode;
  readonly sql: UlcExerciseCatalogSqlClient & ExerciseCatalogPostgresClient;
}): UlcExerciseCatalogRepository {
  if (mode === "legacy") {
    return new PostgresUlcExerciseCatalogRepository(sql);
  }
  if (mode === "legacy-read-writes-blocked") {
    return new QuiescedUlcExerciseCatalogRepository(
      new PostgresUlcExerciseCatalogRepository(sql),
    );
  }
  if (mode === "standard-module") {
    return new StandardModuleUlcExerciseCatalogRepository(
      new PostgresExerciseCatalogRepository(sql),
    );
  }
  return unsupportedMode(mode);
}

export class QuiescedUlcExerciseCatalogRepository
  implements UlcExerciseCatalogRepository
{
  readonly #legacy: UlcExerciseCatalogRepository;

  constructor(legacy: UlcExerciseCatalogRepository) {
    this.#legacy = legacy;
  }

  list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly UlcExerciseCatalogRecord[]> {
    return this.#legacy.list(organizationId, identityId);
  }

  read(
    organizationId: string,
    identityId: string,
    exerciseId: string,
  ): Promise<UlcExerciseCatalogRecord | null> {
    return this.#legacy.read(organizationId, identityId, exerciseId);
  }

  create(_item: UlcExerciseCatalogItem): Promise<void> {
    return quiesced();
  }

  update(_item: UlcExerciseCatalogItem): Promise<void> {
    return quiesced();
  }

  deactivate(
    _organizationId: string,
    _exerciseId: string,
  ): Promise<void> {
    return quiesced();
  }

  setFavorite(
    _organizationId: string,
    _identityId: string,
    _exerciseId: string,
    _favorite: boolean,
  ): Promise<void> {
    return quiesced();
  }
}

export class StandardModuleUlcExerciseCatalogRepository
  implements UlcExerciseCatalogRepository
{
  readonly #standard: ExerciseCatalogRepository;

  constructor(standard: ExerciseCatalogRepository) {
    this.#standard = standard;
  }

  async list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly UlcExerciseCatalogRecord[]> {
    const snapshot = await this.#standard.listItemsWithFavorites(
      organizationId,
      identityId,
    );
    const favorites = new Set(snapshot.favoriteExerciseIds);
    return Object.freeze(
      snapshot.items.map((item) =>
        standardItemToUlcRecord(item, favorites.has(item.id)),
      ),
    );
  }

  async read(
    organizationId: string,
    identityId: string,
    exerciseId: string,
  ): Promise<UlcExerciseCatalogRecord | null> {
    const snapshot = await this.#standard.listItemsWithFavorites(
      organizationId,
      identityId,
    );
    const item = snapshot.items.find((candidate) => candidate.id === exerciseId);
    if (item === undefined) return null;
    return standardItemToUlcRecord(
      item,
      snapshot.favoriteExerciseIds.includes(exerciseId),
    );
  }

  async create(item: UlcExerciseCatalogItem): Promise<void> {
    try {
      await this.#standard.createItem(ulcItemToStandardItem(item));
    } catch (error) {
      throwTranslatedConflict(error);
    }
  }

  async update(item: UlcExerciseCatalogItem): Promise<void> {
    try {
      const updated = await this.#standard.updateItemFromCurrent(
        item.organizationId,
        item.id,
        (current) => {
          if (current.isActive !== true) {
            throw new UlcExerciseCatalogNotFoundError();
          }
          return ulcItemToStandardItem(item);
        },
      );
      if (updated === undefined) throw new UlcExerciseCatalogNotFoundError();
    } catch (error) {
      throwTranslatedConflict(error);
    }
  }

  async deactivate(
    organizationId: string,
    exerciseId: string,
  ): Promise<void> {
    const updated = await this.#standard.updateItemFromCurrent(
      organizationId,
      exerciseId,
      (current) => {
        if (current.isActive !== true) {
          throw new UlcExerciseCatalogNotFoundError();
        }
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
    const item = await this.#standard.findItemById(
      organizationId,
      exerciseId,
    );
    if (item === undefined) throw new UlcExerciseCatalogNotFoundError();
    await this.#standard.setFavorite(
      organizationId,
      identityId,
      exerciseId,
      favorite,
    );
  }
}

function ulcItemToStandardItem(
  item: UlcExerciseCatalogItem,
): ExerciseCatalogItem {
  return Object.freeze({
    id: item.id,
    organizationId: item.organizationId,
    name: item.name,
    categoryKey: item.categoryKey,
    subcategory: item.subcategory,
    difficultyKey: item.difficultyKey,
    goal: item.goal,
    description: item.description,
    coachingCues: item.coachingCues,
    commonMistakes: item.commonMistakes,
    equipment: Object.freeze([...item.equipment]),
    videoUrl: item.videoUrl,
    videoUrls: Object.freeze([...item.videoUrls]),
    audienceIds: Object.freeze([...item.groupIds]),
    similarExerciseIds: Object.freeze([...item.similarExerciseIds]),
    parameters: Object.freeze(
      item.parameters.map((parameter) =>
        Object.freeze({ ...parameter }),
      ),
    ),
    isActive: item.isActive,
  });
}

function standardItemToUlcRecord(
  item: ExerciseCatalogItem,
  isFavorite: boolean,
): UlcExerciseCatalogRecord {
  const normalized = createUlcExerciseCatalogItem(
    {
      name: item.name,
      categoryKey: item.categoryKey as UlcExerciseCatalogItem["categoryKey"],
      subcategory: item.subcategory,
      difficultyKey:
        item.difficultyKey as UlcExerciseCatalogItem["difficultyKey"],
      goal: item.goal,
      description: item.description,
      coachingCues: item.coachingCues,
      commonMistakes: item.commonMistakes,
      equipment: item.equipment,
      videoUrl: item.videoUrl,
      videoUrls: item.videoUrls,
      groupIds: item.audienceIds,
      similarExerciseIds: item.similarExerciseIds,
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

function throwTranslatedConflict(error: unknown): never {
  if (error instanceof UlcExerciseCatalogNotFoundError) throw error;
  if (postgresErrorCode(error) === "23505") {
    throw new UlcExerciseCatalogConflictError();
  }
  throw error;
}

function postgresErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return null;
    }
    const code = (current as { readonly code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { readonly cause?: unknown }).cause;
  }
  return null;
}

function quiesced(): Promise<never> {
  return Promise.reject(new UlcExerciseCatalogWriteQuiescedError());
}

function unsupportedMode(value: never): never {
  throw new Error(
    "Unsupported ULC exercise catalog runtime mode: " + String(value),
  );
}

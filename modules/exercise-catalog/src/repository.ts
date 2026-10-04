import type { ExerciseCatalogItem } from "./domain/catalog";

export interface ExerciseCatalogListSnapshot {
  readonly items: readonly ExerciseCatalogItem[];
  readonly favoriteExerciseIds: readonly string[];
}

export interface ExerciseCatalogRepository {
  listItems(organizationId: string): Promise<readonly ExerciseCatalogItem[]>;
  listItemsWithFavorites(
    organizationId: string,
    principalId: string,
  ): Promise<ExerciseCatalogListSnapshot>;
  findItemById(
    organizationId: string,
    exerciseId: string,
  ): Promise<ExerciseCatalogItem | undefined>;
  createItem(item: ExerciseCatalogItem): Promise<ExerciseCatalogItem>;
  updateItemFromCurrent(
    organizationId: string,
    exerciseId: string,
    update: (current: ExerciseCatalogItem) => ExerciseCatalogItem,
  ): Promise<ExerciseCatalogItem | undefined>;
  listFavoriteExerciseIds(
    organizationId: string,
    principalId: string,
  ): Promise<readonly string[]>;
  setFavorite(
    organizationId: string,
    principalId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<void>;
}

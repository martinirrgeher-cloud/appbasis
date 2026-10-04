import type { ExerciseCatalogItem } from "./domain/catalog";

export interface ExerciseCatalogRepository {
  listItems(organizationId: string): Promise<readonly ExerciseCatalogItem[]>;
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

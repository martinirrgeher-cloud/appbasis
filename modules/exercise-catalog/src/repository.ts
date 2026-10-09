import type {
  ExerciseCatalogItem,
  ExerciseCatalogPrivateMedia,
  ExerciseCatalogUsageEvent,
  ExerciseCatalogUsageSummary,
} from "./domain/catalog";

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
  listUsageSummaries(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogUsageSummary[]>;
  listUsageEvents(
    organizationId: string,
    exerciseId: string,
    limit?: number,
  ): Promise<readonly ExerciseCatalogUsageEvent[]>;
  recordUsage(event: ExerciseCatalogUsageEvent): Promise<void>;
  listPrivateMedia(
    organizationId: string,
    exerciseId: string,
  ): Promise<readonly ExerciseCatalogPrivateMedia[]>;
  registerPrivateMedia(media: ExerciseCatalogPrivateMedia): Promise<void>;
  requestPrivateMediaDeletion(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<ExerciseCatalogPrivateMedia | undefined>;
  completePrivateMediaDeletion(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<boolean>;
}

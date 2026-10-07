import type {
  ExerciseCatalogItem,
  ExerciseCatalogPrivateMedia,
  ExerciseCatalogUsageEvent,
  ExerciseCatalogUsageSummary,
} from "./domain/catalog";
import type { ExerciseCatalogRepository } from "./repository";

export class InMemoryExerciseCatalogRepository
  implements ExerciseCatalogRepository
{
  readonly #items = new Map<string, ExerciseCatalogItem>();
  readonly #favorites = new Set<string>();
  readonly #usage = new Map<string, ExerciseCatalogUsageEvent>();
  readonly #privateMedia = new Map<string, ExerciseCatalogPrivateMedia>();

  constructor(initialItems: readonly ExerciseCatalogItem[] = []) {
    for (const item of initialItems) {
      const stored = cloneItem(item);
      const key = itemKey(stored.organizationId, stored.id);
      if (this.#items.has(key)) {
        throw new Error("Exercise catalog contains a duplicate item id.");
      }
      this.#assertUniqueName(stored);
      this.#items.set(key, stored);
    }
  }

  async listItems(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogItem[]> {
    return listItemsSnapshot(this.#items, organizationId);
  }

  async listItemsWithFavorites(
    organizationId: string,
    principalId: string,
  ) {
    return Object.freeze({
      items: listItemsSnapshot(this.#items, organizationId),
      favoriteExerciseIds: favoriteIdsSnapshot(
        this.#items,
        this.#favorites,
        organizationId,
        principalId,
      ),
    });
  }

  async findItemById(
    organizationId: string,
    exerciseId: string,
  ): Promise<ExerciseCatalogItem | undefined> {
    const item = this.#items.get(itemKey(organizationId, exerciseId));
    return item === undefined ? undefined : cloneItem(item);
  }

  async createItem(item: ExerciseCatalogItem): Promise<ExerciseCatalogItem> {
    const stored = cloneItem(item);
    const key = itemKey(stored.organizationId, stored.id);
    if (this.#items.has(key)) {
      throw new Error("Exercise catalog item already exists.");
    }
    this.#assertUniqueName(stored);
    this.#assertSimilarTargets(stored);
    this.#items.set(key, stored);
    return cloneItem(stored);
  }

  async updateItemFromCurrent(
    organizationId: string,
    exerciseId: string,
    update: (current: ExerciseCatalogItem) => ExerciseCatalogItem,
  ): Promise<ExerciseCatalogItem | undefined> {
    const key = itemKey(organizationId, exerciseId);
    const current = this.#items.get(key);
    if (current === undefined) return undefined;

    const stored = cloneItem(update(cloneItem(current)));
    if (
      stored.organizationId !== organizationId ||
      stored.id !== exerciseId
    ) {
      throw new Error(
        "Exercise catalog update changed its organization or item id.",
      );
    }
    this.#assertUniqueName(stored, stored.id);
    this.#assertSimilarTargets(stored);
    this.#items.set(key, stored);
    this.#synchronizeReverseSimilarity(stored, current.similarExerciseIds);
    return cloneItem(stored);
  }

  async listFavoriteExerciseIds(
    organizationId: string,
    principalId: string,
  ): Promise<readonly string[]> {
    return favoriteIdsSnapshot(
      this.#items,
      this.#favorites,
      organizationId,
      principalId,
    );
  }

  async setFavorite(
    organizationId: string,
    principalId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<void> {
    const key = favoriteKey(organizationId, principalId, exerciseId);
    if (favorite) {
      if (this.#items.has(itemKey(organizationId, exerciseId))) {
        this.#favorites.add(key);
      }
      return;
    }
    this.#favorites.delete(key);
  }

  async listUsageSummaries(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogUsageSummary[]> {
    const grouped = new Map<string, ExerciseCatalogUsageEvent[]>();
    for (const event of this.#usage.values()) {
      if (event.organizationId !== organizationId) continue;
      const entries = grouped.get(event.exerciseId) ?? [];
      entries.push(event);
      grouped.set(event.exerciseId, entries);
    }
    return Object.freeze(
      [...grouped.entries()]
        .map(([exerciseId, events]) => {
          const ordered = [...events].sort(
            (left, right) =>
              right.occurredAt.localeCompare(left.occurredAt) ||
              right.id.localeCompare(left.id),
          );
          return Object.freeze({
            exerciseId,
            usageCount: events.length,
            lastUsedAt: ordered[0]?.occurredAt ?? null,
          });
        })
        .sort((left, right) => left.exerciseId.localeCompare(right.exerciseId)),
    );
  }

  async listUsageEvents(
    organizationId: string,
    exerciseId: string,
    limit = 50,
  ): Promise<readonly ExerciseCatalogUsageEvent[]> {
    return Object.freeze(
      [...this.#usage.values()]
        .filter(
          (event) =>
            event.organizationId === organizationId &&
            event.exerciseId === exerciseId,
        )
        .sort(
          (left, right) =>
            right.occurredAt.localeCompare(left.occurredAt) ||
            right.id.localeCompare(left.id),
        )
        .slice(0, limit)
        .map((event) => Object.freeze({ ...event })),
    );
  }

  async recordUsage(event: ExerciseCatalogUsageEvent): Promise<void> {
    if (!this.#items.has(itemKey(event.organizationId, event.exerciseId))) {
      throw new Error("Exercise catalog usage references an unknown item.");
    }
    const key = eventKey(event.organizationId, event.id);
    if (this.#usage.has(key)) {
      throw new Error("Exercise catalog usage event already exists.");
    }
    this.#usage.set(key, Object.freeze({ ...event }));
  }

  async listPrivateMedia(
    organizationId: string,
    exerciseId: string,
  ): Promise<readonly ExerciseCatalogPrivateMedia[]> {
    return Object.freeze(
      [...this.#privateMedia.values()]
        .filter(
          (media) =>
            media.organizationId === organizationId &&
            media.exerciseId === exerciseId,
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )
        .map((media) => Object.freeze({ ...media })),
    );
  }

  async registerPrivateMedia(
    media: ExerciseCatalogPrivateMedia,
  ): Promise<void> {
    if (!this.#items.has(itemKey(media.organizationId, media.exerciseId))) {
      throw new Error("Exercise catalog private media references an unknown item.");
    }
    const key = mediaKey(media.organizationId, media.id);
    if (this.#privateMedia.has(key)) {
      throw new Error("Exercise catalog private media already exists.");
    }
    this.#privateMedia.set(key, Object.freeze({ ...media }));
  }

  async deletePrivateMedia(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<ExerciseCatalogPrivateMedia | undefined> {
    const key = mediaKey(organizationId, mediaId);
    const media = this.#privateMedia.get(key);
    if (media === undefined || media.exerciseId !== exerciseId) return undefined;
    this.#privateMedia.delete(key);
    return Object.freeze({ ...media });
  }

  #assertUniqueName(item: ExerciseCatalogItem, exceptId?: string): void {
    const folded = item.name.toLocaleLowerCase("de");
    const duplicate = [...this.#items.values()].some(
      (candidate) =>
        candidate.organizationId === item.organizationId &&
        candidate.id !== exceptId &&
        candidate.name.toLocaleLowerCase("de") === folded,
    );
    if (duplicate) {
      throw new Error("Exercise catalog item name already exists.");
    }
  }

  #assertSimilarTargets(item: ExerciseCatalogItem): void {
    for (const similarId of item.similarExerciseIds) {
      const target = this.#items.get(itemKey(item.organizationId, similarId));
      if (target === undefined) {
        throw new Error("Exercise catalog similarity references an unknown item.");
      }
    }
  }

  #synchronizeReverseSimilarity(
    item: ExerciseCatalogItem,
    previousIds: readonly string[],
  ): void {
    const next = new Set(item.similarExerciseIds);
    for (const previousId of previousIds) {
      if (next.has(previousId)) continue;
      const targetKey = itemKey(item.organizationId, previousId);
      const target = this.#items.get(targetKey);
      if (target === undefined) continue;
      this.#items.set(
        targetKey,
        cloneItem({
          ...target,
          similarExerciseIds: target.similarExerciseIds.filter(
            (candidate) => candidate !== item.id,
          ),
        }),
      );
    }
    for (const similarId of next) {
      const targetKey = itemKey(item.organizationId, similarId);
      const target = this.#items.get(targetKey);
      if (target === undefined || target.similarExerciseIds.includes(item.id)) {
        continue;
      }
      this.#items.set(
        targetKey,
        cloneItem({
          ...target,
          similarExerciseIds: [...target.similarExerciseIds, item.id].sort(),
        }),
      );
    }
  }
}

function listItemsSnapshot(
  items: ReadonlyMap<string, ExerciseCatalogItem>,
  organizationId: string,
): readonly ExerciseCatalogItem[] {
  return Object.freeze(
    [...items.values()]
      .filter((item) => item.organizationId === organizationId)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, "de", { sensitivity: "base" }) ||
          left.id.localeCompare(right.id),
      )
      .map(cloneItem),
  );
}

function favoriteIdsSnapshot(
  items: ReadonlyMap<string, ExerciseCatalogItem>,
  favorites: ReadonlySet<string>,
  organizationId: string,
  principalId: string,
): readonly string[] {
  const prefix = favoritePrefix(organizationId, principalId);
  return Object.freeze(
    [...favorites]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length))
      .filter((exerciseId) =>
        items.has(itemKey(organizationId, exerciseId)),
      )
      .sort(),
  );
}

function itemKey(organizationId: string, exerciseId: string): string {
  return organizationId + "\u0000" + exerciseId;
}

function eventKey(organizationId: string, eventId: string): string {
  return organizationId + "\u0000" + eventId;
}

function mediaKey(organizationId: string, mediaId: string): string {
  return organizationId + "\u0000" + mediaId;
}

function favoritePrefix(organizationId: string, principalId: string): string {
  return organizationId + "\u0000" + principalId + "\u0000";
}

function favoriteKey(
  organizationId: string,
  principalId: string,
  exerciseId: string,
): string {
  return favoritePrefix(organizationId, principalId) + exerciseId;
}

function cloneItem(item: ExerciseCatalogItem): ExerciseCatalogItem {
  return Object.freeze({
    ...item,
    equipment: Object.freeze([...item.equipment]),
    videoUrls: Object.freeze([...item.videoUrls]),
    audienceIds: Object.freeze([...item.audienceIds]),
    similarExerciseIds: Object.freeze([...item.similarExerciseIds]),
    parameters: Object.freeze(
      item.parameters.map((parameter) => Object.freeze({ ...parameter })),
    ),
  });
}

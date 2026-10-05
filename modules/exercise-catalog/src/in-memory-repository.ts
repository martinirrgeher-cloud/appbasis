import type { ExerciseCatalogItem } from "./domain/catalog";
import type { ExerciseCatalogRepository } from "./repository";

export class InMemoryExerciseCatalogRepository
  implements ExerciseCatalogRepository
{
  readonly #items = new Map<string, ExerciseCatalogItem>();
  readonly #favorites = new Set<string>();

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
    this.#items.set(key, stored);
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
    audienceIds: Object.freeze([...item.audienceIds]),
    parameters: Object.freeze(
      item.parameters.map((parameter) => Object.freeze({ ...parameter })),
    ),
  });
}

import { describe, expect, it } from "vitest";

import type {
  ExerciseCatalogItem,
  ExerciseCatalogRepository,
} from "@appbasis/exercise-catalog";

import { createUlcExerciseCatalogItem } from "../worker/exercise-catalog-domain";
import type {
  UlcExerciseCatalogRecord,
} from "../worker/exercise-catalog-postgres";
import {
  QuiescedUlcExerciseCatalogRepository,
  StandardModuleUlcExerciseCatalogRepository,
  UlcExerciseCatalogWriteQuiescedError,
} from "../worker/exercise-catalog-runtime";
import type {
  UlcExerciseCatalogRepository,
} from "../worker/exercise-catalog-service";

const STANDARD_ITEM: ExerciseCatalogItem = Object.freeze({
  id: "exercise-1",
  organizationId: "org-1",
  name: "Flying 30",
  categoryKey: "max_velocity",
  subcategory: null,
  difficultyKey: null,
  goal: "Speed",
  description: null,
  coachingCues: null,
  commonMistakes: null,
  equipment: Object.freeze(["cones"]),
  videoUrl: null,
  videoUrls: Object.freeze([]),
  audienceIds: Object.freeze(["group-1"]),
  similarExerciseIds: Object.freeze([]),
  parameters: Object.freeze([
    Object.freeze({
      key: "distance_m",
      label: "Distance",
      unit: "m",
      inputType: "number" as const,
      defaultValue: "30",
      minValue: 10,
      maxValue: 60,
      stepValue: 5,
      isRequired: true,
      sortOrder: 10,
    }),
  ]),
  isActive: true,
});

describe("ULC exercise catalog cutover runtime repositories", () => {
  it("keeps legacy reads available while every repository write is quiesced", async () => {
    let writes = 0;
    const item = ulcRecord();
    const legacy: UlcExerciseCatalogRepository = {
      async list() {
        return [item];
      },
      async read() {
        return item;
      },
      async create() {
        writes += 1;
      },
      async update() {
        writes += 1;
      },
      async deactivate() {
        writes += 1;
      },
      async setFavorite() {
        writes += 1;
      },
      async findDuplicateCandidates() {
        return [];
      },
      async listUsageSummaries() {
        return [];
      },
      async listUsage() {
        return [];
      },
      async recordUsage() {
        writes += 1;
        throw new Error("unexpected legacy usage write");
      },
      async listPrivateMedia() {
        return [];
      },
      async registerPrivateMedia() {
        writes += 1;
        throw new Error("unexpected legacy media write");
      },
      async requestPrivateMediaDeletion() {
        writes += 1;
        throw new Error("unexpected legacy media write");
      },
      async completePrivateMediaDeletion() {
        writes += 1;
        throw new Error("unexpected legacy media write");
      },
    };
    const repository = new QuiescedUlcExerciseCatalogRepository(legacy);

    await expect(repository.list("org-1", "identity-1")).resolves.toEqual([
      item,
    ]);
    await expect(
      repository.read("org-1", "identity-1", "exercise-1"),
    ).resolves.toEqual(item);

    await expect(repository.create(item)).rejects.toBeInstanceOf(
      UlcExerciseCatalogWriteQuiescedError,
    );
    await expect(repository.update(item)).rejects.toBeInstanceOf(
      UlcExerciseCatalogWriteQuiescedError,
    );
    await expect(
      repository.deactivate("org-1", "exercise-1"),
    ).rejects.toBeInstanceOf(UlcExerciseCatalogWriteQuiescedError);
    await expect(
      repository.setFavorite("org-1", "identity-1", "exercise-1", true),
    ).rejects.toBeInstanceOf(UlcExerciseCatalogWriteQuiescedError);
    expect(writes).toBe(0);
  });

  it("maps ULC group and favorite semantics onto the standard module repository", async () => {
    const calls: {
      created?: ExerciseCatalogItem;
      updated?: ExerciseCatalogItem;
      favorite?: readonly unknown[];
    } = {};
    let current = STANDARD_ITEM;

    const standard: ExerciseCatalogRepository = {
      async listItems() {
        return [current];
      },
      async listItemsWithFavorites(organizationId, principalId) {
        expect(organizationId).toBe("org-1");
        expect(principalId).toBe("identity-1");
        return Object.freeze({
          items: Object.freeze([current]),
          favoriteExerciseIds: Object.freeze(["exercise-1"]),
        });
      },
      async findItemById() {
        return current;
      },
      async createItem(item) {
        calls.created = item;
        current = item;
        return item;
      },
      async updateItemFromCurrent(_organizationId, _exerciseId, update) {
        current = update(current);
        calls.updated = current;
        return current;
      },
      async listFavoriteExerciseIds() {
        return Object.freeze(["exercise-1"]);
      },
      async setFavorite(...args) {
        calls.favorite = args;
      },
      async listUsageSummaries() {
        return [];
      },
      async listUsageEvents() {
        return [];
      },
      async recordUsage() {},
      async listPrivateMedia() {
        return [];
      },
      async registerPrivateMedia() {},
      async requestPrivateMediaDeletion() {
        return undefined;
      },
      async completePrivateMediaDeletion() {
        return false;
      },
    };

    const repository = new StandardModuleUlcExerciseCatalogRepository(standard);
    const listed = await repository.list("org-1", "identity-1");
    expect(listed[0]).toMatchObject({
      id: "exercise-1",
      organizationId: "org-1",
      groupIds: ["group-1"],
      isFavorite: true,
    });

    const created = ulcRecord({ id: "exercise-2", isFavorite: false });
    await repository.create(created);
    expect(calls.created).toMatchObject({
      id: "exercise-2",
      audienceIds: ["group-1"],
    });
    expect("groupIds" in (calls.created as unknown as Record<string, unknown>)).toBe(
      false,
    );

    current = STANDARD_ITEM;
    await repository.update(ulcRecord({ name: "Flying 30 updated" }));
    expect(calls.updated).toMatchObject({
      name: "Flying 30 updated",
      audienceIds: ["group-1"],
    });

    current = STANDARD_ITEM;
    await repository.deactivate("org-1", "exercise-1");
    expect(calls.updated?.isActive).toBe(false);

    current = STANDARD_ITEM;
    await repository.setFavorite(
      "org-1",
      "identity-1",
      "exercise-1",
      false,
    );
    expect(calls.favorite).toEqual([
      "org-1",
      "identity-1",
      "exercise-1",
      false,
    ]);
  });
});

function ulcRecord(
  overrides: Partial<UlcExerciseCatalogRecord> = {},
): UlcExerciseCatalogRecord {
  const item = createUlcExerciseCatalogItem(
    {
      name: overrides.name ?? "Flying 30",
      categoryKey: "max_velocity",
      goal: "Speed",
      equipment: ["cones"],
      groupIds: ["group-1"],
      parameters: [
        {
          key: "distance_m",
          label: "Distance",
          unit: "m",
          inputType: "number",
          defaultValue: "30",
          minValue: 10,
          maxValue: 60,
          stepValue: 5,
          isRequired: true,
          sortOrder: 10,
        },
      ],
      isActive: overrides.isActive ?? true,
    },
    {
      id: overrides.id ?? "exercise-1",
      organizationId: overrides.organizationId ?? "org-1",
    },
  );
  return Object.freeze({
    ...item,
    isFavorite: overrides.isFavorite ?? true,
  });
}

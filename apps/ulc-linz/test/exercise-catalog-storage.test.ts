import { describe, expect, it } from "vitest";

import {
  QuiescedUlcExerciseCatalogRepository,
  UlcExerciseCatalogQuiescedError,
  resolveUlcExerciseCatalogStorageMode,
} from "../worker/exercise-catalog-storage";
import type { UlcExerciseCatalogRepository } from "../worker/exercise-catalog-service";

describe("ULC exercise catalog storage cutover modes", () => {
  it("defaults to legacy and accepts only the reviewed modes", () => {
    expect(resolveUlcExerciseCatalogStorageMode(undefined)).toBe("legacy");
    expect(resolveUlcExerciseCatalogStorageMode("legacy")).toBe("legacy");
    expect(resolveUlcExerciseCatalogStorageMode("quiesced")).toBe("quiesced");
    expect(resolveUlcExerciseCatalogStorageMode("standard")).toBe("standard");
    expect(resolveUlcExerciseCatalogStorageMode("")).toBeNull();
    expect(resolveUlcExerciseCatalogStorageMode("target")).toBeNull();
    expect(resolveUlcExerciseCatalogStorageMode(1)).toBeNull();
  });

  it("keeps legacy reads available while blocking every mutation in quiesced mode", async () => {
    let listCalls = 0;
    let readCalls = 0;
    let mutationCalls = 0;
    const delegate: UlcExerciseCatalogRepository = {
      async list() {
        listCalls += 1;
        return [];
      },
      async read() {
        readCalls += 1;
        return null;
      },
      async create() {
        mutationCalls += 1;
      },
      async update() {
        mutationCalls += 1;
      },
      async deactivate() {
        mutationCalls += 1;
      },
      async setFavorite() {
        mutationCalls += 1;
      },
    };
    const repository = new QuiescedUlcExerciseCatalogRepository(delegate);

    await expect(repository.list("org-1", "identity-1")).resolves.toEqual([]);
    await expect(
      repository.read("org-1", "identity-1", "exercise-1"),
    ).resolves.toBeNull();

    for (const mutation of [
      () => repository.create({} as never),
      () => repository.update({} as never),
      () => repository.deactivate("org-1", "exercise-1"),
      () =>
        repository.setFavorite(
          "org-1",
          "identity-1",
          "exercise-1",
          true,
        ),
    ]) {
      await expect(mutation()).rejects.toBeInstanceOf(
        UlcExerciseCatalogQuiescedError,
      );
    }

    expect(listCalls).toBe(1);
    expect(readCalls).toBe(1);
    expect(mutationCalls).toBe(0);
  });
});

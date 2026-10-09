import { describe, expect, it } from "vitest";

import {
  deleteUlcExerciseCatalogPrivateMedia,
  privateExerciseVideoStorageKey,
  type UlcExerciseCatalogObjectStore,
  type UlcExerciseCatalogPrivateMediaDeletionCatalog,
} from "../worker/exercise-catalog-private-media";

const ORGANIZATION_ID = "verein-1";
const EXERCISE_ID = "exercise-1";
const MEDIA_ID = "media-1";
const STORAGE_KEY = privateExerciseVideoStorageKey(
  ORGANIZATION_ID,
  EXERCISE_ID,
  MEDIA_ID,
);

function unusedStoreMethods() {
  return {
    put() {
      throw new Error("put must not be called");
    },
    get() {
      throw new Error("get must not be called");
    },
  };
}

describe("private exercise media deletion", () => {
  it("removes metadata before deleting the object", async () => {
    const order: string[] = [];
    const catalog: UlcExerciseCatalogPrivateMediaDeletionCatalog = {
      async listPrivateMedia() {
        order.push("list");
        return [{ id: MEDIA_ID, storageKey: STORAGE_KEY }];
      },
      async deletePrivateMedia() {
        order.push("metadata-delete");
        return { id: MEDIA_ID };
      },
    };
    const store: UlcExerciseCatalogObjectStore = {
      ...unusedStoreMethods(),
      async delete(key) {
        expect(key).toBe(STORAGE_KEY);
        order.push("object-delete");
      },
    };

    const result = await deleteUlcExerciseCatalogPrivateMedia({
      store,
      catalog,
      organizationId: ORGANIZATION_ID,
      exerciseId: EXERCISE_ID,
      mediaId: MEDIA_ID,
    });

    expect(result).toEqual({ deleted: true, alreadyDeleted: false });
    expect(order).toEqual(["list", "metadata-delete", "object-delete"]);
  });

  it("does not delete the object when metadata deletion fails", async () => {
    let objectDeleteCalls = 0;
    const catalog: UlcExerciseCatalogPrivateMediaDeletionCatalog = {
      async listPrivateMedia() {
        return [{ id: MEDIA_ID, storageKey: STORAGE_KEY }];
      },
      async deletePrivateMedia() {
        throw new Error("database unavailable");
      },
    };
    const store: UlcExerciseCatalogObjectStore = {
      ...unusedStoreMethods(),
      async delete() {
        objectDeleteCalls += 1;
      },
    };

    await expect(
      deleteUlcExerciseCatalogPrivateMedia({
        store,
        catalog,
        organizationId: ORGANIZATION_ID,
        exerciseId: EXERCISE_ID,
        mediaId: MEDIA_ID,
      }),
    ).rejects.toThrow("database unavailable");
    expect(objectDeleteCalls).toBe(0);
  });

  it("cleans an orphaned object on an idempotent retry", async () => {
    let metadataPresent = true;
    let objectDeleteCalls = 0;
    const catalog: UlcExerciseCatalogPrivateMediaDeletionCatalog = {
      async listPrivateMedia() {
        return metadataPresent
          ? [{ id: MEDIA_ID, storageKey: STORAGE_KEY }]
          : [];
      },
      async deletePrivateMedia() {
        metadataPresent = false;
        return { id: MEDIA_ID };
      },
    };
    const store: UlcExerciseCatalogObjectStore = {
      ...unusedStoreMethods(),
      async delete(key) {
        expect(key).toBe(STORAGE_KEY);
        objectDeleteCalls += 1;
        if (objectDeleteCalls === 1) {
          throw new Error("temporary R2 failure");
        }
      },
    };

    await expect(
      deleteUlcExerciseCatalogPrivateMedia({
        store,
        catalog,
        organizationId: ORGANIZATION_ID,
        exerciseId: EXERCISE_ID,
        mediaId: MEDIA_ID,
      }),
    ).rejects.toThrow("temporary R2 failure");
    expect(metadataPresent).toBe(false);

    const retry = await deleteUlcExerciseCatalogPrivateMedia({
      store,
      catalog,
      organizationId: ORGANIZATION_ID,
      exerciseId: EXERCISE_ID,
      mediaId: MEDIA_ID,
    });

    expect(retry).toEqual({ deleted: true, alreadyDeleted: true });
    expect(objectDeleteCalls).toBe(2);
  });

  it("fails closed when persisted storage metadata does not match the deterministic key", async () => {
    let metadataDeleteCalls = 0;
    let objectDeleteCalls = 0;
    const catalog: UlcExerciseCatalogPrivateMediaDeletionCatalog = {
      async listPrivateMedia() {
        return [{ id: MEDIA_ID, storageKey: "unexpected/key" }];
      },
      async deletePrivateMedia() {
        metadataDeleteCalls += 1;
        return { id: MEDIA_ID };
      },
    };
    const store: UlcExerciseCatalogObjectStore = {
      ...unusedStoreMethods(),
      async delete() {
        objectDeleteCalls += 1;
      },
    };

    await expect(
      deleteUlcExerciseCatalogPrivateMedia({
        store,
        catalog,
        organizationId: ORGANIZATION_ID,
        exerciseId: EXERCISE_ID,
        mediaId: MEDIA_ID,
      }),
    ).rejects.toThrow("storage metadata is inconsistent");
    expect(metadataDeleteCalls).toBe(0);
    expect(objectDeleteCalls).toBe(0);
  });
});

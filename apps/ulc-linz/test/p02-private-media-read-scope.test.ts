import { describe, expect, it } from "vitest";

import {
  privateExerciseVideoStorageKey,
  readUlcPrivateExerciseMediaWithScope,
  type UlcExerciseCatalogObjectStore,
} from "../worker/exercise-catalog-private-media";

const ORG = "ulc-p02-org";
const EXERCISE = "long-jump";
const MEDIA = "clip-1";
const KEY = privateExerciseVideoStorageKey(ORG, EXERCISE, MEDIA);

const reference = Object.freeze({
  organizationId: ORG,
  exerciseId: EXERCISE,
  id: MEDIA,
  storageKey: KEY,
});

function fixture() {
  const reads: Array<{ key: string; range: string | null }> = [];
  const stored = { body: Uint8Array.of(1, 2, 3), size: 3 };
  const store: UlcExerciseCatalogObjectStore = {
    async get(key, options) {
      reads.push({ key, range: options?.range?.get("range") ?? null });
      return stored;
    },
    async put() { throw new Error("Private media read may not write to R2."); },
    async delete() { throw new Error("Private media read may not delete R2 objects."); },
  };
  async function read(media: unknown, input: {
    organizationId?: string; exerciseId?: string; mediaId?: string;
  } = {}) {
    return readUlcPrivateExerciseMediaWithScope({
      organizationId: input.organizationId ?? ORG,
      exerciseId: input.exerciseId ?? EXERCISE,
      mediaId: input.mediaId ?? MEDIA,
      media,
      store,
      range: new Headers({ range: "bytes=0-0" }),
    });
  }
  return { reads, stored, read };
}

describe("P02 private exercise video provider GET exact organization scope", () => {
  it("reads only the canonical tenant/exercise/media key and preserves range", async () => {
    const f = fixture();
    await expect(f.read(reference)).resolves.toBe(f.stored);
    expect(f.reads).toEqual([{ key: KEY, range: "bytes=0-0" }]);
  });

  it.each([
    ["foreign organization", { ...reference, organizationId: "foreign-club" }],
    ["foreign exercise", { ...reference, exerciseId: "other-exercise" }],
    ["different media", { ...reference, id: "other-clip" }],
    ["foreign object key", {
      ...reference, storageKey: privateExerciseVideoStorageKey("foreign-club", EXERCISE, MEDIA),
    }],
    ["wrong prefix", { ...reference, storageKey: "video/" + ORG + "/" + MEDIA }],
    ["nonexistent metadata", null],
    ["malformed metadata", { ...reference, storageKey: null }],
  ])("rejects %s before any provider GET", async (_label, media) => {
    const f = fixture();
    await expect(f.read(media)).resolves.toBeNull();
    expect(f.reads).toEqual([]);
  });

  it("does not read an otherwise valid row under a different authenticated request scope", async () => {
    const f = fixture();
    await expect(f.read(reference, { organizationId: "foreign-club" })).resolves.toBeNull();
    await expect(f.read(reference, { exerciseId: "foreign-exercise" })).resolves.toBeNull();
    await expect(f.read(reference, { mediaId: "foreign-clip" })).resolves.toBeNull();
    expect(f.reads).toEqual([]);
  });
});

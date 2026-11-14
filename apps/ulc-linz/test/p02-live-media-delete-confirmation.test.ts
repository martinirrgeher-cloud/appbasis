import { describe, expect, it } from "vitest";

import type { ExerciseCatalogPrivateMedia } from "@appbasis/exercise-catalog";
import {
  privateExerciseVideoStorageKey,
  type UlcExerciseCatalogObjectStore,
} from "../worker/exercise-catalog-private-media";
import {
  deleteUlcPrivateExerciseMediaWithConfirmation,
  type UlcPrivateMediaDeletionRepository,
} from "../worker/exercise-catalog-media-delete-confirmed";

const ORG = "p02i-club";
const OTHER_ORG = "p02i-neighbor-club";
const EXERCISE = "jump";
const MEDIA = "video-1";
const KEY = privateExerciseVideoStorageKey(ORG, EXERCISE, MEDIA);

function metadata(
  changes: Partial<ExerciseCatalogPrivateMedia> = {},
): ExerciseCatalogPrivateMedia {
  return {
    id: MEDIA,
    organizationId: ORG,
    exerciseId: EXERCISE,
    fileName: "test.mp4",
    storageKey: KEY,
    contentType: "video/mp4",
    sizeBytes: 100,
    createdAt: "2026-11-14T10:00:00.000Z",
    ...changes,
  };
}

function fixture(options: {
  target?: ExerciseCatalogPrivateMedia | null;
  objectPresent?: boolean;
} = {}) {
  let row = options.target === null ? undefined : options.target ?? metadata();
  let present = options.objectPresent ?? true;
  let throwDelete = false;
  let throwGet = false;
  let throwComplete = false;
  let failComplete = false;
  let skipActualDelete = false;
  let reads = 0;
  let asks = 0;
  let providerDeletes = 0;
  let verifies = 0;
  let completes = 0;
  let rangeWasOneByte = false;
  const events: string[] = [];
  const repo: UlcPrivateMediaDeletionRepository = {
    async requestPrivateMediaDeletion(org, exercise, media) {
      asks++;
      events.push("request");
      if (org !== ORG || exercise !== EXERCISE || media !== MEDIA) {
        return undefined;
      }
      return row;
    },
    async completePrivateMediaDeletion(org, exercise, media) {
      completes++;
      events.push("complete");
      if (throwComplete) throw new Error("SQL token or sensitive details");
      if (failComplete) return false;
      if (org !== ORG || exercise !== EXERCISE || media !== MEDIA || !row) return false;
      row = undefined;
      return true;
    },
  };
  const store: UlcExerciseCatalogObjectStore = {
    async put() { throw new Error("P02-I deletion must never upload"); },
    async delete(key) {
      providerDeletes++;
      events.push("delete");
      expect(key).toBe(KEY);
      if (throwDelete) throw new Error("Storage provider secret/token");
      if (!skipActualDelete) present = false;
    },
    async get(key, options) {
      verifies++;
      events.push("verify");
      expect(key).toBe(KEY);
      rangeWasOneByte = options?.range?.get("range") === "bytes=0-0";
      if (throwGet) throw new Error("Sensitive provider get failure");
      if (!present) return null;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          reads++;
          controller.enqueue(Uint8Array.of(42));
          controller.close();
        },
      });
      return { body, size: 100 };
    },
  };
  return {
    call: () => deleteUlcPrivateExerciseMediaWithConfirmation({
      organizationId: ORG, exerciseId: EXERCISE, mediaId: MEDIA,
      catalog: repo, store,
    }),
    repo, store,
    events, 
    totals: () => ({
      asks, providerDeletes, verifies, completes, present,
      rowPresent: row !== undefined, reads, rangeWasOneByte,
    }),
    setWrongTarget(value: ExerciseCatalogPrivateMedia | null) {
      row = value ?? undefined;
    },
    throwOnDelete() { throwDelete = true; },
    throwOnGet() { throwGet = true; },
    throwOnComplete() { throwComplete = true; },
    skipStorageDelete() { skipActualDelete = true; },
    failSqlCompletion() { failComplete = true; },
    allowStorageDelete() { skipActualDelete = false; },
    allowVerification() { throwGet = false; },
  };
}

describe("P02-I actual ULC private-video deletion integration", () => {
  it("deletes the exact provider object, independently checks absence, then finalizes SQL", async () => {
    const f = fixture();
    await expect(f.call()).resolves.toEqual({ status: "deleted" });
    expect(f.events).toEqual(["request", "delete", "verify", "complete"]);
    expect(f.totals()).toMatchObject({
      asks: 1, providerDeletes: 1, verifies: 1, completes: 1,
      rowPresent: false, present: false, rangeWasOneByte: true,
    });
  });

  it("missing SQL media never reaches the storage provider", async () => {
    const f = fixture({ target: null });
    await expect(f.call()).resolves.toEqual({ status: "not-found" });
    expect(f.events).toEqual(["request"]);
  });

  it("refuses foreign organization metadata before provider deletion or SQL completion", async () => {
    const f = fixture({ target: metadata({ organizationId: OTHER_ORG }) });
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request"]);
  });

  it("refuses a foreign exercise ID in the SQL returned media", async () => {
    const f = fixture({ target: metadata({ exerciseId: "foreign-exercise" }) });
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request"]);
  });

  it("refuses a substituted media ID in the SQL returned media", async () => {
    const f = fixture({ target: metadata({ id: "other-media" }) });
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request"]);
  });

  it("refuses an unscoped storage key even when row IDs match", async () => {
    const f = fixture({ target: metadata({ storageKey: "private/other-club.mp4" }) });
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request"]);
  });

  it("never finalizes SQL when provider delete fails", async () => {
    const f = fixture();
    f.throwOnDelete();
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request", "delete"]);
    expect(f.totals()).toMatchObject({ rowPresent: true, completes: 0 });
  });

  it("never finalizes SQL if provider reports an object still present after delete", async () => {
    const f = fixture();
    f.skipStorageDelete();
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request", "delete", "verify"]);
    expect(f.totals()).toMatchObject({
      rowPresent: true, present: true, completes: 0, rangeWasOneByte: true,
    });
    // No private media body is ever consumed by this deletion logic.
  });

  it("never finalizes SQL when the independent provider read fails", async () => {
    const f = fixture();
    f.throwOnGet();
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request", "delete", "verify"]);
    expect(f.totals()).toMatchObject({ completes: 0, rowPresent: true });
  });

  it("never claims deletion when SQL returns false after real provider absence", async () => {
    const f = fixture();
    f.failSqlCompletion();
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.events).toEqual(["request", "delete", "verify", "complete"]);
    expect(f.totals()).toMatchObject({ rowPresent: true, present: false });
  });

  it("never claims deletion when SQL completion throws", async () => {
    const f = fixture();
    f.throwOnComplete();
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.totals()).toMatchObject({ rowPresent: true, present: false });
  });

  it("retries the original pending row after a provider outage, then finalizes", async () => {
    const f = fixture();
    f.throwOnGet();
    await expect(f.call()).resolves.toEqual({ status: "unconfirmed" });
    expect(f.totals()).toMatchObject({
      asks: 1, providerDeletes: 1, verifies: 1, completes: 0, rowPresent: true,
    });
    f.allowVerification();
    await expect(f.call()).resolves.toEqual({ status: "deleted" });
    expect(f.totals()).toMatchObject({
      asks: 2, providerDeletes: 2, verifies: 2, completes: 1,
      rowPresent: false, present: false,
    });
  });

  it("handles repeated deletion after success without re-contacting storage", async () => {
    const f = fixture();
    await expect(f.call()).resolves.toEqual({ status: "deleted" });
    await expect(f.call()).resolves.toEqual({ status: "not-found" });
    expect(f.totals()).toMatchObject({
      asks: 2, providerDeletes: 1, verifies: 1, completes: 1,
    });
  });

  it("rejects invalid scope before any repository/provider action", async () => {
    const f = fixture();
    await expect(deleteUlcPrivateExerciseMediaWithConfirmation({
      organizationId: "../other", exerciseId: EXERCISE, mediaId: MEDIA,
      catalog: f.repo, store: f.store,
    })).rejects.toThrow(/storage scope is invalid/);
    expect(f.events).toEqual([]);
  });

  it("cannot delete an unrelated tenant's media with a different target", async () => {
    const f = fixture();
    await expect(deleteUlcPrivateExerciseMediaWithConfirmation({
      organizationId: OTHER_ORG, exerciseId: EXERCISE, mediaId: MEDIA,
      catalog: f.repo, store: f.store,
    })).resolves.toEqual({ status: "not-found" });
    expect(f.events).toEqual(["request"]);
  });
});

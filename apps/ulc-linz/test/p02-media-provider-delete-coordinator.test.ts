import { describe, expect, it } from "vitest";
import {
  deleteExerciseCatalogPrivateMediaWithProviderProof,
  type ExerciseCatalogMediaDeletionProvider,
  type ExerciseCatalogPrivateMedia,
  type ExerciseCatalogRepository,
} from "@appbasis/exercise-catalog";

const MEDIA: ExerciseCatalogPrivateMedia = Object.freeze({
  id: "media-e",
  organizationId: "tenant-a",
  exerciseId: "exercise-e",
  fileName: "test.mp4",
  storageKey: "tenant-a/medium-e.mp4",
  contentType: "video/mp4",
  sizeBytes: 101,
  createdAt: "2026-11-14T11:00:00.000Z",
});
type MediaRepository = Pick<
  ExerciseCatalogRepository,
  "requestPrivateMediaDeletion" | "completePrivateMediaDeletion"
>;

function setup(options: {
  media?: ExerciseCatalogPrivateMedia | undefined;
  providerInitiallyAbsent?: boolean;
} = {}) {
  let state: "present" | "absent" = options.providerInitiallyAbsent
    ? "absent"
    : "present";
  let media: ExerciseCatalogPrivateMedia | undefined = options.media === undefined ? MEDIA : options.media;
  let completed = false;
  let requestCount = 0;
  let providerDeletes = 0;
  let providerChecks = 0;
  let finalizes = 0;
  let completionOverride: boolean | null = null;
  let deletionOutcome: "delete-accepted" | "already-absent" = "delete-accepted";
  let responseKeyOverride: string | null = null;
  let verifyKeyOverride: string | null = null;
  let observedAbsence: "absent" | "present" | "indeterminate" | null = null;
  let throwsOnDelete = false;
  let throwsOnCheck = false;
  let throwsOnFinalization = false;
  let forceForeignRow = false;
  const repo: MediaRepository = {
    async requestPrivateMediaDeletion(organizationId, exerciseId, mediaId) {
      requestCount += 1;
      if (
        completed || media === undefined ||
        (!forceForeignRow && (
          organizationId !== media.organizationId ||
          exerciseId !== media.exerciseId ||
          mediaId !== media.id
        ))
      ) return undefined;
      return media;
    },
    async completePrivateMediaDeletion(organizationId, exerciseId, mediaId) {
      finalizes += 1;
      if (throwsOnFinalization) throw new Error("metadata-down");
      if (completionOverride !== null) return completionOverride;
      if (
        media?.organizationId !== organizationId ||
        media.exerciseId !== exerciseId ||
        media.id !== mediaId ||
        completed
      ) return false;
      completed = true;
      return true;
    },
  };
  const provider: ExerciseCatalogMediaDeletionProvider = {
    async deleteExactObject(scope) {
      providerDeletes += 1;
      if (throwsOnDelete) throw new Error("provider-delete-failed");
      expect(scope.storageKey).toBe(MEDIA.storageKey);
      expect(scope.organizationId).toBe(MEDIA.organizationId);
      const outcome = state === "absent" ? "already-absent" : deletionOutcome;
      state = "absent";
      return {
        outcome,
        storageKey: responseKeyOverride ?? scope.storageKey,
      };
    },
    async verifyExactObjectAbsence(scope) {
      providerChecks += 1;
      if (throwsOnCheck) throw new Error("provider-head-failed");
      return {
        status: observedAbsence ?? state,
        storageKey: verifyKeyOverride ?? scope.storageKey,
      };
    },
  };
  const call = () => deleteExerciseCatalogPrivateMediaWithProviderProof({
    organizationId: MEDIA.organizationId,
    exerciseId: MEDIA.exerciseId,
    mediaId: MEDIA.id,
    repository: repo,
    provider,
  });
  return {
    call,
    repo,
    provider,
    counters: () => ({
      requestCount, providerDeletes, providerChecks, finalizes, completed, state,
    }),
    setInvalidMedia(value: ExerciseCatalogPrivateMedia | undefined) {
      media = value;
      forceForeignRow = value !== undefined &&
        value.organizationId !== MEDIA.organizationId;
    },
    setDeleteOutcome(value: typeof deletionOutcome) { deletionOutcome = value; },
    setResponseKey(value: string) { responseKeyOverride = value; },
    setVerifyKey(value: string) { verifyKeyOverride = value; },
    setObservedAbsence(value: typeof observedAbsence) { observedAbsence = value; },
    throwOnDelete() { throwsOnDelete = true; },
    throwOnCheck() { throwsOnCheck = true; },
    throwOnFinalize() { throwsOnFinalization = true; },
    forceFinalizeResult(value: boolean) { completionOverride = value; },
  };
}

describe("ULC P02-E media provider-proof coordinator (opt-in, no runtime wiring)", () => {
  it("deletes the exact provider object, independently checks absence, then finalizes metadata", async () => {
    const f = setup();
    await expect(f.call()).resolves.toEqual({
      status: "completed",
      metadataDeleted: true,
      providerDeletionConfirmed: true,
    });
    expect(f.counters()).toEqual({
      requestCount: 1,
      providerDeletes: 1,
      providerChecks: 1,
      finalizes: 1,
      completed: true,
      state: "absent",
    });
    await expect(f.call()).resolves.toEqual({
      status: "metadata-not-found",
      metadataDeleted: false,
      providerDeletionConfirmed: false,
    });
  });

  it("does not contact storage or finalize when media is absent", async () => {
    const f = setup();
    f.setInvalidMedia(undefined);
    await expect(f.call()).resolves.toMatchObject({
      status: "metadata-not-found",
    });
    expect(f.counters().providerDeletes).toBe(0);
    expect(f.counters().finalizes).toBe(0);
  });

  it("blocks provider-deleted status when provider confirms object still present", async () => {
    const f = setup();
    f.setObservedAbsence("present");
    await expect(f.call()).resolves.toEqual({
      status: "provider-object-not-confirmed",
      metadataDeleted: false,
      providerDeletionConfirmed: false,
    });
    expect(f.counters().finalizes).toBe(0);
  });

  it("refuses indeterminate provider HEAD even after delete accepted", async () => {
    const f = setup();
    f.setObservedAbsence("indeterminate");
    await expect(f.call()).resolves.toMatchObject({
      status: "provider-object-not-confirmed",
      metadataDeleted: false,
    });
    expect(f.counters().finalizes).toBe(0);
  });

  it("refuses a storage-key response mismatch without finalization", async () => {
    const f = setup();
    f.setResponseKey("tenant-b/other.mp4");
    await expect(f.call()).resolves.toMatchObject({
      status: "provider-object-not-confirmed",
    });
    expect(f.counters().providerChecks).toBe(0);
    expect(f.counters().finalizes).toBe(0);
  });

  it("rejects an absence response for another storage key before SQL finalization", async () => {
    const f = setup();
    f.setVerifyKey("tenant-b/unrelated-file.mp4");
    await expect(f.call()).resolves.toEqual({
      status: "provider-object-not-confirmed",
      metadataDeleted: false,
      providerDeletionConfirmed: false,
    });
    expect(f.counters().providerDeletes).toBe(1);
    expect(f.counters().providerChecks).toBe(1);
    expect(f.counters().finalizes).toBe(0);
  });

  it("rejects a repository returning a different tenant's media before provider write", async () => {
    const f = setup();
    f.setInvalidMedia({ ...MEDIA, organizationId: "tenant-b" });
    await expect(f.call()).rejects.toThrow(/foreign or invalid object/);
    expect(f.counters().providerDeletes).toBe(0);
    expect(f.counters().finalizes).toBe(0);
  });

  it("preserves requested metadata on provider failure and allows idempotent retry", async () => {
    const f = setup();
    f.throwOnDelete();
    await expect(f.call()).rejects.toThrow(/Private media provider deletion failed/);
    expect(f.counters().finalizes).toBe(0);
    // New coordinator and repo handle retry; provider reports already absent.
    const retry = setup({ providerInitiallyAbsent: true });
    await expect(retry.call()).resolves.toMatchObject({
      status: "completed",
      providerDeletionConfirmed: true,
    });
  });

  it("fails closed if absence verification fails", async () => {
    const f = setup();
    f.throwOnCheck();
    await expect(f.call()).rejects.toThrow(/Private media provider verification failed/);
    expect(f.counters().finalizes).toBe(0);
  });

  it("does not claim metadata deletion after a concurrent or failed finalizer", async () => {
    const f = setup();
    f.forceFinalizeResult(false);
    await expect(f.call()).resolves.toEqual({
      status: "metadata-delete-race",
      metadataDeleted: false,
      providerDeletionConfirmed: true,
    });
    const failed = setup();
    failed.throwOnFinalize();
    await expect(failed.call()).rejects.toThrow(/metadata-down/);
    expect(failed.counters().completed).toBe(false);
  });

  it("does not issue provider actions on malformed identifiers or a missing adapter", async () => {
    const f = setup();
    await expect(deleteExerciseCatalogPrivateMediaWithProviderProof({
      organizationId: "../tenant-b",
      exerciseId: MEDIA.exerciseId,
      mediaId: MEDIA.id,
      repository: f.repo,
      provider: f.provider,
    })).rejects.toThrow(/inputs are invalid/);
    expect(f.counters().requestCount).toBe(0);
  });
});

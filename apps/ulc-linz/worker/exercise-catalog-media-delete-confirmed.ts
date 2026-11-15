import type { ExerciseCatalogPrivateMedia } from "@appbasis/exercise-catalog";

import {
  privateExerciseVideoStorageKey,
  type UlcExerciseCatalogObjectStore,
} from "./exercise-catalog-private-media";

/**
 * P02-I: the ULC HTTP DELETE route calls this helper, not the prior
 * "provider delete => unconditional SQL finalize" sequence.
 *
 * A pending SQL row is intentionally retained after every uncertain outcome.
 * This is not a proof of erasure from provider backups, nor a write/re-upload
 * fence, and it MUST NOT be promoted as a complete privacy lifecycle.
 */
export interface UlcPrivateMediaDeletionRepository {
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

export type UlcConfirmedMediaDeletionResult =
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "unconfirmed" }>
  | Readonly<{ status: "deleted" }>;

function isExactStorageObject(
  media: ExerciseCatalogPrivateMedia,
  organizationId: string,
  exerciseId: string,
  mediaId: string,
): boolean {
  if (
    media === null ||
    typeof media !== "object" ||
    media.organizationId !== organizationId ||
    media.exerciseId !== exerciseId ||
    media.id !== mediaId ||
    typeof media.storageKey !== "string"
  ) {
    return false;
  }

  // ULC HTTP uploads always use this deterministic tenant+exercise+media key.
  // Never execute a provider delete for a forged, old, or foreign key.
  return media.storageKey === privateExerciseVideoStorageKey(
    organizationId,
    exerciseId,
    mediaId,
  );
}

export async function deleteUlcPrivateExerciseMediaWithConfirmation(
  input: Readonly<{
    organizationId: string;
    exerciseId: string;
    mediaId: string;
    catalog: UlcPrivateMediaDeletionRepository;
    store: UlcExerciseCatalogObjectStore;
  }>,
): Promise<UlcConfirmedMediaDeletionResult> {
  const { organizationId, exerciseId, mediaId, catalog, store } = input;
  // Validate exact key scope before any write to the metadata row.
  const exactKey = privateExerciseVideoStorageKey(
    organizationId,
    exerciseId,
    mediaId,
  );

  const target = await catalog.requestPrivateMediaDeletion(
    organizationId,
    exerciseId,
    mediaId,
  );
  if (target === undefined) {
    return Object.freeze({ status: "not-found" });
  }
  if (
    !isExactStorageObject(target, organizationId, exerciseId, mediaId) ||
    target.storageKey !== exactKey
  ) {
    return Object.freeze({ status: "unconfirmed" });
  }

  try {
    await store.delete(exactKey);
  } catch {
    // Do not echo provider errors or touch SQL finalization.
    return Object.freeze({ status: "unconfirmed" });
  }

  let stillPresent: Awaited<ReturnType<UlcExerciseCatalogObjectStore["get"]>>;
  try {
    // Independent provider read-after-delete, not a success inference from
    // delete() or from an in-memory/cache state. A 1-byte range avoids
    // materializing private video content into the Worker.
    stillPresent = await store.get(exactKey, {
      range: new Headers({ range: "bytes=0-0" }),
    });
  } catch {
    return Object.freeze({ status: "unconfirmed" });
  }
  if (stillPresent !== null) {
    // Release any returned stream; no byte is needed to prove "present".
    if (stillPresent.body instanceof ReadableStream) {
      try {
        await stillPresent.body.cancel();
      } catch {
        // Ignoring this failure is safe because the result remains blocked.
      }
    }
    return Object.freeze({ status: "unconfirmed" });
  }

  // SQL completion may fail or another concurrent request may finalize
  // first. A false result is NOT evidence that this request succeeded.
  let completed: boolean;
  try {
    completed = await catalog.completePrivateMediaDeletion(
      organizationId,
      exerciseId,
      mediaId,
    );
  } catch {
    return Object.freeze({ status: "unconfirmed" });
  }
  return Object.freeze({
    status: completed === true ? "deleted" : "unconfirmed",
  });
}

import type { ExerciseCatalogPrivateMedia } from "./domain/types";
import type { ExerciseCatalogRepository } from "./repository";

/**
 * P02-E: opt-in design-stage coordinator. No ULC runtime or HTTP handler imports
 * this function yet. A storage adapter must be independently security-reviewed
 * before live wiring; the interfaces themselves do not prove provider behavior.
 */
export interface ExerciseCatalogMediaDeletionProvider {
  /**
   * Must target the EXACT private storage object returned by catalog SQL.
   * Idempotent request: an already-removed object is not a fatal error.
   * The method must reject wrong bucket, org, key, version or permission.
   */
  deleteExactObject(input: Readonly<{
    organizationId: string;
    exerciseId: string;
    mediaId: string;
    storageKey: string;
  }>): Promise<Readonly<{
    outcome: "delete-accepted" | "already-absent";
    storageKey: string;
  }>>;
  /**
   * Independent read-after-delete proof from authoritative provider location,
   * NOT a local in-memory assumption, cached list or the delete response alone.
   */
  verifyExactObjectAbsence(input: Readonly<{
    organizationId: string;
    exerciseId: string;
    mediaId: string;
    storageKey: string;
  }>): Promise<Readonly<{
    status: "absent" | "present" | "indeterminate";
    storageKey: string;
  }>>;
}

export type ExerciseCatalogPrivateMediaDeleteOutcome =
  | Readonly<{
      status: "metadata-not-found";
      metadataDeleted: false;
      providerDeletionConfirmed: false;
    }>
  | Readonly<{
      status: "provider-object-not-confirmed";
      metadataDeleted: false;
      providerDeletionConfirmed: false;
    }>
  | Readonly<{
      status: "metadata-delete-race";
      metadataDeleted: false;
      providerDeletionConfirmed: true;
    }>
  | Readonly<{
      status: "completed";
      metadataDeleted: true;
      providerDeletionConfirmed: true;
    }>;

function validIdentifier(value: string): boolean {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
  );
}

function assertExactMedia(
  media: ExerciseCatalogPrivateMedia,
  organizationId: string,
  exerciseId: string,
  mediaId: string,
): void {
  if (
    media === null ||
    typeof media !== "object" ||
    media.organizationId !== organizationId ||
    media.exerciseId !== exerciseId ||
    media.id !== mediaId ||
    typeof media.storageKey !== "string" ||
    media.storageKey.trim().length === 0 ||
    media.storageKey !== media.storageKey.trim()
  ) {
    throw new Error("Private media delete request returned a foreign or invalid object.");
  }
}

export async function deleteExerciseCatalogPrivateMediaWithProviderProof(
  input: Readonly<{
    organizationId: string;
    exerciseId: string;
    mediaId: string;
    repository: Pick<
      ExerciseCatalogRepository,
      "requestPrivateMediaDeletion" | "completePrivateMediaDeletion"
    >;
    provider: ExerciseCatalogMediaDeletionProvider;
  }>,
): Promise<ExerciseCatalogPrivateMediaDeleteOutcome> {
  if (
    !validIdentifier(input?.organizationId) ||
    !validIdentifier(input?.exerciseId) ||
    !validIdentifier(input?.mediaId) ||
    !input.repository ||
    typeof input.repository.requestPrivateMediaDeletion !== "function" ||
    typeof input.repository.completePrivateMediaDeletion !== "function" ||
    !input.provider ||
    typeof input.provider.deleteExactObject !== "function" ||
    typeof input.provider.verifyExactObjectAbsence !== "function"
  ) {
    throw new Error("Private media deletion coordinator inputs are invalid.");
  }
  const { organizationId, exerciseId, mediaId } = input;
  const target = await input.repository.requestPrivateMediaDeletion(
    organizationId,
    exerciseId,
    mediaId,
  );
  if (target === undefined) {
    return Object.freeze({
      status: "metadata-not-found",
      metadataDeleted: false,
      providerDeletionConfirmed: false,
    });
  }
  assertExactMedia(target, organizationId, exerciseId, mediaId);
  const key = target.storageKey;
  const scope = Object.freeze({
    organizationId,
    exerciseId,
    mediaId,
    storageKey: key,
  });

  // Fail closed if provider is unreachable or delete throws. The metadata
  // remains (requested/deferred), so a later verified retry is possible.
  const deleteEvidence = await input.provider.deleteExactObject(scope);
  if (
    (deleteEvidence.outcome !== "delete-accepted" &&
      deleteEvidence.outcome !== "already-absent") ||
    deleteEvidence.storageKey !== key
  ) {
    return Object.freeze({
      status: "provider-object-not-confirmed",
      metadataDeleted: false,
      providerDeletionConfirmed: false,
    });
  }
  const absenceEvidence = await input.provider.verifyExactObjectAbsence(scope);
  if (
    absenceEvidence.status !== "absent" ||
    absenceEvidence.storageKey !== key
  ) {
    return Object.freeze({
      status: "provider-object-not-confirmed",
      metadataDeleted: false,
      providerDeletionConfirmed: false,
    });
  }

  // IMPORTANT: this verifies provider absence only before the metadata
  // finalizer. Without a verified provider adapter, version pinning and
  // an atomic no-reupload fence, this is NOT a full production safety proof.
  const finalized = await input.repository.completePrivateMediaDeletion(
    organizationId,
    exerciseId,
    mediaId,
  );
  if (!finalized) {
    return Object.freeze({
      status: "metadata-delete-race",
      metadataDeleted: false,
      providerDeletionConfirmed: true,
    });
  }
  return Object.freeze({
    status: "completed",
    metadataDeleted: true,
    providerDeletionConfirmed: true,
  });
}

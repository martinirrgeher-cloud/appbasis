export interface TrainingBlockExerciseRevision {
  readonly itemId: string;
  readonly exerciseId: string;
  readonly note: string | null;
  readonly parameterOverrides: readonly {
    readonly key: string;
    readonly value: string;
    readonly sortOrder: number;
  }[];
  readonly sortOrder: number;
}

export interface TrainingBlockRevision {
  readonly organizationId: string;
  readonly blockId: string;
  readonly revision: number;
  readonly name: string;
  readonly audienceId: string | null;
  readonly audienceIds: readonly string[];
  readonly category?: string | null;
  readonly durationMinutes: number | null;
  readonly note: string | null;
  readonly exercises: readonly TrainingBlockExerciseRevision[];
  readonly createdAt: string;
}

export interface TrainingBlockSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly isActive: boolean;
  readonly currentRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: TrainingBlockRevision;
}

export interface TrainingBlockUsageEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly blockId: string;
  readonly occurredAt: string;
  readonly sourceKind: string;
  readonly sourceRef: string | null;
  readonly note: string | null;
}

/**
 * Privileged, read-only inventory. These counts disclose neither free-text
 * notes nor source references and are NOT proof of subject ownership.
 *
 * Training-plan refs are currently planId:itemId. Neither segment proves
 * which person owns the event; other source kinds are likewise unclassified.
 * A separate app-owned attribution and restore/deletion policy is required
 * before any event can be purged or anonymized.
 */
/**
 * Privileged write input, supplied only after an application verifies that a
 * saved training plan owns the subject and source item. The module does not
 * infer subject ownership from opaque sourceRef strings.
 */
export interface TrainingBlockVerifiedSubjectUsage {
  readonly event: TrainingBlockUsageEvent;
  readonly subjectId: string;
  readonly sourcePlanId: string;
  readonly sourceItemId: string;
}

export interface TrainingBlockSubjectUsageDeletionResult {
  readonly markerInserted: boolean;
  readonly deletedUsageEvents: number;
}

/**
 * Restricted schema-v6 boundary. Neither method is a public HTTP operation;
 * the app must separately authorize the target subject and source plan.
 */
export interface TrainingBlockSubjectUsageLifecycleRepository {
  recordVerifiedSubjectUsageOnce(
    input: TrainingBlockVerifiedSubjectUsage,
  ): Promise<TrainingBlockUsageEvent | undefined>;
  markSubjectDeletedAndRemoveAttributedUsage(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<TrainingBlockSubjectUsageDeletionResult>;
}

/** Minimal deletion decision from a complete, NEWER authoritative recovery point. */
export interface TrainingBlockSubjectUsageDeletionMarker {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly completedAt: Date;
  readonly purgeAfter: Date;
}

/**
 * Privileged, offline-only recovery contract. The app/operator must prove
 * authority ordering and snapshot completeness, keep the restored target
 * inaccessible, and reconcile all owners before promotion.
 */
/**
 * Privileged owner-only, scoped read-only evidence. Counts explicitly
 * attributed live usage, never guesses a subject from legacy free text.
 * Missing marker is indeterminate after possible marker purge/restore.
 */
export interface TrainingBlockSubjectUsageDeletionInspection {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly marker: TrainingBlockSubjectUsageDeletionMarker | null;
  readonly remainingAttributedUsageEvents: number;
}

export interface TrainingBlockSubjectUsageReconciliationRepository {
  /** Includes expired-but-still-protective markers: they are never auto-purged. */
  listSubjectUsageDeletionMarkers(
    now: Date,
  ): Promise<readonly TrainingBlockSubjectUsageDeletionMarker[]>;
  reconcileSubjectUsageDeletionMarker(
    marker: TrainingBlockSubjectUsageDeletionMarker,
  ): Promise<TrainingBlockSubjectUsageDeletionResult>;
}

export interface TrainingBlockUsagePrivacyInspection {
  readonly organizationId: string;
  readonly totalEvents: number;
  readonly trainingPlanEvents: number;
  readonly trainingPlanEventsWithoutReference: number;
  readonly otherSourceEvents: number;
  readonly eventsWithFreeTextNote: number;
  readonly eventsWithSourceReference: number;
}

export interface TrainingBlockUsageSummary {
  readonly blockId: string;
  readonly usageCount: number;
  readonly lastUsedAt: string | null;
}

export type TrainingBlockRevisionAppendResult =
  | Readonly<{ status: "updated"; block: TrainingBlockSnapshot }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "inactive"; currentRevision: number }>
  | Readonly<{ status: "conflict"; currentRevision: number }>;

export type TrainingBlockDeactivateResult =
  | Readonly<{ status: "updated"; block: TrainingBlockSnapshot }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "conflict"; currentRevision: number }>;

export type TrainingBlockDeleteUnusedResult =
  | Readonly<{ status: "deleted" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "in-use" }>
  | Readonly<{ status: "conflict"; currentRevision: number }>;

/**
 * Restricted personal-metadata cleanup for an already-authorized caller.
 * This primitive does not mark a subject deleted or prevent subsequent writes.
 * It must not be treated as a complete privacy/deletion lifecycle.
 */
export interface TrainingBlockPersonalDataLifecycleRepository {
  deletePrincipalFavorites(
    organizationId: string,
    principalId: string,
  ): Promise<number>;
}

export interface TrainingBlockFavoriteDeletionResult {
  readonly markerInserted: boolean;
  readonly deletedFavorites: number;
}

/**
 * Restricted tombstone boundary. The application must authorize the subject and
 * stop using the legacy cleanup primitive for privacy deletion.
 */
export interface TrainingBlockFavoriteDeletionRepository {
  markPrincipalDeletedAndDeleteFavorites(
    organizationId: string,
    principalId: string,
    completedAt: Date,
  ): Promise<TrainingBlockFavoriteDeletionResult>;
}

/** Minimal module-owned marker copied from a newer authoritative recovery point. */
export interface TrainingBlockFavoriteDeletionMarker {
  readonly organizationId: string;
  readonly principalId: string;
  readonly completedAt: Date;
  readonly purgeAfter: Date;
}

/**
 * Privileged restore-only contract. The caller must keep the target offline,
 * verify that the source is newer and authoritative, and complete reconciliation
 * before any restored database is promoted.
 */
export interface TrainingBlockFavoriteReconciliationRepository {
  listCurrentDeletionMarkers(now: Date): Promise<readonly TrainingBlockFavoriteDeletionMarker[]>;
  reconcileDeletionMarker(
    marker: TrainingBlockFavoriteDeletionMarker,
  ): Promise<TrainingBlockFavoriteDeletionResult>;
}

/**
 * Read-only retention preflight. Expiration means review is due, not that
 * deletion is authorized: an app-level backup/restore and access-policy proof
 * is required before a future, separate purge can safely remove a tombstone.
 */
export interface TrainingBlockFavoriteRetentionCandidate {
  readonly marker: TrainingBlockFavoriteDeletionMarker;
  readonly hasResidualFavorites: boolean;
}
export interface TrainingBlockFavoriteRetentionCursor {
  readonly purgeAfter: Date;
  readonly organizationId: string;
  readonly principalId: string;
}
export interface TrainingBlockFavoriteRetentionInspection {
  readonly candidates: readonly TrainingBlockFavoriteRetentionCandidate[];
  readonly hasMore: boolean;
  readonly nextCursor: TrainingBlockFavoriteRetentionCursor | null;
}

export interface TrainingBlockRepository {
  listCurrent(organizationId: string): Promise<readonly TrainingBlockSnapshot[]>;
  findCurrent(
    organizationId: string,
    blockId: string,
  ): Promise<TrainingBlockSnapshot | undefined>;
  create(block: TrainingBlockSnapshot): Promise<TrainingBlockSnapshot>;
  appendRevision(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    revision: TrainingBlockRevision,
  ): Promise<TrainingBlockRevisionAppendResult>;
  deactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<TrainingBlockDeactivateResult>;
  reactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<TrainingBlockDeactivateResult>;
  deleteUnused(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
  ): Promise<TrainingBlockDeleteUnusedResult>;
  listFavoriteBlockIds(
    organizationId: string,
    principalId: string,
  ): Promise<readonly string[]>;
  setFavorite(
    organizationId: string,
    principalId: string,
    blockId: string,
    favorite: boolean,
  ): Promise<void>;
  listUsageSummaries(
    organizationId: string,
  ): Promise<readonly TrainingBlockUsageSummary[]>;
  listUsageEvents(
    organizationId: string,
    blockId: string,
    limit?: number,
  ): Promise<readonly TrainingBlockUsageEvent[]>;
  recordUsage(event: TrainingBlockUsageEvent): Promise<void>;
  recordUsageIfAbsent(
    event: TrainingBlockUsageEvent,
  ): Promise<TrainingBlockUsageEvent | undefined>;
  listRevisions(
    organizationId: string,
    blockId: string,
  ): Promise<readonly TrainingBlockRevision[]>;
  findRevision(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<TrainingBlockRevision | undefined>;
}

export function compareTrainingBlockSnapshots(
  left: TrainingBlockSnapshot,
  right: TrainingBlockSnapshot,
): number {
  return (
    left.revision.name.localeCompare(right.revision.name, "de", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id)
  );
}

export function assertTrainingBlockCreationInvariant(
  block: TrainingBlockSnapshot,
): void {
  if (block.currentRevision !== 1 || block.revision.revision !== 1) {
    throw new Error("Training block creation must start at revision 1.");
  }
  if (
    block.revision.organizationId !== block.organizationId ||
    block.revision.blockId !== block.id
  ) {
    throw new Error("Training block revision escaped its block scope.");
  }
}

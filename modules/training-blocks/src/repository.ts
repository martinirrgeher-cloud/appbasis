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

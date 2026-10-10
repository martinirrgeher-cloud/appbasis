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

export type TrainingBlockRevisionAppendResult =
  | Readonly<{ status: "updated"; block: TrainingBlockSnapshot }>
  | Readonly<{ status: "not-found" }>
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

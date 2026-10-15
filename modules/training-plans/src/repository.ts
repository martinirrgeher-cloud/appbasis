export interface TrainingPlanExerciseRevision {
  readonly kind: "exercise";
  readonly itemId: string;
  readonly sourceExerciseId: string | null;
  readonly name: string;
  readonly sets: string | null;
  readonly repetitions: string | null;
  readonly amount: string | null;
  readonly unit: string | null;
  readonly comment: string | null;
  readonly sortOrder: number;
}

export interface TrainingPlanBlockRevision {
  readonly kind: "block";
  readonly itemId: string;
  readonly sourceBlockId: string | null;
  readonly sourceBlockRevision: number | null;
  readonly name: string;
  readonly durationMinutes: number | null;
  readonly note: string | null;
  readonly exercises: readonly TrainingPlanExerciseRevision[];
  readonly sortOrder: number;
}

export type TrainingPlanItemRevision =
  | TrainingPlanBlockRevision
  | TrainingPlanExerciseRevision;

export interface TrainingPlanRevision {
  readonly organizationId: string;
  readonly planId: string;
  readonly revision: number;
  readonly note: string | null;
  readonly items: readonly TrainingPlanItemRevision[];
  readonly createdAt: string;
}

export interface TrainingPlanSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly planDate: string;
  readonly currentRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: TrainingPlanRevision;
}

export type TrainingPlanCreateResult =
  | Readonly<{ status: "created"; plan: TrainingPlanSnapshot }>
  | Readonly<{
      status: "target-occupied";
      planId: string;
      currentRevision: number;
    }>
  | Readonly<{ status: "id-conflict" }>
  | Readonly<{ status: "subject-deleted" }>;

export type TrainingPlanRevisionAppendResult =
  | Readonly<{ status: "updated"; plan: TrainingPlanSnapshot }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "conflict"; currentRevision: number }>;

export interface TrainingPlanSubjectDeletionResult {
  readonly deletedPlans: number;
  readonly deletedRevisions: number;
  readonly deletedItems: number;
}

export interface TrainingPlanSubjectDeletionMarker {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly completedAt: Date;
  readonly purgeAfter: Date;
}

export interface TrainingPlanDeletionReplayResult
  extends TrainingPlanSubjectDeletionResult {
  readonly markerInserted: boolean;
}

export interface TrainingPlanLifecycleRepository {
  deleteSubjectData(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<TrainingPlanSubjectDeletionResult>;
  listCurrentDeletionMarkers(
    now: Date,
  ): Promise<readonly TrainingPlanSubjectDeletionMarker[]>;
  reconcileDeletionMarker(
    marker: TrainingPlanSubjectDeletionMarker,
  ): Promise<TrainingPlanDeletionReplayResult>;
  purgeExpiredDeletionMarkers(now: Date): Promise<number>;
}

export interface TrainingPlanRepository {
  listCurrentBySubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]>;
  findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  create(plan: TrainingPlanSnapshot): Promise<TrainingPlanCreateResult>;
  appendRevision(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    revision: TrainingPlanRevision,
  ): Promise<TrainingPlanRevisionAppendResult>;
  listRevisions(
    organizationId: string,
    planId: string,
  ): Promise<readonly TrainingPlanRevision[]>;
  findRevision(
    organizationId: string,
    planId: string,
    revision: number,
  ): Promise<TrainingPlanRevision | undefined>;
}

export function compareTrainingPlanSnapshots(
  left: TrainingPlanSnapshot,
  right: TrainingPlanSnapshot,
): number {
  return (
    left.planDate.localeCompare(right.planDate) ||
    left.id.localeCompare(right.id)
  );
}

export function assertTrainingPlanCreationInvariant(
  plan: TrainingPlanSnapshot,
): void {
  if (plan.currentRevision !== 1 || plan.revision.revision !== 1) {
    throw new Error("Training plan creation must start at revision 1.");
  }
  if (
    plan.revision.organizationId !== plan.organizationId ||
    plan.revision.planId !== plan.id
  ) {
    throw new Error("Training plan revision escaped its plan scope.");
  }
}

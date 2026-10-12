import type {
  TrainingPlanBlockDraft,
  TrainingPlanExerciseDraft,
} from "./training-plan";

export interface TrainingPlanExerciseRevision
  extends TrainingPlanExerciseDraft {
  readonly itemId: string;
}

export interface TrainingPlanBlockRevision
  extends Omit<TrainingPlanBlockDraft, "exercises"> {
  readonly itemId: string;
  readonly exercises: readonly TrainingPlanExerciseRevision[];
}

export type TrainingPlanRevisionItem =
  | TrainingPlanBlockRevision
  | TrainingPlanExerciseRevision;

export interface TrainingPlanRevision {
  readonly organizationId: string;
  readonly planId: string;
  readonly revision: number;
  readonly note: string | null;
  readonly items: readonly TrainingPlanRevisionItem[];
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

export interface TrainingPlanListQuery {
  readonly subjectId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
}

export type TrainingPlanCreateResult =
  | Readonly<{ status: "created"; plan: TrainingPlanSnapshot }>
  | Readonly<{ status: "target-exists"; plan: TrainingPlanSnapshot }>;

export type TrainingPlanRevisionAppendResult =
  | Readonly<{ status: "updated"; plan: TrainingPlanSnapshot }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "conflict"; currentRevision: number }>;

export interface TrainingPlanRepository {
  listCurrent(
    organizationId: string,
    query?: TrainingPlanListQuery,
  ): Promise<readonly TrainingPlanSnapshot[]>;
  findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  findForSubjectDate(
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
    left.subjectId.localeCompare(right.subjectId) ||
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
  assertRevisionItemIdentity(plan.revision);
}

export function assertTrainingPlanRevisionInvariant(
  revision: TrainingPlanRevision,
): void {
  assertRevisionItemIdentity(revision);
}

function assertRevisionItemIdentity(revision: TrainingPlanRevision): void {
  const itemIds = new Set<string>();
  for (let topIndex = 0; topIndex < revision.items.length; topIndex += 1) {
    const item = revision.items[topIndex];
    if (item === undefined || item.sortOrder !== topIndex) {
      throw new Error("Training plan top-level item ordering is invalid.");
    }
    assertUniqueItemId(item.itemId, itemIds);
    if (item.kind !== "block") continue;
    for (
      let exerciseIndex = 0;
      exerciseIndex < item.exercises.length;
      exerciseIndex += 1
    ) {
      const exercise = item.exercises[exerciseIndex];
      if (
        exercise === undefined ||
        exercise.kind !== "exercise" ||
        exercise.sortOrder !== exerciseIndex
      ) {
        throw new Error("Training plan block exercise ordering is invalid.");
      }
      assertUniqueItemId(exercise.itemId, itemIds);
    }
  }
}

function assertUniqueItemId(itemId: string, itemIds: Set<string>): void {
  if (
    typeof itemId !== "string" ||
    itemId.length === 0 ||
    itemId.trim() !== itemId ||
    itemIds.has(itemId)
  ) {
    throw new Error("Training plan revision contains an invalid item id.");
  }
  itemIds.add(itemId);
}

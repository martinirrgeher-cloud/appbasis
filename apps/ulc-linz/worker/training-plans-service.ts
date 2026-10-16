import type {
  Athlete,
  AthleteMasterdataSnapshot,
} from "@appbasis/athletes";
import type {
  ExerciseCatalogRepository,
} from "@appbasis/exercise-catalog";
import {
  normalizeTrainingPlanDraft,
  TrainingPlanConflictError,
  TrainingPlanValidationError,
  type CreateTrainingPlanDraftInput,
  type TrainingPlanDraft,
  type TrainingPlanItemDraft,
  type TrainingPlanRevision,
  type TrainingPlanService,
  type TrainingPlanSnapshot,
  type UpdateTrainingPlanDraftInput,
  type UpdateTrainingPlanItemInput,
} from "@appbasis/training-plans";
import type { UlcTrainingAttendanceSummary } from "./training-session-postgres";

export interface UlcTrainingPlanSubject {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
}

export interface UlcTrainingPlanMasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): PromiseLike<Pick<AthleteMasterdataSnapshot, "athletes">>;
}

export interface UlcTrainingPlanExerciseReader {
  listItems: Pick<ExerciseCatalogRepository, "listItems">["listItems"];
}

export interface UlcTrainingPlanAttendanceReader {
  listAttendanceForAthleteDateRange(
    organizationId: string,
    athleteId: string,
    fromDate: string,
    toDate: string,
  ): PromiseLike<readonly UlcTrainingAttendanceSummary[]>;
}

export class UlcTrainingPlanReferenceError extends Error {
  readonly code = "ULC_TRAINING_PLAN_REFERENCE_INVALID";
  readonly referenceType: "subject" | "exercise";
  readonly referenceId: string | null;

  constructor(
    referenceType: "subject" | "exercise",
    referenceId: string | null,
  ) {
    super(
      referenceType === "subject"
        ? "Training plan requires one active ULC athlete."
        : "Training plan references an unavailable exercise.",
    );
    this.name = "UlcTrainingPlanReferenceError";
    this.referenceType = referenceType;
    this.referenceId = referenceId;
  }
}

export interface UlcTrainingPlanService {
  listSubjects(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanSubject[]>;
  listForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]>;
  listAttendanceForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly UlcTrainingAttendanceSummary[]>;
  findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  create(
    organizationId: string,
    input: CreateTrainingPlanDraftInput,
  ): Promise<TrainingPlanSnapshot>;
  update(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    input: UpdateTrainingPlanDraftInput,
  ): Promise<TrainingPlanSnapshot | undefined>;
  copyCurrentTo(
    organizationId: string,
    sourcePlanId: string,
    targetSubjectId: string,
    targetDate: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
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

export function createUlcTrainingPlanService({
  plans,
  masterdata,
  exerciseCatalog,
  attendance,
}: {
  plans: TrainingPlanService;
  masterdata: UlcTrainingPlanMasterdataReader;
  exerciseCatalog: UlcTrainingPlanExerciseReader;
  attendance: UlcTrainingPlanAttendanceReader;
}): UlcTrainingPlanService {
  async function listSubjects(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanSubject[]> {
    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
    return Object.freeze(
      snapshot.athletes
        .filter(
          (athlete) =>
            athlete.organizationId === organizationId &&
            athlete.isActive === true,
        )
        .sort(compareAthletes)
        .map(subjectFromAthlete),
    );
  }

  async function assertActiveSubject(
    organizationId: string,
    subjectId: string,
  ): Promise<void> {
    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
    const subject = snapshot.athletes.find(
      (athlete) =>
        athlete.id === subjectId &&
        athlete.organizationId === organizationId &&
        athlete.isActive === true,
    );
    if (subject === undefined) {
      throw new UlcTrainingPlanReferenceError("subject", subjectId);
    }
  }

  async function assertExerciseReferences(
    organizationId: string,
    exerciseIds: ReadonlySet<string>,
  ): Promise<void> {
    if (exerciseIds.size === 0) return;

    const catalogItems = await exerciseCatalog.listItems(organizationId);
    const byId = new Map(
      catalogItems.map((item) => [item.id, item] as const),
    );
    for (const exerciseId of exerciseIds) {
      const exercise = byId.get(exerciseId);
      if (
        exercise === undefined ||
        exercise.organizationId !== organizationId ||
        exercise.isActive !== true
      ) {
        throw new UlcTrainingPlanReferenceError("exercise", exerciseId);
      }
    }
  }

  return Object.freeze({
    listSubjects,
    listForSubjectDateRange(
      organizationId: string,
      subjectId: string,
      fromDate: string,
      toDate: string,
    ) {
      return plans.listForSubjectDateRange(
        organizationId,
        subjectId,
        fromDate,
        toDate,
      );
    },
    async listAttendanceForSubjectDateRange(
      organizationId: string,
      subjectId: string,
      fromDate: string,
      toDate: string,
    ) {
      await assertActiveSubject(organizationId, subjectId);
      return attendance.listAttendanceForAthleteDateRange(
        organizationId,
        subjectId,
        fromDate,
        toDate,
      );
    },
    findCurrent(organizationId: string, planId: string) {
      return plans.findCurrent(organizationId, planId);
    },
    findCurrentBySubjectDate(
      organizationId: string,
      subjectId: string,
      planDate: string,
    ) {
      return plans.findCurrentBySubjectDate(
        organizationId,
        subjectId,
        planDate,
      );
    },
    async create(
      organizationId: string,
      input: CreateTrainingPlanDraftInput,
    ) {
      const draft = normalizeTrainingPlanDraft(input);
      await assertActiveSubject(organizationId, draft.subjectId);
      await assertExerciseReferences(
        organizationId,
        sourceExerciseIds(draft.items),
      );
      return plans.create(organizationId, input);
    },
    async update(
      organizationId: string,
      planId: string,
      expectedRevision: number,
      input: UpdateTrainingPlanDraftInput,
    ) {
      const expected = requiredRevision(expectedRevision);
      const current = await plans.findCurrent(organizationId, planId);
      if (current === undefined) return undefined;
      if (current.currentRevision !== expected) {
        throw new TrainingPlanConflictError(
          expected,
          current.currentRevision,
        );
      }
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TrainingPlanValidationError(
          "Training plan update input is invalid.",
        );
      }

      const rawItems = input.items ?? [];
      const draft = normalizeTrainingPlanDraft({
        subjectId: current.subjectId,
        planDate: current.planDate,
        ...(input.note === undefined ? {} : { note: input.note }),
        items: rawItems,
      });
      await assertExerciseReferences(
        organizationId,
        changedSourceExerciseIds(current, draft, rawItems),
      );
      return plans.update(
        organizationId,
        planId,
        expected,
        input,
      );
    },
    async copyCurrentTo(
      organizationId: string,
      sourcePlanId: string,
      targetSubjectId: string,
      targetDate: string,
    ) {
      const source = await plans.findCurrent(organizationId, sourcePlanId);
      if (source === undefined) return undefined;
      await assertActiveSubject(organizationId, targetSubjectId);
      return plans.copyCurrentTo(
        organizationId,
        sourcePlanId,
        targetSubjectId,
        targetDate,
      );
    },
    listRevisions(organizationId: string, planId: string) {
      return plans.listRevisions(organizationId, planId);
    },
    findRevision(
      organizationId: string,
      planId: string,
      revision: number,
    ) {
      return plans.findRevision(organizationId, planId, revision);
    },
  });
}

function requiredRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TrainingPlanValidationError(
      "Expected training plan revision is invalid.",
    );
  }
  return value;
}

function sourceExerciseIds(
  items: readonly TrainingPlanItemDraft[],
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const item of items) {
    if (item.kind === "exercise") {
      if (item.sourceExerciseId !== null) result.add(item.sourceExerciseId);
      continue;
    }
    for (const exercise of item.exercises) {
      if (exercise.sourceExerciseId !== null) {
        result.add(exercise.sourceExerciseId);
      }
    }
  }
  return result;
}

function changedSourceExerciseIds(
  current: TrainingPlanSnapshot,
  draft: TrainingPlanDraft,
  rawItems: readonly UpdateTrainingPlanItemInput[],
): ReadonlySet<string> {
  const currentById = currentExerciseSources(current.revision.items);
  const result = new Set<string>();

  draft.items.forEach((item, index) => {
    const raw = rawItems[index];
    if (!isRecord(raw) || raw.kind !== item.kind) return;

    if (item.kind === "exercise") {
      collectChangedSource(
        result,
        currentById,
        raw.itemId,
        item.sourceExerciseId,
      );
      return;
    }

    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    item.exercises.forEach((exercise, exerciseIndex) => {
      const rawExercise = rawExercises[exerciseIndex];
      if (!isRecord(rawExercise)) return;
      collectChangedSource(
        result,
        currentById,
        rawExercise.itemId,
        exercise.sourceExerciseId,
      );
    });
  });

  return result;
}

function currentExerciseSources(
  items: TrainingPlanSnapshot["revision"]["items"],
): ReadonlyMap<string, string | null> {
  const result = new Map<string, string | null>();
  for (const item of items) {
    if (item.kind === "exercise") {
      result.set(item.itemId, item.sourceExerciseId);
      continue;
    }
    for (const exercise of item.exercises) {
      result.set(exercise.itemId, exercise.sourceExerciseId);
    }
  }
  return result;
}

function collectChangedSource(
  result: Set<string>,
  currentById: ReadonlyMap<string, string | null>,
  rawItemId: unknown,
  nextSourceExerciseId: string | null,
): void {
  if (nextSourceExerciseId === null) return;

  if (typeof rawItemId !== "string") {
    result.add(nextSourceExerciseId);
    return;
  }

  const currentSource = currentById.get(rawItemId);
  if (currentSource === undefined) {
    return;
  }
  if (currentSource !== nextSourceExerciseId) {
    result.add(nextSourceExerciseId);
  }
}

function compareAthletes(left: Athlete, right: Athlete): number {
  return (
    left.lastName.localeCompare(right.lastName, "de") ||
    left.firstName.localeCompare(right.firstName, "de") ||
    left.id.localeCompare(right.id)
  );
}

function subjectFromAthlete(athlete: Athlete): UlcTrainingPlanSubject {
  return Object.freeze({
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    displayName: `${athlete.lastName}, ${athlete.firstName}`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

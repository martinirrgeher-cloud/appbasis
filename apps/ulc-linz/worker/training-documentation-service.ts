import {
  TrainingDocumentationTargetOccupiedError,
  type TrainingDocumentationItemInput,
  type TrainingDocumentationService,
  type TrainingDocumentationSnapshot,
  type UpdateTrainingDocumentationInput,
} from "@appbasis/training-documentation";
import type { TrainingPlanSnapshot } from "@appbasis/training-plans";

import type {
  UlcTrainingPlanService,
  UlcTrainingPlanSubject,
} from "./training-plans-service";

export class UlcTrainingDocumentationPlanNotFoundError extends Error {
  readonly code = "ULC_TRAINING_DOCUMENTATION_PLAN_NOT_FOUND";

  constructor() {
    super("No training plan exists for this athlete and date.");
    this.name = "UlcTrainingDocumentationPlanNotFoundError";
  }
}

export class UlcTrainingDocumentationSubjectNotFoundError extends Error {
  readonly code = "ULC_TRAINING_DOCUMENTATION_SUBJECT_NOT_FOUND";

  constructor() {
    super("The training documentation subject is unavailable.");
    this.name = "UlcTrainingDocumentationSubjectNotFoundError";
  }
}

export interface UlcTrainingDocumentationDay {
  readonly subject: UlcTrainingPlanSubject;
  readonly plan: TrainingPlanSnapshot | null;
  readonly documentation: TrainingDocumentationSnapshot | null;
  readonly attendanceStatus: "present" | "excused" | "absent" | "open";
}

export function createUlcTrainingDocumentationService({
  documentation,
  plans,
}: {
  documentation: TrainingDocumentationService;
  plans: UlcTrainingPlanService;
}) {
  async function subject(
    organizationId: string,
    subjectId: string,
  ): Promise<UlcTrainingPlanSubject> {
    const subjects = await plans.listSubjects(organizationId);
    const found = subjects.find((entry) => entry.id === subjectId);
    if (found === undefined) {
      throw new UlcTrainingDocumentationSubjectNotFoundError();
    }
    return found;
  }

  async function attendance(
    organizationId: string,
    subjectId: string,
    sessionDate: string,
  ): Promise<"present" | "excused" | "absent" | "open"> {
    const summaries = await plans.listAttendanceForSubjectDateRange(
      organizationId,
      subjectId,
      sessionDate,
      sessionDate,
    );
    const statuses = summaries
      .filter((entry) => entry.sessionDate === sessionDate)
      .map((entry) => entry.status);
    for (const status of ["present", "excused", "absent", "open"] as const) {
      if (statuses.includes(status)) return status;
    }
    return "open";
  }

  return Object.freeze({
    listSubjects(organizationId: string) {
      return plans.listSubjects(organizationId);
    },

    async readDay(
      organizationId: string,
      subjectId: string,
      sessionDate: string,
    ): Promise<UlcTrainingDocumentationDay> {
      const [selectedSubject, plan, existing, attendanceStatus] =
        await Promise.all([
          subject(organizationId, subjectId),
          plans.findCurrentBySubjectDate(
            organizationId,
            subjectId,
            sessionDate,
          ),
          documentation.findCurrentBySubjectDate(
            organizationId,
            subjectId,
            sessionDate,
          ),
          attendance(organizationId, subjectId, sessionDate),
        ]);
      return Object.freeze({
        subject: selectedSubject,
        plan: plan ?? null,
        documentation: existing ?? null,
        attendanceStatus,
      });
    },

    async start(
      organizationId: string,
      subjectId: string,
      sessionDate: string,
    ): Promise<TrainingDocumentationSnapshot> {
      const [selectedSubject, plan, attendanceStatus] = await Promise.all([
        subject(organizationId, subjectId),
        plans.findCurrentBySubjectDate(
          organizationId,
          subjectId,
          sessionDate,
        ),
        attendance(organizationId, subjectId, sessionDate),
      ]);
      if (plan === undefined) {
        throw new UlcTrainingDocumentationPlanNotFoundError();
      }
      try {
        return await documentation.create(organizationId, {
          subjectId,
          sessionDate,
          sourcePlanId: plan.id,
          sourcePlanRevision: plan.currentRevision,
          note: plan.revision.note,
          items: documentationItemsFromPlan(plan),
          attendance: [
            {
              participantId: subjectId,
              displayName: selectedSubject.displayName,
              status: attendanceStatus,
            },
          ],
        });
      } catch (error) {
        if (error instanceof TrainingDocumentationTargetOccupiedError) {
          const existing = await documentation.findCurrentBySubjectDate(
            organizationId,
            subjectId,
            sessionDate,
          );
          if (existing !== undefined) return existing;
        }
        throw error;
      }
    },

    async update(
      organizationId: string,
      documentationId: string,
      expectedRevision: number,
      input: UpdateTrainingDocumentationInput,
    ) {
      return documentation.update(
        organizationId,
        documentationId,
        expectedRevision,
        input,
      );
    },

    async refreshAttendance(
      organizationId: string,
      documentationId: string,
      expectedRevision: number,
    ) {
      const current = await documentation.findCurrent(
        organizationId,
        documentationId,
      );
      if (current === undefined) return undefined;
      const selectedSubject = await subject(
        organizationId,
        current.subjectId,
      );
      const status = await attendance(
        organizationId,
        current.subjectId,
        current.sessionDate,
      );
      return documentation.update(
        organizationId,
        documentationId,
        expectedRevision,
        {
          attendance: [
            {
              participantId: current.subjectId,
              displayName: selectedSubject.displayName,
              status,
            },
          ],
        },
      );
    },

    complete(
      organizationId: string,
      documentationId: string,
      expectedRevision: number,
    ) {
      return documentation.complete(
        organizationId,
        documentationId,
        expectedRevision,
      );
    },

    reopen(
      organizationId: string,
      documentationId: string,
      expectedRevision: number,
    ) {
      return documentation.reopen(
        organizationId,
        documentationId,
        expectedRevision,
      );
    },
  });
}

function documentationItemsFromPlan(
  plan: TrainingPlanSnapshot,
): readonly TrainingDocumentationItemInput[] {
  return Object.freeze(
    plan.revision.items.map((item) => {
      if (item.kind === "exercise") {
        return Object.freeze({
          kind: "exercise" as const,
          sourceItemId: item.itemId,
          sourceExerciseId: item.sourceExerciseId,
          name: item.name,
          plannedSets: item.sets,
          plannedRepetitions: item.repetitions,
          plannedAmount: item.amount,
          plannedUnit: item.unit,
          plannedComment: item.comment,
          performed: true,
          actualSets: item.sets,
          actualRepetitions: item.repetitions,
          actualAmount: item.amount,
          actualUnit: item.unit,
          actualComment: item.comment,
        });
      }
      return Object.freeze({
        kind: "block" as const,
        sourceItemId: item.itemId,
        sourceBlockId: item.sourceBlockId,
        sourceBlockRevision: item.sourceBlockRevision,
        name: item.name,
        plannedDurationMinutes: item.durationMinutes,
        plannedNote: item.note,
        performed: true,
        actualDurationMinutes: item.durationMinutes,
        actualNote: item.note,
        exercises: Object.freeze(
          item.exercises.map((exercise) =>
            Object.freeze({
              sourceItemId: exercise.itemId,
              sourceExerciseId: exercise.sourceExerciseId,
              name: exercise.name,
              plannedSets: exercise.sets,
              plannedRepetitions: exercise.repetitions,
              plannedAmount: exercise.amount,
              plannedUnit: exercise.unit,
              plannedComment: exercise.comment,
              performed: true,
              actualSets: exercise.sets,
              actualRepetitions: exercise.repetitions,
              actualAmount: exercise.amount,
              actualUnit: exercise.unit,
              actualComment: exercise.comment,
            }),
          ),
        ),
      });
    }),
  );
}

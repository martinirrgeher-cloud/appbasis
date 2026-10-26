import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingDocumentationRepository,
  TrainingDocumentationService,
} from "@appbasis/training-documentation";
import type {
  TrainingPlanSnapshot,
} from "@appbasis/training-plans";

import {
  createUlcTrainingDocumentationService,
  UlcTrainingDocumentationPlanNotFoundError,
} from "../worker/training-documentation-service";
import type { UlcTrainingPlanService } from "../worker/training-plans-service";

const PLAN: TrainingPlanSnapshot = Object.freeze({
  id: "plan-1",
  organizationId: "org-1",
  subjectId: "athlete-1",
  planDate: "2026-10-26",
  currentRevision: 3,
  createdAt: "2026-10-25T10:00:00.000Z",
  updatedAt: "2026-10-25T11:00:00.000Z",
  revision: Object.freeze({
    organizationId: "org-1",
    planId: "plan-1",
    revision: 3,
    note: "Planhinweis",
    createdAt: "2026-10-25T11:00:00.000Z",
    items: Object.freeze([
      Object.freeze({
        kind: "exercise" as const,
        itemId: "item-1",
        sourceExerciseId: "exercise-1",
        name: "30 m Sprint",
        sets: "2",
        repetitions: "4",
        amount: "30",
        unit: "m",
        comment: "locker",
        sortOrder: 0,
      }),
      Object.freeze({
        kind: "block" as const,
        itemId: "block-item-1",
        sourceBlockId: "block-1",
        sourceBlockRevision: 2,
        name: "Sprung",
        durationMinutes: 20,
        note: "Technik",
        sortOrder: 1,
        exercises: Object.freeze([]),
      }),
    ]),
  }),
});

function planService(plan: TrainingPlanSnapshot | undefined = PLAN) {
  return {
    async listSubjects() {
      return Object.freeze([
        Object.freeze({
          id: "athlete-1",
          firstName: "Anna",
          lastName: "Beispiel",
          displayName: "Anna Beispiel",
        }),
      ]);
    },
    async findCurrentBySubjectDate() {
      return plan;
    },
    async listAttendanceForSubjectDateRange() {
      return Object.freeze([
        Object.freeze({
          sessionId: "session-1",
          sessionDate: "2026-10-26",
          status: "present" as const,
        }),
      ]);
    },
  } as unknown as UlcTrainingPlanService;
}

function documentationService() {
  let id = 0;
  return new TrainingDocumentationService({
    repository: new InMemoryTrainingDocumentationRepository(),
    createId: () => "documentation-" + String(++id),
    now: () => new Date("2026-10-26T09:00:00.000Z"),
  });
}

describe("ULC training documentation adapter", () => {
  it("starts from the exact plan revision and copies actual defaults", async () => {
    const service = createUlcTrainingDocumentationService({
      documentation: documentationService(),
      plans: planService(),
    });

    const started = await service.start(
      "org-1",
      "athlete-1",
      "2026-10-26",
    );

    expect(started).toMatchObject({
      subjectId: "athlete-1",
      sourcePlanId: "plan-1",
      sourcePlanRevision: 3,
      status: "draft",
      revision: {
        note: "Planhinweis",
        attendance: [
          {
            participantId: "athlete-1",
            displayName: "Anna Beispiel",
            status: "present",
          },
        ],
        items: [
          {
            kind: "exercise",
            name: "30 m Sprint",
            plannedRepetitions: "4",
            actualRepetitions: "4",
            performed: true,
          },
          {
            kind: "block",
            name: "Sprung",
            plannedDurationMinutes: 20,
            actualDurationMinutes: 20,
            performed: true,
          },
        ],
      },
    });
  });

  it("returns the existing documentation on repeated start", async () => {
    const documentation = documentationService();
    const service = createUlcTrainingDocumentationService({
      documentation,
      plans: planService(),
    });

    const first = await service.start(
      "org-1",
      "athlete-1",
      "2026-10-26",
    );
    const second = await service.start(
      "org-1",
      "athlete-1",
      "2026-10-26",
    );

    expect(second.id).toBe(first.id);
    expect(second.currentRevision).toBe(1);
  });

  it("requires a persisted training plan before documentation starts", async () => {
    const service = createUlcTrainingDocumentationService({
      documentation: documentationService(),
      plans: planService(undefined),
    });

    await expect(
      service.start("org-1", "athlete-1", "2026-10-26"),
    ).rejects.toBeInstanceOf(UlcTrainingDocumentationPlanNotFoundError);
  });
});

import { describe, expect, it } from "vitest";

import type {
  Athlete,
  AthleteMasterdataSnapshot,
} from "@appbasis/athletes";
import type { ExerciseCatalogItem } from "@appbasis/exercise-catalog";
import {
  InMemoryTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanService,
} from "@appbasis/training-plans";

import {
  createUlcTrainingPlanService,
  UlcTrainingPlanReferenceError,
} from "../worker/training-plans-service";

const ACTIVE_ATHLETE: Athlete = Object.freeze({
  id: "athlete-active",
  organizationId: "org-1",
  firstName: "Anna",
  lastName: "Ziel",
  birthYear: 2010,
  notes: null,
  isActive: true,
});

const SECOND_ATHLETE: Athlete = Object.freeze({
  id: "athlete-second",
  organizationId: "org-1",
  firstName: "Berta",
  lastName: "Alpha",
  birthYear: 2011,
  notes: null,
  isActive: true,
});

const INACTIVE_ATHLETE: Athlete = Object.freeze({
  id: "athlete-inactive",
  organizationId: "org-1",
  firstName: "Ines",
  lastName: "Inaktiv",
  birthYear: 2009,
  notes: null,
  isActive: false,
});

const FOREIGN_ATHLETE: Athlete = Object.freeze({
  id: "athlete-foreign",
  organizationId: "org-2",
  firstName: "Fremd",
  lastName: "Verein",
  birthYear: 2010,
  notes: null,
  isActive: true,
});

function catalogItem(
  id: string,
  overrides: Partial<ExerciseCatalogItem> = {},
): ExerciseCatalogItem {
  return Object.freeze({
    id,
    organizationId: "org-1",
    name: id,
    categoryKey: "speed",
    subcategory: null,
    difficultyKey: null,
    goal: null,
    description: null,
    coachingCues: null,
    commonMistakes: null,
    equipment: Object.freeze([]),
    videoUrl: null,
    videoUrls: Object.freeze([]),
    audienceIds: Object.freeze([]),
    similarExerciseIds: Object.freeze([]),
    parameters: Object.freeze([]),
    isActive: true,
    ...overrides,
  });
}

function createService(input: {
  athletes?: readonly Athlete[];
  exercises?: readonly ExerciseCatalogItem[];
  attendanceEntries?: readonly {
    sessionDate: string;
    moduleId: "kindertraining" | "u12" | "u14";
    groupId: string;
    groupName: string;
    groupShortName: string | null;
    sessionState: "scheduled" | "cancelled";
    status: "open" | "present" | "excused" | "absent";
  }[];
  ids?: readonly string[];
} = {}) {
  const repository = new InMemoryTrainingPlanRepository();
  let idIndex = 0;
  let catalogReadCount = 0;
  const attendanceCalls: unknown[] = [];
  const ids = input.ids ?? [
    "plan-1",
    "item-1",
    "item-2",
    "item-3",
    "copy-plan",
    "copy-item",
  ];
  const plans = new TrainingPlanService({
    repository,
    createId: () => ids[idIndex++] ?? `generated-${idIndex}`,
    now: () => new Date("2026-10-12T12:00:00.000Z"),
  });
  const athletes = input.athletes ?? [
    ACTIVE_ATHLETE,
    SECOND_ATHLETE,
    INACTIVE_ATHLETE,
    FOREIGN_ATHLETE,
  ];
  const exercises = input.exercises ?? [
    catalogItem("exercise-1"),
    catalogItem("exercise-2"),
  ];
  const snapshot: Pick<AthleteMasterdataSnapshot, "athletes"> = {
    athletes,
  };

  return {
    plans,
    getCatalogReadCount: () => catalogReadCount,
    getAttendanceCalls: () => attendanceCalls.slice(),
    service: createUlcTrainingPlanService({
      plans,
      masterdata: {
        async readOrganizationSnapshot() {
          return snapshot;
        },
      },
      exerciseCatalog: {
        async listItems() {
          catalogReadCount += 1;
          return exercises;
        },
      },
      attendance: {
        async listForSubjectDateRange(
          organizationId,
          subjectId,
          fromDate,
          toDate,
        ) {
          attendanceCalls.push({
            organizationId,
            subjectId,
            fromDate,
            toDate,
          });
          return input.attendanceEntries ?? [];
        },
      },
    }),
  };
}

describe("ULC training plan adapter", () => {
  it("lists only active same-organization athletes in a stable display order", async () => {
    const { service } = createService();

    await expect(service.listSubjects("org-1")).resolves.toEqual([
      {
        id: "athlete-second",
        firstName: "Berta",
        lastName: "Alpha",
        displayName: "Alpha, Berta",
      },
      {
        id: "athlete-active",
        firstName: "Anna",
        lastName: "Ziel",
        displayName: "Ziel, Anna",
      },
    ]);
  });

  it("supplies attendance only for an active same-organization subject and exact date range", async () => {
    const attendanceEntries = [
      {
        sessionDate: "2026-10-12",
        moduleId: "u12" as const,
        groupId: "group-u12",
        groupName: "U12",
        groupShortName: "U12",
        sessionState: "scheduled" as const,
        status: "present" as const,
      },
    ];
    const { service, getAttendanceCalls } = createService({
      attendanceEntries,
    });

    await expect(
      service.listAttendanceForSubjectDateRange(
        "org-1",
        ACTIVE_ATHLETE.id,
        "2026-10-12",
        "2026-10-18",
      ),
    ).resolves.toEqual(attendanceEntries);
    expect(getAttendanceCalls()).toEqual([
      {
        organizationId: "org-1",
        subjectId: ACTIVE_ATHLETE.id,
        fromDate: "2026-10-12",
        toDate: "2026-10-18",
      },
    ]);

    await expect(
      service.listAttendanceForSubjectDateRange(
        "org-1",
        INACTIVE_ATHLETE.id,
        "2026-10-12",
        "2026-10-18",
      ),
    ).rejects.toMatchObject({
      referenceType: "subject",
      referenceId: INACTIVE_ATHLETE.id,
    });
    expect(getAttendanceCalls()).toHaveLength(1);
  });

  it("creates plans only for an active same-organization athlete and validates sourced catalog exercises", async () => {
    const { plans, service, getCatalogReadCount } = createService();

    await expect(
      service.create("org-1", {
        subjectId: ACTIVE_ATHLETE.id,
        planDate: "2026-10-12",
        items: [
          {
            kind: "exercise",
            sourceExerciseId: "exercise-1",
            name: "30 m",
            repetitions: "3",
          },
          {
            kind: "exercise",
            name: "Manuell",
            amount: "10",
            unit: "min",
          },
        ],
      }),
    ).resolves.toMatchObject({
      subjectId: ACTIVE_ATHLETE.id,
      revision: {
        items: [
          { sourceExerciseId: "exercise-1" },
          { sourceExerciseId: null },
        ],
      },
    });
    expect(getCatalogReadCount()).toBe(1);

    await expect(
      service.create("org-1", {
        subjectId: INACTIVE_ATHLETE.id,
        planDate: "2026-10-13",
      }),
    ).rejects.toMatchObject({
      name: "UlcTrainingPlanReferenceError",
      referenceType: "subject",
      referenceId: INACTIVE_ATHLETE.id,
    });
    await expect(
      service.create("org-1", {
        subjectId: FOREIGN_ATHLETE.id,
        planDate: "2026-10-14",
      }),
    ).rejects.toBeInstanceOf(UlcTrainingPlanReferenceError);

    await expect(
      plans.findCurrentBySubjectDate(
        "org-1",
        INACTIVE_ATHLETE.id,
        "2026-10-13",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects missing, inactive and foreign new exercise references before persistence", async () => {
    for (const item of [
      undefined,
      catalogItem("exercise-bad", { isActive: false }),
      catalogItem("exercise-bad", { organizationId: "org-2" }),
    ]) {
      const exercises = item === undefined ? [] : [item];
      const { plans, service } = createService({ exercises });
      await expect(
        service.create("org-1", {
          subjectId: ACTIVE_ATHLETE.id,
          planDate: "2026-10-12",
          items: [
            {
              kind: "exercise",
              sourceExerciseId: "exercise-bad",
              name: "Ungültig",
            },
          ],
        }),
      ).rejects.toMatchObject({
        referenceType: "exercise",
        referenceId: "exercise-bad",
      });
      await expect(
        plans.findCurrentBySubjectDate(
          "org-1",
          ACTIVE_ATHLETE.id,
          "2026-10-12",
        ),
      ).resolves.toBeUndefined();
    }
  });

  it("reports stale revisions before resolving changed catalog references", async () => {
    const base = createService();
    const created = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-12",
      items: [
        {
          kind: "exercise",
          sourceExerciseId: "exercise-1",
          name: "30 m",
        },
      ],
    });
    await base.plans.update("org-1", created.id, 1, {
      items: [
        {
          kind: "exercise",
          itemId: created.revision.items[0]!.itemId,
          sourceExerciseId: "exercise-1",
          name: "30 m",
          repetitions: "4",
        },
      ],
    });

    let catalogReads = 0;
    const stale = createUlcTrainingPlanService({
      plans: base.plans,
      masterdata: {
        async readOrganizationSnapshot() {
          return { athletes: [ACTIVE_ATHLETE] };
        },
      },
      exerciseCatalog: {
        async listItems() {
          catalogReads += 1;
          return [];
        },
      },
      attendance: {
        async listForSubjectDateRange() {
          return [];
        },
      },
    });

    await expect(
      stale.update("org-1", created.id, 1, {
        items: [
          {
            kind: "exercise",
            itemId: created.revision.items[0]!.itemId,
            sourceExerciseId: "missing",
            name: "Stale",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TrainingPlanConflictError);
    expect(catalogReads).toBe(0);
  });

  it("keeps existing catalog provenance editable if the catalog item later becomes inactive, but validates changed provenance", async () => {
    const base = createService();
    const created = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-12",
      items: [
        {
          kind: "exercise",
          sourceExerciseId: "exercise-1",
          name: "30 m",
          repetitions: "3",
        },
      ],
    });
    const exerciseItem = created.revision.items[0]!;
    if (exerciseItem.kind !== "exercise") {
      throw new Error("Expected exercise fixture.");
    }

    let catalogReads = 0;
    const lifecycleAware = createUlcTrainingPlanService({
      plans: base.plans,
      masterdata: {
        async readOrganizationSnapshot() {
          return { athletes: [ACTIVE_ATHLETE] };
        },
      },
      exerciseCatalog: {
        async listItems() {
          catalogReads += 1;
          return [catalogItem("exercise-1", { isActive: false })];
        },
      },
      attendance: {
        async listForSubjectDateRange() {
          return [];
        },
      },
    });

    const updated = await lifecycleAware.update("org-1", created.id, 1, {
      items: [
        {
          kind: "exercise",
          itemId: exerciseItem.itemId,
          sourceExerciseId: "exercise-1",
          name: "30 m angepasst",
          repetitions: "4",
        },
      ],
    });
    expect(updated?.currentRevision).toBe(2);
    expect(catalogReads).toBe(0);

    await expect(
      lifecycleAware.update("org-1", created.id, 2, {
        items: [
          {
            kind: "exercise",
            itemId: exerciseItem.itemId,
            sourceExerciseId: "exercise-new",
            name: "Neue Quelle",
          },
        ],
      }),
    ).rejects.toMatchObject({
      referenceType: "exercise",
      referenceId: "exercise-new",
    });
    expect(catalogReads).toBe(1);
  });

  it("copies an existing snapshot without revalidating old provenance, but requires an active target athlete", async () => {
    const base = createService({
      ids: [
        "source-plan",
        "source-item",
        "copy-plan",
        "copy-item",
      ],
    });
    const created = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-12",
      items: [
        {
          kind: "exercise",
          sourceExerciseId: "exercise-1",
          name: "30 m",
        },
      ],
    });

    const lifecycleAware = createUlcTrainingPlanService({
      plans: base.plans,
      masterdata: {
        async readOrganizationSnapshot() {
          return {
            athletes: [ACTIVE_ATHLETE, SECOND_ATHLETE, INACTIVE_ATHLETE],
          };
        },
      },
      exerciseCatalog: {
        async listItems() {
          return [];
        },
      },
      attendance: {
        async listForSubjectDateRange() {
          return [];
        },
      },
    });

    await expect(
      lifecycleAware.copyCurrentTo(
        "org-1",
        created.id,
        SECOND_ATHLETE.id,
        "2026-10-13",
      ),
    ).resolves.toMatchObject({
      id: "copy-plan",
      subjectId: SECOND_ATHLETE.id,
      revision: {
        items: [{ sourceExerciseId: "exercise-1" }],
      },
    });

    await expect(
      lifecycleAware.copyCurrentTo(
        "org-1",
        created.id,
        INACTIVE_ATHLETE.id,
        "2026-10-14",
      ),
    ).rejects.toMatchObject({
      referenceType: "subject",
      referenceId: INACTIVE_ATHLETE.id,
    });
  });
});

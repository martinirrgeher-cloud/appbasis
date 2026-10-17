import { describe, expect, it } from "vitest";

import type {
  Athlete,
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";
import type {
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
} from "@appbasis/exercise-catalog";
import type { TrainingBlockSnapshot } from "@appbasis/training-blocks";
import {
  InMemoryTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanService,
} from "@appbasis/training-plans";

import {
  createUlcTrainingPlanService,
  UlcTrainingPlanReferenceError,
} from "../worker/training-plans-service";
import type { UlcTrainingAttendanceSummary } from "../worker/training-session-postgres";

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

const ACTIVE_GROUP: TrainingGroup = Object.freeze({
  id: "group-active",
  organizationId: "org-1",
  name: "U16",
  shortName: "U16",
  description: null,
  isActive: true,
  sortOrder: 10,
});

const INACTIVE_GROUP: TrainingGroup = Object.freeze({
  ...ACTIVE_GROUP,
  id: "group-inactive",
  name: "Archiv",
  shortName: null,
  isActive: false,
});

function parameter(
  key: string,
  overrides: Partial<ExerciseCatalogParameter> = {},
): ExerciseCatalogParameter {
  return Object.freeze({
    key,
    label: key,
    unit: "",
    inputType: "number",
    defaultValue: null,
    minValue: null,
    maxValue: null,
    stepValue: null,
    isRequired: false,
    sortOrder: 10,
    ...overrides,
  });
}

function blockSnapshot(
  overrides: Partial<TrainingBlockSnapshot> = {},
): TrainingBlockSnapshot {
  const revision = overrides.revision ?? Object.freeze({
    organizationId: "org-1",
    blockId: overrides.id ?? "block-1",
    revision: overrides.currentRevision ?? 3,
    name: "Sprintblock",
    audienceId: "group-active",
    durationMinutes: 25,
    note: "Blocknotiz",
    exercises: Object.freeze([]),
    createdAt: "2026-10-10T11:00:00.000Z",
  });
  return Object.freeze({
    id: "block-1",
    organizationId: "org-1",
    isActive: true,
    currentRevision: 3,
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T11:00:00.000Z",
    ...overrides,
    revision,
  });
}

const EMPTY_BLOCK_READER = Object.freeze({
  async list() {
    return [] as readonly TrainingBlockSnapshot[];
  },
  async findCurrent() {
    return undefined;
  },
  async listAudiences() {
    return [];
  },
  async create() {
    throw new Error("Unexpected training block create.");
  },
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
  ids?: readonly string[];
  attendance?: readonly UlcTrainingAttendanceSummary[];
  groups?: readonly TrainingGroup[];
  blocks?: readonly TrainingBlockSnapshot[];
} = {}) {
  const repository = new InMemoryTrainingPlanRepository();
  let idIndex = 0;
  let catalogReadCount = 0;
  let attendanceReadCount = 0;
  const createdBlockInputs: unknown[] = [];
  let createdBlockIndex = 0;
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
  const groups = input.groups ?? [ACTIVE_GROUP, INACTIVE_GROUP];
  const blockRows = input.blocks ?? [];
  const snapshot: Pick<
    AthleteMasterdataSnapshot,
    "athletes" | "trainingGroups"
  > = {
    athletes,
    trainingGroups: groups,
  };

  const attendanceRows = input.attendance ?? [];

  return {
    plans,
    getCatalogReadCount: () => catalogReadCount,
    getAttendanceReadCount: () => attendanceReadCount,
    getCreatedBlockInputs: () => createdBlockInputs.slice(),
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
        async listAttendanceForAthleteDateRange() {
          attendanceReadCount += 1;
          return attendanceRows;
        },
      },
      blocks: {
        async list() {
          return blockRows;
        },
        async findCurrent(_organizationId, blockId) {
          return blockRows.find((block) => block.id === blockId);
        },
        async listAudiences(organizationId) {
          return groups
            .filter(
              (group) =>
                group.organizationId === organizationId &&
                group.isActive,
            )
            .map((group) => ({
              id: group.id,
              name: group.name,
              shortName: group.shortName,
            }));
        },
        async create(organizationId, input) {
          createdBlockInputs.push({ organizationId, input });
          createdBlockIndex += 1;
          const id = "saved-block-" + String(createdBlockIndex);
          const exercises = (input.exercises ?? []).map(
            (exercise, index) => ({
              itemId: id + "-item-" + String(index + 1),
              exerciseId: exercise.exerciseId,
              note: exercise.note ?? null,
              parameterOverrides: (exercise.parameterOverrides ?? []).map(
                (override, overrideIndex) => ({
                  key: override.key,
                  value: override.value,
                  sortOrder: overrideIndex,
                }),
              ),
              sortOrder: index,
            }),
          );
          return Object.freeze({
            id,
            organizationId,
            isActive: true,
            currentRevision: 1,
            createdAt: "2026-10-16T20:00:00.000Z",
            updatedAt: "2026-10-16T20:00:00.000Z",
            revision: Object.freeze({
              organizationId,
              blockId: id,
              revision: 1,
              name: input.name,
              audienceId: input.audienceId ?? null,
              durationMinutes: input.durationMinutes ?? null,
              note: input.note ?? null,
              exercises: Object.freeze(exercises),
              createdAt: "2026-10-16T20:00:00.000Z",
            }),
          });
        },
      },
    }),
  };
}

describe("ULC training plan block template adoption", () => {
  it("lists only current active adoptable templates and materializes plan-owned values", async () => {
    const exercise = catalogItem("exercise-1", {
      name: "Fliegende 30 m",
      parameters: Object.freeze([
        parameter("sets", {
          label: "Sätze",
          defaultValue: "3",
          sortOrder: 10,
        }),
        parameter("repetitions", {
          label: "Wiederholungen",
          defaultValue: "4",
          sortOrder: 20,
        }),
        parameter("distance_m", {
          label: "Distanz",
          unit: "m",
          defaultValue: "30",
          sortOrder: 30,
        }),
        parameter("rest_s", {
          label: "Pause",
          unit: "s",
          defaultValue: "90",
          sortOrder: 40,
        }),
      ]),
    });
    const block = blockSnapshot({
      revision: Object.freeze({
        organizationId: "org-1",
        blockId: "block-1",
        revision: 3,
        name: "Sprintblock",
        audienceId: "group-active",
        durationMinutes: 25,
        note: "Blocknotiz",
        exercises: Object.freeze([
          {
            itemId: "block-exercise-1",
            exerciseId: "exercise-1",
            note: "Locker anlaufen",
            parameterOverrides: Object.freeze([
              { key: "sets", value: "5", sortOrder: 0 },
              { key: "distance_m", value: "40", sortOrder: 1 },
            ]),
            sortOrder: 0,
          },
        ]),
        createdAt: "2026-10-10T11:00:00.000Z",
      }),
    });
    const { service } = createService({
      exercises: [exercise],
      blocks: [
        block,
        blockSnapshot({
          id: "block-archived",
          isActive: false,
          revision: Object.freeze({
            ...block.revision,
            blockId: "block-archived",
            name: "Archiviert",
          }),
        }),
        blockSnapshot({
          id: "block-inactive-group",
          revision: Object.freeze({
            ...block.revision,
            blockId: "block-inactive-group",
            name: "Falsche Gruppe",
            audienceId: "group-inactive",
          }),
        }),
      ],
    });

    await expect(service.listBlockTemplates("org-1")).resolves.toEqual([
      {
        id: "block-1",
        currentRevision: 3,
        name: "Sprintblock",
        audienceName: "U16",
        durationMinutes: 25,
        exerciseCount: 1,
      },
    ]);

    await expect(
      service.findBlockTemplate("org-1", "block-1", 3),
    ).resolves.toEqual({
      id: "block-1",
      currentRevision: 3,
      item: {
        kind: "block",
        sourceBlockId: "block-1",
        sourceBlockRevision: 3,
        name: "Sprintblock",
        durationMinutes: 25,
        note: "Blocknotiz",
        exercises: [
          {
            sourceExerciseId: "exercise-1",
            name: "Fliegende 30 m",
            sets: "5",
            repetitions: "4",
            amount: "40",
            unit: "m",
            comment:
              "Locker anlaufen\nPlanwerte: Distanz: 40 m · Pause: 90 s",
          },
        ],
      },
    });
  });

  it("preserves long text parameters without forcing them into the compact amount field", async () => {
    const longNote = "x".repeat(500);
    const exercise = catalogItem("exercise-1", {
      parameters: Object.freeze([
        parameter("note_text", {
          label: "Zusatzhinweis",
          inputType: "text",
          defaultValue: null,
          sortOrder: 5,
        }),
        parameter("distance_m", {
          label: "Distanz",
          unit: "m",
          defaultValue: "30",
          sortOrder: 10,
        }),
      ]),
    });
    const block = blockSnapshot({
      revision: Object.freeze({
        organizationId: "org-1",
        blockId: "block-1",
        revision: 3,
        name: "Textblock",
        audienceId: "group-active",
        durationMinutes: null,
        note: null,
        exercises: Object.freeze([
          {
            itemId: "occurrence-long-text",
            exerciseId: "exercise-1",
            note: null,
            parameterOverrides: Object.freeze([
              { key: "note_text", value: longNote, sortOrder: 0 },
            ]),
            sortOrder: 0,
          },
        ]),
        createdAt: "2026-10-10T12:00:00.000Z",
      }),
    });
    const { service } = createService({
      exercises: [exercise],
      blocks: [block],
    });

    const template = await service.findBlockTemplate(
      "org-1",
      "block-1",
      3,
    );
    expect(template).toBeDefined();
    expect(template?.item.exercises?.[0]).toMatchObject({
      amount: "30",
      unit: "m",
    });
    expect(template?.item.exercises?.[0]?.comment).toContain(
      "Zusatzhinweis: " + longNote,
    );
    expect(template?.item.exercises?.[0]?.comment).toContain(
      "Distanz: 30 m",
    );
  });

  it("requires the exact current template revision for a new sourced plan block", async () => {
    const exercise = catalogItem("exercise-1");
    const block = blockSnapshot({
      currentRevision: 4,
      revision: Object.freeze({
        organizationId: "org-1",
        blockId: "block-1",
        revision: 4,
        name: "Aktuell",
        audienceId: "group-active",
        durationMinutes: null,
        note: null,
        exercises: Object.freeze([
          {
            itemId: "occurrence-1",
            exerciseId: "exercise-1",
            note: null,
            parameterOverrides: Object.freeze([]),
            sortOrder: 0,
          },
        ]),
        createdAt: "2026-10-10T12:00:00.000Z",
      }),
    });
    const { service } = createService({
      exercises: [exercise],
      blocks: [block],
    });

    await expect(
      service.create("org-1", {
        subjectId: ACTIVE_ATHLETE.id,
        planDate: "2026-10-12",
        items: [
          {
            kind: "block",
            sourceBlockId: "block-1",
            sourceBlockRevision: 3,
            name: "Client snapshot",
            exercises: [
              {
                sourceExerciseId: "exercise-1",
                name: "exercise-1",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      referenceType: "block",
      referenceId: "block-1",
    });

    await expect(
      service.create("org-1", {
        subjectId: ACTIVE_ATHLETE.id,
        planDate: "2026-10-13",
        items: [
          {
            kind: "block",
            sourceBlockId: "block-1",
            sourceBlockRevision: 4,
            name: "Aktuell",
            durationMinutes: null,
            note: null,
            exercises: [
              {
                sourceExerciseId: "exercise-1",
                name: "exercise-1",
              },
            ],
          },
        ],
      }),
    ).resolves.toMatchObject({
      revision: {
        items: [
          {
            sourceBlockId: "block-1",
            sourceBlockRevision: 4,
          },
        ],
      },
    });

    await expect(
      service.create("org-1", {
        subjectId: ACTIVE_ATHLETE.id,
        planDate: "2026-10-14",
        items: [
          {
            kind: "block",
            sourceBlockId: "block-1",
            sourceBlockRevision: 4,
            name: "Inhalt manipuliert",
            durationMinutes: null,
            note: null,
            exercises: [
              {
                sourceExerciseId: "exercise-1",
                name: "exercise-1",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      referenceType: "block",
      referenceId: "block-1",
    });
  });

  it("keeps an adopted snapshot editable after its template changes and rejects provenance tampering", async () => {
    const block = blockSnapshot();
    const base = createService({
      blocks: [block],
      ids: ["plan-block", "plan-block-item"],
    });
    const created = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          sourceBlockId: "block-1",
          sourceBlockRevision: 3,
          name: "Sprintblock",
          durationMinutes: 25,
          note: "Blocknotiz",
          exercises: [],
        },
      ],
    });
    const saved = created.revision.items[0];
    if (saved?.kind !== "block") {
      throw new Error("Expected block fixture.");
    }

    const afterTemplateChange = createUlcTrainingPlanService({
      plans: base.plans,
      masterdata: {
        async readOrganizationSnapshot() {
          return {
            athletes: [ACTIVE_ATHLETE],
            trainingGroups: [ACTIVE_GROUP],
          };
        },
      },
      exerciseCatalog: {
        async listItems() {
          return [];
        },
      },
      attendance: {
        async listAttendanceForAthleteDateRange() {
          return [];
        },
      },
      blocks: EMPTY_BLOCK_READER,
    });

    await expect(
      afterTemplateChange.update("org-1", created.id, 1, {
        items: [
          {
            kind: "block",
            itemId: saved.itemId,
            sourceBlockId: "block-1",
            sourceBlockRevision: 3,
            name: "Snapshot lokal geändert",
            exercises: [],
          },
        ],
      }),
    ).resolves.toMatchObject({ currentRevision: 2 });

    await expect(
      afterTemplateChange.update("org-1", created.id, 2, {
        items: [
          {
            kind: "block",
            itemId: saved.itemId,
            sourceBlockId: "block-other",
            sourceBlockRevision: 3,
            name: "Manipuliert",
            exercises: [],
          },
        ],
      }),
    ).rejects.toMatchObject({
      referenceType: "block",
      referenceId: "block-other",
    });
  });
});

describe("ULC training plan block template save-back", () => {
  it("creates a new template from the exact persisted plan block and maps unambiguous plan values", async () => {
    const exercise = catalogItem("exercise-1", {
      parameters: Object.freeze([
        parameter("sets", {
          label: "Sätze",
          sortOrder: 10,
        }),
        parameter("repetitions", {
          label: "Wiederholungen",
          sortOrder: 20,
        }),
        parameter("distance_m", {
          label: "Distanz",
          unit: "m",
          sortOrder: 30,
        }),
      ]),
    });
    const base = createService({
      exercises: [exercise],
      ids: ["plan-save-back", "plan-block", "plan-exercise"],
    });
    const plan = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-16",
      items: [
        {
          kind: "block",
          name: "Planblock",
          durationMinutes: 35,
          note: "Blocknotiz",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "30 m",
              sets: "4",
              repetitions: "3",
              amount: "40",
              unit: "m",
              comment: "Locker anlaufen",
            },
          ],
        },
      ],
    });
    const block = plan.revision.items[0];
    if (block?.kind !== "block") {
      throw new Error("Expected persisted plan block.");
    }

    await expect(
      base.service.saveBlockAsTemplate("org-1", {
        planId: plan.id,
        blockItemId: block.itemId,
        expectedRevision: 1,
        audienceId: ACTIVE_GROUP.id,
        name: "Neue Sprintvorlage",
      }),
    ).resolves.toEqual({
      id: "saved-block-1",
      currentRevision: 1,
      name: "Neue Sprintvorlage",
      audienceId: ACTIVE_GROUP.id,
      audienceName: ACTIVE_GROUP.name,
      durationMinutes: 35,
      exerciseCount: 1,
    });
    expect(base.getCreatedBlockInputs()).toEqual([
      {
        organizationId: "org-1",
        input: {
          name: "Neue Sprintvorlage",
          audienceId: ACTIVE_GROUP.id,
          durationMinutes: 35,
          note: "Blocknotiz",
          exercises: [
            {
              exerciseId: "exercise-1",
              note: "Locker anlaufen",
              parameterOverrides: [
                { key: "sets", value: "4" },
                { key: "repetitions", value: "3" },
                { key: "distance_m", value: "40" },
              ],
            },
          ],
        },
      },
    ]);
  });

  it("uses the persisted block name by default and never updates source provenance", async () => {
    const exercise = catalogItem("exercise-1");
    const base = createService({
      exercises: [exercise],
      ids: ["plan-manual-block", "plan-block"],
    });
    const plan = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-16",
      items: [
        {
          kind: "block",
          name: "Eigener Planblock",
          exercises: [],
        },
      ],
    });
    const block = plan.revision.items[0];
    if (block?.kind !== "block") throw new Error("Expected block.");

    const saved = await base.service.saveBlockAsTemplate("org-1", {
      planId: plan.id,
      blockItemId: block.itemId,
      expectedRevision: plan.currentRevision,
      audienceId: ACTIVE_GROUP.id,
    });
    expect(saved).toMatchObject({
      id: "saved-block-1",
      currentRevision: 1,
      name: "Eigener Planblock",
    });
    expect(base.getCreatedBlockInputs()[0]).toMatchObject({
      input: {
        name: "Eigener Planblock",
      },
    });
  });

  it("fails closed for manual exercises and ambiguous amount/unit mappings", async () => {
    const manual = createService({
      ids: ["plan-manual", "block-manual", "exercise-manual"],
    });
    const manualPlan = await manual.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-16",
      items: [
        {
          kind: "block",
          name: "Nicht wiederverwendbar",
          exercises: [
            {
              name: "Manuell",
              amount: "10",
              unit: "m",
            },
          ],
        },
      ],
    });
    const manualBlock = manualPlan.revision.items[0];
    if (manualBlock?.kind !== "block") throw new Error("Expected block.");
    await expect(
      manual.service.saveBlockAsTemplate("org-1", {
        planId: manualPlan.id,
        blockItemId: manualBlock.itemId,
        expectedRevision: 1,
        audienceId: ACTIVE_GROUP.id,
      }),
    ).rejects.toMatchObject({
      reason: "manual-exercise",
    });
    expect(manual.getCreatedBlockInputs()).toEqual([]);

    const ambiguousExercise = catalogItem("exercise-ambiguous", {
      parameters: Object.freeze([
        parameter("work_s", { unit: "s", sortOrder: 10 }),
        parameter("rest_s", { unit: "s", sortOrder: 20 }),
      ]),
    });
    const ambiguous = createService({
      exercises: [ambiguousExercise],
      ids: ["plan-ambiguous", "block-ambiguous", "exercise-ambiguous-item"],
    });
    const ambiguousPlan = await ambiguous.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-17",
      items: [
        {
          kind: "block",
          name: "Mehrdeutig",
          exercises: [
            {
              sourceExerciseId: "exercise-ambiguous",
              name: "Intervall",
              amount: "30",
              unit: "s",
            },
          ],
        },
      ],
    });
    const ambiguousBlock = ambiguousPlan.revision.items[0];
    if (ambiguousBlock?.kind !== "block") throw new Error("Expected block.");
    await expect(
      ambiguous.service.saveBlockAsTemplate("org-1", {
        planId: ambiguousPlan.id,
        blockItemId: ambiguousBlock.itemId,
        expectedRevision: 1,
        audienceId: ACTIVE_GROUP.id,
      }),
    ).rejects.toMatchObject({
      reason: "parameter-ambiguous",
      referenceId: "exercise-ambiguous",
    });
    expect(ambiguous.getCreatedBlockInputs()).toEqual([]);
  });

  it("rejects stale plan revisions before creating a template", async () => {
    const base = createService({
      ids: ["plan-stale-save", "block-stale-save"],
    });
    const plan = await base.service.create("org-1", {
      subjectId: ACTIVE_ATHLETE.id,
      planDate: "2026-10-16",
      items: [{ kind: "block", name: "Block", exercises: [] }],
    });
    const block = plan.revision.items[0];
    if (block?.kind !== "block") throw new Error("Expected block.");
    await base.plans.update("org-1", plan.id, 1, {
      items: [
        {
          kind: "block",
          itemId: block.itemId,
          name: "Geändert",
          exercises: [],
        },
      ],
    });

    await expect(
      base.service.saveBlockAsTemplate("org-1", {
        planId: plan.id,
        blockItemId: block.itemId,
        expectedRevision: 1,
        audienceId: ACTIVE_GROUP.id,
      }),
    ).rejects.toBeInstanceOf(TrainingPlanConflictError);
    expect(base.getCreatedBlockInputs()).toEqual([]);
  });
});

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

  it("reads attendance only for an active same-organization subject", async () => {
    const { service, getAttendanceReadCount } = createService({
      attendance: [
        {
          sessionId: "session-1",
          sessionDate: "2026-10-12",
          status: "present",
        },
        {
          sessionId: "session-2",
          sessionDate: "2026-10-14",
          status: "excused",
        },
      ],
    });

    await expect(
      service.listAttendanceForSubjectDateRange(
        "org-1",
        ACTIVE_ATHLETE.id,
        "2026-10-12",
        "2026-10-18",
      ),
    ).resolves.toEqual([
      {
        sessionId: "session-1",
        sessionDate: "2026-10-12",
        status: "present",
      },
      {
        sessionId: "session-2",
        sessionDate: "2026-10-14",
        status: "excused",
      },
    ]);
    expect(getAttendanceReadCount()).toBe(1);

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
    expect(getAttendanceReadCount()).toBe(1);
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
          return {
            athletes: [ACTIVE_ATHLETE],
            trainingGroups: [ACTIVE_GROUP],
          };
        },
      },
      exerciseCatalog: {
        async listItems() {
          catalogReads += 1;
          return [];
        },
      },
      attendance: {
        async listAttendanceForAthleteDateRange() {
          return [];
        },
      },
      blocks: EMPTY_BLOCK_READER,
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
          return {
            athletes: [ACTIVE_ATHLETE],
            trainingGroups: [ACTIVE_GROUP],
          };
        },
      },
      exerciseCatalog: {
        async listItems() {
          catalogReads += 1;
          return [catalogItem("exercise-1", { isActive: false })];
        },
      },
      attendance: {
        async listAttendanceForAthleteDateRange() {
          return [];
        },
      },
      blocks: EMPTY_BLOCK_READER,
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
            trainingGroups: [ACTIVE_GROUP],
          };
        },
      },
      exerciseCatalog: {
        async listItems() {
          return [];
        },
      },
      attendance: {
        async listAttendanceForAthleteDateRange() {
          return [];
        },
      },
      blocks: EMPTY_BLOCK_READER,
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

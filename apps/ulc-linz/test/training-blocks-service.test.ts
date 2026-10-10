import { describe, expect, it } from "vitest";

import type {
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";
import type {
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
} from "@appbasis/exercise-catalog";
import {
  InMemoryTrainingBlockRepository,
  TrainingBlockService,
} from "@appbasis/training-blocks";

import {
  createUlcTrainingBlockService,
  UlcTrainingBlockParameterError,
  UlcTrainingBlockReferenceError,
} from "../worker/training-blocks-service";

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
    defaultValue: "10",
    minValue: 5,
    maxValue: 20,
    stepValue: 5,
    isRequired: false,
    sortOrder: 10,
    ...overrides,
  });
}

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
  groups?: readonly TrainingGroup[];
  exercises?: readonly ExerciseCatalogItem[];
} = {}) {
  const repository = new InMemoryTrainingBlockRepository();
  let idIndex = 0;
  let catalogReadCount = 0;
  const ids = ["block-1", "item-1", "item-2", "item-3", "item-4"];
  const blocks = new TrainingBlockService({
    repository,
    createId: () => ids[idIndex++] ?? `id-${idIndex}`,
    now: () => new Date("2026-10-10T12:00:00.000Z"),
  });
  const groups = input.groups ?? [ACTIVE_GROUP, INACTIVE_GROUP];
  const exercises = input.exercises ?? [
    catalogItem("exercise-1"),
    catalogItem("exercise-2"),
  ];
  const snapshot: Pick<AthleteMasterdataSnapshot, "trainingGroups"> = {
    trainingGroups: groups,
  };

  return {
    blocks,
    getCatalogReadCount: () => catalogReadCount,
    service: createUlcTrainingBlockService({
      blocks,
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
    }),
  };
}

describe("ULC training block adapter", () => {
  it("uses one catalog snapshot and accepts repeated valid catalog exercises", async () => {
    const { service, getCatalogReadCount } = createService();

    await expect(service.listAudiences("org-1")).resolves.toEqual([
      { id: "group-active", name: "U16", shortName: "U16" },
    ]);

    const created = await service.create("org-1", {
      name: "Sprint",
      audienceId: "group-active",
      exercises: [
        { exerciseId: "exercise-1" },
        { exerciseId: "exercise-2" },
        { exerciseId: "exercise-1" },
      ],
    });
    expect(getCatalogReadCount()).toBe(1);
    expect(created).toMatchObject({
      organizationId: "org-1",
      revision: {
        audienceId: "group-active",
        exercises: [
          { exerciseId: "exercise-1" },
          { exerciseId: "exercise-2" },
          { exerciseId: "exercise-1" },
        ],
      },
    });
  });

  it("requires exactly one active same-organization training group", async () => {
    const { blocks, service } = createService();

    await expect(
      service.create("org-1", {
        name: "No group",
        audienceId: null,
      }),
    ).rejects.toMatchObject({
      name: "UlcTrainingBlockReferenceError",
      referenceType: "audience",
      referenceId: null,
    });

    await expect(
      service.create("org-1", {
        name: "Inactive",
        audienceId: "group-inactive",
      }),
    ).rejects.toBeInstanceOf(UlcTrainingBlockReferenceError);

    await expect(blocks.list("org-1")).resolves.toEqual([]);
  });

  it("rejects missing, inactive and foreign exercises before persistence", async () => {
    for (const item of [
      undefined,
      catalogItem("exercise-bad", { isActive: false }),
      catalogItem("exercise-bad", { organizationId: "org-2" }),
    ]) {
      const exercises = item === undefined ? [] : [item];
      const { blocks, service } = createService({ exercises });
      await expect(
        service.create("org-1", {
          name: "Invalid exercise",
          audienceId: "group-active",
          exercises: [{ exerciseId: "exercise-bad" }],
        }),
      ).rejects.toMatchObject({
        referenceType: "exercise",
        referenceId: "exercise-bad",
      });
      await expect(blocks.list("org-1")).resolves.toEqual([]);
    }
  });

  it("validates parameter override keys and numeric constraints", async () => {
    const exercise = catalogItem("exercise-parameterized", {
      parameters: Object.freeze([parameter("distance")]),
    });

    const valid = createService({ exercises: [exercise] });
    await expect(
      valid.service.create("org-1", {
        name: "Valid override",
        audienceId: "group-active",
        exercises: [
          {
            exerciseId: exercise.id,
            parameterOverrides: [{ key: "distance", value: "15" }],
          },
        ],
      }),
    ).resolves.toMatchObject({
      revision: {
        exercises: [
          {
            parameterOverrides: [
              { key: "distance", value: "15", sortOrder: 0 },
            ],
          },
        ],
      },
    });

    for (const [key, value, reason] of [
      ["unknown", "15", "unknown-key"],
      ["distance", "abc", "invalid-number"],
      ["distance", "4", "below-minimum"],
      ["distance", "21", "above-maximum"],
      ["distance", "12", "step-mismatch"],
    ] as const) {
      const { blocks, service } = createService({ exercises: [exercise] });
      await expect(
        service.create("org-1", {
          name: "Invalid override",
          audienceId: "group-active",
          exercises: [
            {
              exerciseId: exercise.id,
              parameterOverrides: [{ key, value }],
            },
          ],
        }),
      ).rejects.toMatchObject({
        name: "UlcTrainingBlockParameterError",
        exerciseId: exercise.id,
        parameterKey: key,
        reason,
      });
      await expect(blocks.list("org-1")).resolves.toEqual([]);
    }
  });

  it("requires an override when a required catalog parameter has no default", async () => {
    const exercise = catalogItem("exercise-required", {
      parameters: Object.freeze([
        parameter("height", {
          defaultValue: null,
          isRequired: true,
          minValue: null,
          maxValue: null,
          stepValue: null,
        }),
      ]),
    });
    const { service } = createService({ exercises: [exercise] });

    await expect(
      service.create("org-1", {
        name: "Missing required value",
        audienceId: "group-active",
        exercises: [{ exerciseId: exercise.id }],
      }),
    ).rejects.toBeInstanceOf(UlcTrainingBlockParameterError);
    await expect(
      service.create("org-1", {
        name: "Has required value",
        audienceId: "group-active",
        exercises: [
          {
            exerciseId: exercise.id,
            parameterOverrides: [{ key: "height", value: "42" }],
          },
        ],
      }),
    ).resolves.toMatchObject({ currentRevision: 1 });
  });

  it("does not append a revision when an update introduces an invalid reference", async () => {
    const { blocks, service } = createService();
    const created = await service.create("org-1", {
      name: "Valid",
      audienceId: "group-active",
      exercises: [{ exerciseId: "exercise-1" }],
    });

    const invalidService = createUlcTrainingBlockService({
      blocks,
      masterdata: {
        async readOrganizationSnapshot() {
          return { trainingGroups: [ACTIVE_GROUP] };
        },
      },
      exerciseCatalog: {
        async listItems() {
          return [];
        },
      },
    });

    await expect(
      invalidService.update("org-1", created.id, 1, {
        name: "Invalid next",
        audienceId: "group-active",
        exercises: [
          {
            itemId: created.revision.exercises[0]?.itemId,
            exerciseId: "exercise-missing",
          },
        ],
      }),
    ).rejects.toMatchObject({
      referenceType: "exercise",
      referenceId: "exercise-missing",
    });

    await expect(service.listRevisions("org-1", created.id)).resolves.toHaveLength(1);
    await expect(service.findCurrent("org-1", created.id)).resolves.toMatchObject({
      currentRevision: 1,
      revision: { name: "Valid" },
    });
  });
});

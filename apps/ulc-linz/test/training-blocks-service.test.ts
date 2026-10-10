import { describe, expect, it } from "vitest";

import type {
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";
import type { ExerciseCatalogItem } from "@appbasis/exercise-catalog";
import {
  InMemoryTrainingBlockRepository,
  TrainingBlockService,
} from "@appbasis/training-blocks";

import {
  createUlcTrainingBlockService,
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
  const ids = ["block-1", "item-1", "item-2", "item-3"];
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
    service: createUlcTrainingBlockService({
      blocks,
      masterdata: {
        async readOrganizationSnapshot() {
          return snapshot;
        },
      },
      exerciseCatalog: {
        async findItemById(organizationId, exerciseId) {
          return exercises.find(
            (exercise) =>
              exercise.organizationId === organizationId &&
              exercise.id === exerciseId,
          );
        },
      },
    }),
  };
}

describe("ULC training block adapter", () => {
  it("exposes only active ULC groups and accepts repeated valid catalog exercises", async () => {
    const { service } = createService();

    await expect(service.listAudiences("org-1")).resolves.toEqual([
      { id: "group-active", name: "U16", shortName: "U16" },
    ]);

    const created = await service.create("org-1", {
      name: "Sprint",
      audienceId: "group-active",
      exercises: [
        { exerciseId: "exercise-1" },
        { exerciseId: "exercise-1" },
      ],
    });
    expect(created).toMatchObject({
      organizationId: "org-1",
      revision: {
        audienceId: "group-active",
        exercises: [
          { exerciseId: "exercise-1" },
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
        async findItemById() {
          return undefined;
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

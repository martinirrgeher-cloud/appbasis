import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanService,
  TrainingPlanTargetExistsError,
  TrainingPlanValidationError,
} from "../src/index";

function deterministicIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function deterministicClock(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[index++] ?? timestamps.at(-1)!);
}

describe("training-plans service", () => {
  it("creates immutable revisions and preserves item identity across reorder", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds(
        "plan-1",
        "block-a",
        "child-a",
        "top-a",
        "child-b",
      ),
      now: deterministicClock(
        "2026-10-12T08:00:00.000Z",
        "2026-10-12T08:05:00.000Z",
      ),
    });

    const created = await service.create("org-a", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      note: "Sprint",
      items: [
        {
          kind: "block",
          sourceBlockId: "block-template",
          sourceBlockRevision: 4,
          name: "Beschleunigung",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "3",
            },
          ],
        },
        {
          kind: "exercise",
          name: "Auslaufen",
          amount: "10",
          unit: "min",
        },
      ],
    });

    expect(created).toMatchObject({
      id: "plan-1",
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      currentRevision: 1,
      revision: {
        revision: 1,
        items: [
          {
            kind: "block",
            itemId: "block-a",
            sourceBlockId: "block-template",
            sourceBlockRevision: 4,
            exercises: [
              {
                itemId: "child-a",
                sourceExerciseId: "exercise-1",
              },
            ],
          },
          {
            kind: "exercise",
            itemId: "top-a",
            name: "Auslaufen",
          },
        ],
      },
    });

    const updated = await service.update("org-a", "plan-1", 1, {
      note: "Sprint angepasst",
      items: [
        {
          kind: "exercise",
          itemId: "top-a",
          name: "Auslaufen",
          amount: "12",
          unit: "min",
        },
        {
          kind: "block",
          itemId: "block-a",
          sourceBlockId: "block-template",
          sourceBlockRevision: 4,
          name: "Beschleunigung individuell",
          exercises: [
            {
              itemId: "child-a",
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "4",
            },
            {
              sourceExerciseId: "exercise-2",
              name: "Steigerung",
            },
          ],
        },
      ],
    });

    expect(updated).toMatchObject({
      currentRevision: 2,
      revision: {
        revision: 2,
        note: "Sprint angepasst",
        items: [
          { kind: "exercise", itemId: "top-a", sortOrder: 0 },
          {
            kind: "block",
            itemId: "block-a",
            sortOrder: 1,
            exercises: [
              { itemId: "child-a", repetitions: "4", sortOrder: 0 },
              { itemId: "child-b", sortOrder: 1 },
            ],
          },
        ],
      },
    });

    await expect(
      service.findRevision("org-a", "plan-1", 1),
    ).resolves.toMatchObject({
      revision: 1,
      note: "Sprint",
      items: [
        {
          kind: "block",
          itemId: "block-a",
          name: "Beschleunigung",
          exercises: [{ itemId: "child-a", repetitions: "3" }],
        },
        { kind: "exercise", itemId: "top-a", amount: "10" },
      ],
    });
    await expect(
      service.listRevisions("org-a", "plan-1"),
    ).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);
  });

  it("fails stale updates with optimistic concurrency", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds("plan-1"),
      now: () => new Date("2026-10-12T08:00:00.000Z"),
    });
    await service.create("org-a", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
    });
    await service.update("org-a", "plan-1", 1, {
      note: "v2",
    });

    await expect(
      service.update("org-a", "plan-1", 1, { note: "stale" }),
    ).rejects.toMatchObject({
      name: "TrainingPlanConflictError",
      expectedRevision: 1,
      currentRevision: 2,
    });
    await expect(
      service.update("org-a", "plan-1", 1, { note: "stale" }),
    ).rejects.toBeInstanceOf(TrainingPlanConflictError);
  });

  it("protects an existing subject/day target from implicit overwrite", async () => {
    const repository = new InMemoryTrainingPlanRepository();
    const service = new TrainingPlanService({
      repository,
      createId: deterministicIds("plan-original", "plan-copy"),
      now: () => new Date("2026-10-12T08:00:00.000Z"),
    });
    const original = await service.create("org-a", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      note: "Original",
    });

    await expect(
      service.create("org-a", {
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        note: "Must not overwrite",
      }),
    ).rejects.toMatchObject({
      name: "TrainingPlanTargetExistsError",
      existingPlanId: original.id,
      currentRevision: 1,
    });
    await expect(
      service.create("org-a", {
        subjectId: "athlete-1",
        planDate: "2026-10-12",
      }),
    ).rejects.toBeInstanceOf(TrainingPlanTargetExistsError);

    await expect(
      service.findForSubjectDate("org-a", "athlete-1", "2026-10-12"),
    ).resolves.toMatchObject({
      id: "plan-original",
      revision: { note: "Original" },
    });
  });

  it("filters by subject and date range without crossing organizations", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds("a-1", "a-2", "b-1", "other"),
      now: () => new Date("2026-10-12T08:00:00.000Z"),
    });
    await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });
    await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-14",
    });
    await service.create("org-a", {
      subjectId: "athlete-b",
      planDate: "2026-10-13",
    });
    await service.create("org-b", {
      subjectId: "athlete-a",
      planDate: "2026-10-13",
    });

    await expect(
      service.list("org-a", {
        subjectId: "athlete-a",
        fromDate: "2026-10-13",
        toDate: "2026-10-14",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "a-2", planDate: "2026-10-14" }),
    ]);
  });

  it("allows exercises to move between top-level and block while preserving kind identity", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds("plan-1", "exercise-a", "block-a"),
      now: () => new Date("2026-10-12T08:00:00.000Z"),
    });
    await service.create("org-a", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      items: [{ kind: "exercise", name: "Mobilität" }],
    });

    const updated = await service.update("org-a", "plan-1", 1, {
      items: [
        {
          kind: "block",
          name: "Warm-up",
          exercises: [
            {
              itemId: "exercise-a",
              name: "Mobilität",
            },
          ],
        },
      ],
    });

    expect(updated?.revision.items[0]).toMatchObject({
      kind: "block",
      itemId: "block-a",
      exercises: [{ itemId: "exercise-a" }],
    });
  });

  it("rejects unknown, duplicate and kind-changing item identities", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds("plan-1", "block-a", "exercise-a"),
      now: () => new Date("2026-10-12T08:00:00.000Z"),
    });
    await service.create("org-a", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Exercise" }],
        },
      ],
    });

    await expect(
      service.update("org-a", "plan-1", 1, {
        items: [
          {
            kind: "exercise",
            itemId: "missing",
            name: "Unknown",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TrainingPlanValidationError);

    await expect(
      service.update("org-a", "plan-1", 1, {
        items: [
          {
            kind: "exercise",
            itemId: "block-a",
            name: "Kind change",
          },
        ],
      }),
    ).rejects.toThrow(/kind cannot change/);

    await expect(
      service.update("org-a", "plan-1", 1, {
        items: [
          {
            kind: "exercise",
            itemId: "exercise-a",
            name: "One",
          },
          {
            kind: "exercise",
            itemId: "exercise-a",
            name: "Two",
          },
        ],
      }),
    ).rejects.toThrow(/duplicate item id/);
  });

  it("rejects an inverted list date range before repository access", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
    });

    await expect(
      service.list("org-a", {
        fromDate: "2026-10-14",
        toDate: "2026-10-12",
      }),
    ).rejects.toThrow(/date range/);
  });
});

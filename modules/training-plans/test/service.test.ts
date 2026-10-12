import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanGeneratedIdConflictError,
  TrainingPlanService,
  TrainingPlanTargetOccupiedError,
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
  it("creates immutable revisions while preserving item identity across reorder", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds(
        "plan-1",
        "block-item",
        "child-a",
        "child-b",
        "standalone-item",
        "child-c",
      ),
      now: deterministicClock(
        "2026-10-12T10:00:00.000Z",
        "2026-10-12T10:05:00.000Z",
      ),
    });

    const created = await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      note: "Sprint",
      items: [
        {
          kind: "block",
          sourceBlockId: "block-template",
          sourceBlockRevision: 3,
          name: "Beschleunigung",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "3",
            },
            {
              sourceExerciseId: "exercise-2",
              name: "60 m",
              repetitions: "2",
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
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      currentRevision: 1,
      revision: {
        note: "Sprint",
        items: [
          {
            kind: "block",
            itemId: "block-item",
            exercises: [
              { itemId: "child-a", sortOrder: 0 },
              { itemId: "child-b", sortOrder: 1 },
            ],
          },
          {
            kind: "exercise",
            itemId: "standalone-item",
            sortOrder: 1,
          },
        ],
      },
    });

    const updated = await service.update("org-a", "plan-1", 1, {
      note: "Sprint v2",
      items: [
        {
          kind: "exercise",
          itemId: "standalone-item",
          name: "Auslaufen",
          amount: "12",
          unit: "min",
        },
        {
          kind: "block",
          itemId: "block-item",
          sourceBlockId: "block-template",
          sourceBlockRevision: 3,
          name: "Beschleunigung angepasst",
          exercises: [
            {
              itemId: "child-b",
              sourceExerciseId: "exercise-2",
              name: "60 m",
              repetitions: "3",
            },
            {
              itemId: "child-a",
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "4",
            },
            {
              sourceExerciseId: "exercise-3",
              name: "80 m",
              repetitions: "2",
            },
          ],
        },
      ],
    });

    expect(updated).toMatchObject({
      currentRevision: 2,
      revision: {
        revision: 2,
        note: "Sprint v2",
        items: [
          {
            kind: "exercise",
            itemId: "standalone-item",
            sortOrder: 0,
          },
          {
            kind: "block",
            itemId: "block-item",
            sortOrder: 1,
            exercises: [
              { itemId: "child-b", sortOrder: 0 },
              { itemId: "child-a", sortOrder: 1 },
              { itemId: "child-c", sortOrder: 2 },
            ],
          },
        ],
      },
    });

    await expect(service.findRevision("org-a", "plan-1", 1)).resolves.toMatchObject({
      revision: 1,
      note: "Sprint",
      items: [
        {
          kind: "block",
          itemId: "block-item",
          exercises: [
            { itemId: "child-a", repetitions: "3" },
            { itemId: "child-b", repetitions: "2" },
          ],
        },
        { kind: "exercise", itemId: "standalone-item", amount: "10" },
      ],
    });
    await expect(service.listRevisions("org-a", "plan-1")).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);
  });

  it("rejects stale updates with optimistic concurrency", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds("plan-1"),
      now: () => new Date("2026-10-12T10:00:00.000Z"),
    });

    await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });
    await service.update("org-a", "plan-1", 1, { note: "Revision 2" });

    await expect(
      service.update("org-a", "plan-1", 1, { note: "stale" }),
    ).rejects.toMatchObject({
      name: "TrainingPlanConflictError",
      expectedRevision: 1,
      currentRevision: 2,
    });
    await expect(
      service.update("org-a", "plan-1", 1, { note: "stale again" }),
    ).rejects.toBeInstanceOf(TrainingPlanConflictError);
  });

  it("copies a current plan as an independent snapshot and protects occupied targets", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds(
        "source-plan",
        "source-block",
        "source-child",
        "copy-plan",
        "copy-block",
        "copy-child",
        "retry-plan",
        "retry-block",
        "retry-child",
      ),
      now: deterministicClock(
        "2026-10-12T10:00:00.000Z",
        "2026-10-12T10:01:00.000Z",
        "2026-10-12T10:02:00.000Z",
        "2026-10-12T10:03:00.000Z",
      ),
    });

    const source = await service.create("org-copy", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      note: "Original",
      items: [
        {
          kind: "block",
          sourceBlockId: "template-1",
          sourceBlockRevision: 5,
          name: "Sprintblock",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "3",
            },
          ],
        },
      ],
    });

    const copied = await service.copyCurrentTo(
      "org-copy",
      source.id,
      "athlete-b",
      "2026-10-13",
    );
    expect(copied).toMatchObject({
      id: "copy-plan",
      subjectId: "athlete-b",
      planDate: "2026-10-13",
      currentRevision: 1,
      revision: {
        note: "Original",
        items: [
          {
            kind: "block",
            itemId: "copy-block",
            sourceBlockId: "template-1",
            sourceBlockRevision: 5,
            name: "Sprintblock",
            exercises: [
              {
                itemId: "copy-child",
                sourceExerciseId: "exercise-1",
                repetitions: "3",
              },
            ],
          },
        ],
      },
    });
    expect(copied?.revision.items[0]?.itemId).not.toBe(
      source.revision.items[0]?.itemId,
    );

    await service.update("org-copy", source.id, 1, {
      note: "Quelle geändert",
      items: [
        {
          kind: "block",
          itemId: "source-block",
          sourceBlockId: "template-1",
          sourceBlockRevision: 5,
          name: "Sprintblock neu",
          exercises: [
            {
              itemId: "source-child",
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "6",
            },
          ],
        },
      ],
    });

    await expect(
      service.findCurrent("org-copy", "copy-plan"),
    ).resolves.toMatchObject({
      currentRevision: 1,
      revision: {
        note: "Original",
        items: [
          {
            name: "Sprintblock",
            exercises: [{ repetitions: "3" }],
          },
        ],
      },
    });

    await expect(
      service.copyCurrentTo(
        "org-copy",
        source.id,
        "athlete-b",
        "2026-10-13",
      ),
    ).rejects.toMatchObject({
      name: "TrainingPlanTargetOccupiedError",
      subjectId: "athlete-b",
      planDate: "2026-10-13",
      existingPlanId: "copy-plan",
    });
    await expect(
      service.copyCurrentTo(
        "org-copy",
        source.id,
        "athlete-b",
        "2026-10-13",
      ),
    ).rejects.toBeInstanceOf(TrainingPlanTargetOccupiedError);
  });

  it("lists only the requested subject/date range and organization", async () => {
    const repository = new InMemoryTrainingPlanRepository();
    const service = new TrainingPlanService({
      repository,
      createId: deterministicIds("a-12", "a-13", "b-12", "other-org"),
      now: () => new Date("2026-10-12T10:00:00.000Z"),
    });

    await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });
    await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-13",
    });
    await service.create("org-a", {
      subjectId: "athlete-b",
      planDate: "2026-10-12",
    });
    await service.create("org-b", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });

    await expect(
      service.listForSubjectDateRange(
        "org-a",
        "athlete-a",
        "2026-10-12",
        "2026-10-13",
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: "a-12", planDate: "2026-10-12" }),
      expect.objectContaining({ id: "a-13", planDate: "2026-10-13" }),
    ]);
    await expect(
      service.findCurrentBySubjectDate(
        "org-a",
        "athlete-b",
        "2026-10-12",
      ),
    ).resolves.toMatchObject({ id: "b-12" });
    await expect(
      service.listForSubjectDateRange(
        "org-a",
        "athlete-a",
        "2026-10-14",
        "2026-10-12",
      ),
    ).rejects.toBeInstanceOf(TrainingPlanValidationError);
  });

  it("rejects item kind changes and unknown persisted item ids", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds("plan-kind", "block-kind", "child-kind"),
      now: () => new Date("2026-10-12T10:00:00.000Z"),
    });
    await service.create("org-kind", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Übung" }],
        },
      ],
    });

    await expect(
      service.update("org-kind", "plan-kind", 1, {
        items: [
          {
            kind: "exercise",
            itemId: "block-kind",
            name: "Kein Block mehr",
          },
        ],
      }),
    ).rejects.toThrow(/kind cannot change/);

    await expect(
      service.update("org-kind", "plan-kind", 1, {
        items: [
          {
            kind: "block",
            itemId: "unknown",
            name: "Block",
          },
        ],
      }),
    ).rejects.toThrow(/does not belong/);
  });

  it("never reuses an item id that disappeared from an older revision", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds(
        "plan-history",
        "block-history",
        "child-old",
        "child-old",
        "child-new",
      ),
      now: deterministicClock(
        "2026-10-12T10:00:00.000Z",
        "2026-10-12T10:01:00.000Z",
        "2026-10-12T10:02:00.000Z",
      ),
    });

    await service.create("org-history", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Alt" }],
        },
      ],
    });

    await service.update("org-history", "plan-history", 1, {
      items: [
        {
          kind: "block",
          itemId: "block-history",
          name: "Block",
          exercises: [],
        },
      ],
    });

    const updated = await service.update("org-history", "plan-history", 2, {
      items: [
        {
          kind: "block",
          itemId: "block-history",
          name: "Block",
          exercises: [{ name: "Neu" }],
        },
      ],
    });

    expect(updated?.revision.items[0]).toMatchObject({
      kind: "block",
      exercises: [{ itemId: "child-new", name: "Neu" }],
    });
    await expect(
      service.findRevision("org-history", "plan-history", 1),
    ).resolves.toMatchObject({
      items: [
        {
          exercises: [{ itemId: "child-old", name: "Alt" }],
        },
      ],
    });
  });

  it("keeps copied item ids distinct from current and historical source ids", async () => {
    const service = new TrainingPlanService({
      repository: new InMemoryTrainingPlanRepository(),
      createId: deterministicIds(
        "source-plan",
        "source-block",
        "source-child-old",
        "source-child-new",
        "copy-plan",
        "source-block",
        "source-child-old",
        "copy-block",
        "source-child-new",
        "copy-child",
      ),
      now: deterministicClock(
        "2026-10-12T10:00:00.000Z",
        "2026-10-12T10:01:00.000Z",
        "2026-10-12T10:02:00.000Z",
        "2026-10-12T10:03:00.000Z",
      ),
    });

    await service.create("org-copy-ids", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Alt" }],
        },
      ],
    });

    await service.update("org-copy-ids", "source-plan", 1, {
      items: [
        {
          kind: "block",
          itemId: "source-block",
          name: "Block",
          exercises: [],
        },
      ],
    });

    await service.update("org-copy-ids", "source-plan", 2, {
      items: [
        {
          kind: "block",
          itemId: "source-block",
          name: "Block",
          exercises: [{ name: "Neu" }],
        },
      ],
    });

    const copied = await service.copyCurrentTo(
      "org-copy-ids",
      "source-plan",
      "athlete-b",
      "2026-10-13",
    );

    expect(copied).toMatchObject({
      id: "copy-plan",
      revision: {
        items: [
          {
            kind: "block",
            itemId: "copy-block",
            exercises: [
              {
                itemId: "copy-child",
                name: "Neu",
              },
            ],
          },
        ],
      },
    });

    const sourceIds = new Set<string>();
    for (const revision of await service.listRevisions(
      "org-copy-ids",
      "source-plan",
    )) {
      for (const item of revision.items) {
        sourceIds.add(item.itemId);
        if (item.kind === "block") {
          for (const exercise of item.exercises) {
            sourceIds.add(exercise.itemId);
          }
        }
      }
    }

    expect(sourceIds.has("source-child-old")).toBe(true);
    expect(sourceIds.has("source-child-new")).toBe(true);
    expect(sourceIds.has(copied!.revision.items[0]!.itemId)).toBe(false);
    const copiedBlock = copied!.revision.items[0]!;
    expect(copiedBlock.kind).toBe("block");
    if (copiedBlock.kind === "block") {
      expect(sourceIds.has(copiedBlock.exercises[0]!.itemId)).toBe(false);
    }
  });

  it("surfaces globally colliding generated plan identities", async () => {
    const repository = new InMemoryTrainingPlanRepository();
    const first = new TrainingPlanService({
      repository,
      createId: () => "shared-plan-id",
      now: () => new Date("2026-10-12T10:00:00.000Z"),
    });
    const second = new TrainingPlanService({
      repository,
      createId: () => "shared-plan-id",
      now: () => new Date("2026-10-12T10:00:00.000Z"),
    });
    await first.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });

    await expect(
      second.create("org-b", {
        subjectId: "athlete-b",
        planDate: "2026-10-12",
      }),
    ).rejects.toMatchObject({
      name: "TrainingPlanGeneratedIdConflictError",
      generatedPlanId: "shared-plan-id",
    });
    await expect(
      second.create("org-b", {
        subjectId: "athlete-c",
        planDate: "2026-10-13",
      }),
    ).rejects.toBeInstanceOf(TrainingPlanGeneratedIdConflictError);
  });
});

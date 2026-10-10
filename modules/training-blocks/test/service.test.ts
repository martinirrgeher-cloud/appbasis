import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingBlockRepository,
  TrainingBlockConflictError,
  TrainingBlockInactiveError,
  TrainingBlockService,
  TrainingBlockValidationError,
} from "../src/index";

function deterministicIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function deterministicClock(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[index++] ?? timestamps.at(-1)!);
}

describe("training-blocks service", () => {
  it("creates immutable revisions while preserving occurrence identity across reorder", async () => {
    const repository = new InMemoryTrainingBlockRepository();
    const service = new TrainingBlockService({
      repository,
      createId: deterministicIds("block-1", "item-a", "item-b", "item-c"),
      now: deterministicClock(
        "2026-10-10T10:00:00.000Z",
        "2026-10-10T10:05:00.000Z",
      ),
    });

    const created = await service.create("org-a", {
      name: "Sprint",
      audienceId: "group-a",
      exercises: [
        { exerciseId: "exercise-1", parameterOverrides: [{ key: "sets", value: "3" }] },
        { exerciseId: "exercise-1" },
      ],
    });
    expect(created).toMatchObject({
      id: "block-1",
      organizationId: "org-a",
      currentRevision: 1,
      revision: {
        revision: 1,
        exercises: [
          { itemId: "item-a", exerciseId: "exercise-1", sortOrder: 0 },
          { itemId: "item-b", exerciseId: "exercise-1", sortOrder: 1 },
        ],
      },
    });

    const updated = await service.update("org-a", "block-1", 1, {
      name: "Sprint erweitert",
      audienceId: "group-a",
      exercises: [
        { itemId: "item-b", exerciseId: "exercise-1", note: "zuerst" },
        { itemId: "item-a", exerciseId: "exercise-1", parameterOverrides: [{ key: "sets", value: "4" }] },
        { exerciseId: "exercise-2" },
      ],
    });
    expect(updated).toMatchObject({
      currentRevision: 2,
      revision: {
        revision: 2,
        exercises: [
          { itemId: "item-b", sortOrder: 0 },
          { itemId: "item-a", sortOrder: 1 },
          { itemId: "item-c", exerciseId: "exercise-2", sortOrder: 2 },
        ],
      },
    });

    await expect(service.findRevision("org-a", "block-1", 1)).resolves.toMatchObject({
      revision: 1,
      name: "Sprint",
      exercises: [
        { itemId: "item-a", parameterOverrides: [{ key: "sets", value: "3" }] },
        { itemId: "item-b" },
      ],
    });
    await expect(service.list("org-a")).resolves.toEqual([
      expect.objectContaining({ currentRevision: 2 }),
    ]);
    await expect(service.listRevisions("org-a", "block-1")).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);

    await expect(service.compareRevisions("org-a", "block-1", 1, 2)).resolves.toEqual({
      fromRevision: 1,
      toRevision: 2,
      hasChanges: true,
      changedFields: ["name"],
      addedItemIds: ["item-c"],
      removedItemIds: [],
      changedItemIds: ["item-a", "item-b"],
      reorderedItemIds: ["item-a", "item-b"],
    });
  });

  it("fails stale updates and stale deactivation with optimistic concurrency", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("block-1"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-a", { name: "Block" });
    await service.update("org-a", "block-1", 1, { name: "Block v2" });

    await expect(
      service.update("org-a", "block-1", 1, { name: "stale" }),
    ).rejects.toMatchObject({
      name: "TrainingBlockConflictError",
      expectedRevision: 1,
      currentRevision: 2,
    });
    await expect(service.deactivate("org-a", "block-1", 1)).rejects.toBeInstanceOf(
      TrainingBlockConflictError,
    );
  });

  it("deactivates without deleting revision history and keeps organizations isolated", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("block-a", "block-b"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-a", { name: "A" });
    await service.create("org-b", { name: "B" });

    await expect(service.deactivate("org-a", "block-a", 1)).resolves.toMatchObject({
      isActive: false,
      currentRevision: 1,
    });
    await expect(
      service.update("org-a", "block-a", 1, { name: "A stale autosave" }),
    ).rejects.toBeInstanceOf(TrainingBlockInactiveError);
    await expect(service.listRevisions("org-a", "block-a")).resolves.toHaveLength(1);
    await expect(service.list("org-a")).resolves.toHaveLength(1);
    await expect(service.list("org-b")).resolves.toEqual([
      expect.objectContaining({ id: "block-b", isActive: true }),
    ]);
  });

  it("matches PostgreSQL global block identity while preserving organization-scoped reads", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("shared", "shared"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-a", { name: "A" });

    await expect(service.findCurrent("org-b", "shared")).resolves.toBeUndefined();
    await expect(service.create("org-b", { name: "B" })).rejects.toThrow(
      /Training block already exists/,
    );
  });

  it("rejects unknown or duplicate persisted item identities during update", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("block-1", "item-a"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-a", {
      name: "Block",
      exercises: [{ exerciseId: "exercise-1" }],
    });

    await expect(
      service.update("org-a", "block-1", 1, {
        name: "Block",
        exercises: [{ itemId: "foreign-item", exerciseId: "exercise-1" }],
      }),
    ).rejects.toBeInstanceOf(TrainingBlockValidationError);

    await expect(
      service.update("org-a", "block-1", 1, {
        name: "Block",
        exercises: [
          { itemId: "item-a", exerciseId: "exercise-1" },
          { itemId: "item-a", exerciseId: "exercise-1" },
        ],
      }),
    ).rejects.toThrow(/duplicate exercise item id/);
  });
});

import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingBlockRepository,
  TrainingBlockConflictError,
  TrainingBlockInactiveError,
  TrainingBlockInUseError,
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
  it("reactivates archived blocks only at the matching revision and without creating a new revision", async () => {
    const repository = new InMemoryTrainingBlockRepository();
    const service = new TrainingBlockService({
      repository,
      createId: deterministicIds("block-1"),
      now: deterministicClock(
        "2026-10-30T08:00:00.000Z",
        "2026-10-30T08:01:00.000Z",
        "2026-10-30T08:02:00.000Z",
      ),
    });
    const created = await service.create("org-a", {
      name: "Drills",
      audienceId: null,
      exercises: [],
    });
    const archived = await service.deactivate("org-a", created.id, created.currentRevision);
    expect(archived?.isActive).toBe(false);
    await expect(
      service.reactivate("org-a", created.id, created.currentRevision + 1),
    ).rejects.toBeInstanceOf(TrainingBlockConflictError);
    const restored = await service.reactivate("org-a", created.id, created.currentRevision);
    expect(restored?.isActive).toBe(true);
    expect(restored?.currentRevision).toBe(created.currentRevision);
    expect((await service.findCurrent("org-a", created.id))?.isActive).toBe(true);
    await expect(service.reactivate("org-b", created.id, created.currentRevision))
      .resolves.toBeUndefined();
  });


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

  it("duplicates current content as an independent revision-1 block without metadata carry-over", async () => {
    const repository = new InMemoryTrainingBlockRepository();
    const service = new TrainingBlockService({
      repository,
      createId: deterministicIds(
        "block-source",
        "item-source",
        "usage-source",
        "block-copy",
        "item-copy",
      ),
      now: deterministicClock(
        "2026-10-10T10:00:00.000Z",
        "2026-10-10T10:05:00.000Z",
      ),
    });

    await service.create("org-a", {
      name: "Sprint",
      audienceId: "group-a",
      durationMinutes: 25,
      note: "Quelle",
      exercises: [
        {
          exerciseId: "exercise-1",
          note: "Hinweis",
          parameterOverrides: [{ key: "sets", value: "3" }],
        },
      ],
    });
    await service.setFavorite("org-a", "principal-a", "block-source", true);
    await service.recordUsage("org-a", "block-source", {
      occurredAt: "2026-10-10T10:02:00.000Z",
      sourceKind: "training_plan",
      sourceRef: "plan-1",
    });

    const copy = await service.duplicate(
      "org-a",
      "block-source",
      { name: "Sprint Kopie" },
    );

    expect(copy).toMatchObject({
      id: "block-copy",
      currentRevision: 1,
      isActive: true,
      revision: {
        revision: 1,
        name: "Sprint Kopie",
        audienceId: "group-a",
        durationMinutes: 25,
        note: "Quelle",
        exercises: [
          {
            itemId: "item-copy",
            exerciseId: "exercise-1",
            note: "Hinweis",
            parameterOverrides: [{ key: "sets", value: "3" }],
          },
        ],
      },
    });
    expect(copy?.revision.exercises[0]?.itemId).not.toBe("item-source");

    await expect(
      service.listOverview("org-a", "principal-a"),
    ).resolves.toEqual([
      expect.objectContaining({
        block: expect.objectContaining({ id: "block-source" }),
        isFavorite: true,
        usageCount: 1,
      }),
      expect.objectContaining({
        block: expect.objectContaining({ id: "block-copy" }),
        isFavorite: false,
        usageCount: 0,
      }),
    ]);
    await expect(
      service.duplicate("org-a", "missing", { name: "Kopie" }),
    ).resolves.toBeUndefined();
  });

  it("deletes only unused blocks and removes their personal metadata", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("unused", "used", "usage-1"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-a", { name: "Unused" });
    await service.create("org-a", { name: "Used" });
    await service.setFavorite("org-a", "principal-a", "unused", true);
    await service.recordUsage("org-a", "used", {
      occurredAt: "2026-10-10T11:00:00.000Z",
      sourceKind: "training_plan",
    });

    await expect(
      service.deleteUnused("org-a", "unused", 1),
    ).resolves.toBe(true);
    await expect(
      service.findCurrent("org-a", "unused"),
    ).resolves.toBeUndefined();
    await expect(
      service.listOverview("org-a", "principal-a"),
    ).resolves.toEqual([
      expect.objectContaining({
        block: expect.objectContaining({ id: "used" }),
        isFavorite: false,
        usageCount: 1,
      }),
    ]);

    await expect(
      service.deleteUnused("org-a", "used", 1),
    ).rejects.toBeInstanceOf(TrainingBlockInUseError);
    await expect(
      service.deleteUnused("org-a", "missing", 1),
    ).resolves.toBe(false);
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

  it("keeps favorites principal-scoped and aggregates usage without changing revisions", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("block-meta", "usage-1", "usage-2"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    const block = await service.create("org-meta", { name: "Metadaten" });

    await expect(
      service.setFavorite("org-meta", "principal-a", block.id, true),
    ).resolves.toBe(true);
    await expect(
      service.listOverview("org-meta", "principal-a"),
    ).resolves.toEqual([
      expect.objectContaining({
        block: expect.objectContaining({ id: block.id, currentRevision: 1 }),
        isFavorite: true,
        usageCount: 0,
        lastUsedAt: null,
      }),
    ]);
    await expect(
      service.listOverview("org-meta", "principal-b"),
    ).resolves.toEqual([
      expect.objectContaining({
        isFavorite: false,
        usageCount: 0,
      }),
    ]);

    await expect(
      service.recordUsage("org-meta", block.id, {
        occurredAt: "2026-10-10T11:00:00.000Z",
        sourceKind: "training_plan",
        sourceRef: "plan-1",
      }),
    ).resolves.toMatchObject({
      id: "usage-1",
      blockId: block.id,
      sourceKind: "training_plan",
    });
    await expect(
      service.recordUsage("org-meta", block.id, {
        occurredAt: "2026-10-10T12:00:00.000Z",
        sourceKind: "training_plan",
        note: "second use",
      }),
    ).resolves.toMatchObject({ id: "usage-2" });

    await expect(
      service.listOverview("org-meta", "principal-a"),
    ).resolves.toEqual([
      expect.objectContaining({
        isFavorite: true,
        usageCount: 2,
        lastUsedAt: "2026-10-10T12:00:00.000Z",
      }),
    ]);
    await expect(service.listUsage("org-meta", block.id)).resolves.toEqual([
      expect.objectContaining({ id: "usage-2" }),
      expect.objectContaining({ id: "usage-1" }),
    ]);
    await expect(service.listRevisions("org-meta", block.id)).resolves.toHaveLength(1);

    await expect(
      service.setFavorite("org-meta", "principal-a", block.id, false),
    ).resolves.toBe(true);
    await expect(
      service.findOverview("org-meta", "principal-a", block.id),
    ).resolves.toMatchObject({
      isFavorite: false,
      usageCount: 2,
    });
    await expect(
      service.setFavorite("org-meta", "principal-a", "missing", true),
    ).resolves.toBe(false);
  });

  it("appends deterministic usage ids idempotently without changing normal recordUsage semantics", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("block-once", "usage-normal"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-once", { name: "Idempotent" });

    const input = {
      occurredAt: "2026-10-10T11:00:00.000Z",
      sourceKind: "training_plan",
      sourceRef: "plan-1:item-1",
    };
    const first = await service.recordUsageOnce(
      "org-once",
      "block-once",
      "usage-once",
      input,
    );
    const repeated = await service.recordUsageOnce(
      "org-once",
      "block-once",
      "usage-once",
      input,
    );
    expect(repeated).toEqual(first);
    await expect(
      service.listUsage("org-once", "block-once"),
    ).resolves.toHaveLength(1);

    await expect(
      service.recordUsageOnce(
        "org-once",
        "block-once",
        "usage-once",
        { ...input, sourceRef: "plan-1:item-other" },
      ),
    ).rejects.toBeInstanceOf(TrainingBlockValidationError);

    await service.recordUsage("org-once", "block-once", {
      occurredAt: "2026-10-10T12:00:00.000Z",
      sourceKind: "training_plan",
      sourceRef: "plan-2:item-2",
    });
    await expect(
      service.listUsage("org-once", "block-once"),
    ).resolves.toHaveLength(2);
    await expect(
      service.recordUsageOnce(
        "org-once",
        "missing",
        "usage-missing",
        input,
      ),
    ).resolves.toBeUndefined();
  });

  it("validates usage metadata before persistence", async () => {
    const service = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: deterministicIds("block-usage", "usage-invalid"),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-usage", { name: "Usage" });

    await expect(
      service.recordUsage("org-usage", "block-usage", {
        occurredAt: "not-a-date",
        sourceKind: "training_plan",
      }),
    ).rejects.toBeInstanceOf(TrainingBlockValidationError);
    await expect(
      service.recordUsage("org-usage", "block-usage", {
        occurredAt: "2026-10-10T11:00:00.000Z",
        sourceKind: "INVALID SOURCE",
      }),
    ).rejects.toBeInstanceOf(TrainingBlockValidationError);
    await expect(
      service.recordUsage("org-usage", "missing", {
        occurredAt: "2026-10-10T11:00:00.000Z",
        sourceKind: "training_plan",
      }),
    ).resolves.toBeUndefined();
  });


  it("discards favorite and usage metadata outside the chosen overview block snapshot", async () => {
    class LaggingOverviewRepository extends InMemoryTrainingBlockRepository {
      override async listCurrent(organizationId: string) {
        const blocks = await super.listCurrent(organizationId);
        return Object.freeze(
          blocks.filter((block) => block.id !== "block-late"),
        );
      }
    }

    const repository = new LaggingOverviewRepository();
    const service = new TrainingBlockService({
      repository,
      createId: deterministicIds(
        "block-visible",
        "block-late",
        "usage-visible",
        "usage-late",
      ),
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    await service.create("org-race", { name: "Visible" });
    await service.create("org-race", { name: "Late" });
    await service.setFavorite(
      "org-race",
      "principal-race",
      "block-visible",
      true,
    );
    await service.setFavorite(
      "org-race",
      "principal-race",
      "block-late",
      true,
    );
    await service.recordUsage("org-race", "block-visible", {
      occurredAt: "2026-10-10T11:00:00.000Z",
      sourceKind: "training_plan",
    });
    await service.recordUsage("org-race", "block-late", {
      occurredAt: "2026-10-10T12:00:00.000Z",
      sourceKind: "training_plan",
    });

    await expect(
      service.listOverview("org-race", "principal-race"),
    ).resolves.toEqual([
      expect.objectContaining({
        block: expect.objectContaining({ id: "block-visible" }),
        isFavorite: true,
        usageCount: 1,
        lastUsedAt: "2026-10-10T11:00:00.000Z",
      }),
    ]);

    await expect(service.listUsageSummaries("org-race")).resolves.toEqual([
      {
        blockId: "block-visible",
        usageCount: 1,
        lastUsedAt: "2026-10-10T11:00:00.000Z",
      },
    ]);
  });

});

import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingPlanRepository,
  TrainingPlanLifecycleService,
  TrainingPlanService,
  TrainingPlanSubjectDeletedError,
  TrainingPlanValidationError,
  reconcileTrainingPlanRestoredDatabase,
} from "../src/index";

function deterministicIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

const deletedAt = new Date("2026-10-15T10:00:00.000Z");
const beforeMarkerExpiry = new Date("2026-11-18T10:00:00.000Z");
const afterMarkerExpiry = new Date("2026-11-20T10:00:00.000Z");

describe("training-plans lifecycle", () => {
  it("physically removes every revision and item and blocks subject recreation", async () => {
    const repository = new InMemoryTrainingPlanRepository();
    const plans = new TrainingPlanService({
      repository,
      createId: deterministicIds(
        "plan-a1",
        "block-a1",
        "child-a1",
        "standalone-a1",
        "plan-a2",
        "standalone-a2",
        "plan-b",
        "plan-org-b",
        "resurrected-plan",
      ),
      now: () => new Date("2026-10-15T09:00:00.000Z"),
    });
    const lifecycle = new TrainingPlanLifecycleService({
      repository,
      now: () => deletedAt,
    });

    await plans.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      note: "First",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Child", comment: "Personal note" }],
        },
      ],
    });
    await plans.update("org-a", "plan-a1", 1, {
      note: "Second",
      items: [
        {
          kind: "block",
          itemId: "block-a1",
          name: "Block",
          exercises: [
            {
              itemId: "child-a1",
              name: "Child",
              comment: "Updated personal note",
            },
          ],
        },
        {
          kind: "exercise",
          name: "Standalone",
          comment: "Another note",
        },
      ],
    });
    await plans.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-13",
      items: [{ kind: "exercise", name: "Second day" }],
    });
    await plans.create("org-a", {
      subjectId: "athlete-b",
      planDate: "2026-10-12",
    });
    await plans.create("org-b", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });

    await expect(
      lifecycle.deleteSubjectData("org-a", "athlete-a"),
    ).resolves.toEqual({
      deletedPlans: 2,
      deletedRevisions: 3,
      deletedItems: 6,
    });

    await expect(plans.findCurrent("org-a", "plan-a1")).resolves.toBeUndefined();
    await expect(plans.listRevisions("org-a", "plan-a1")).resolves.toEqual([]);
    await expect(
      plans.listForSubjectDateRange(
        "org-a",
        "athlete-a",
        "2026-10-01",
        "2026-10-31",
      ),
    ).resolves.toEqual([]);
    await expect(
      plans.create("org-a", {
        subjectId: "athlete-a",
        planDate: "2026-10-14",
      }),
    ).rejects.toBeInstanceOf(TrainingPlanSubjectDeletedError);

    await expect(plans.findCurrent("org-a", "plan-b")).resolves.toBeDefined();
    await expect(
      plans.findCurrent("org-b", "plan-org-b"),
    ).resolves.toBeDefined();

    await expect(
      lifecycle.deleteSubjectData("org-a", "athlete-a"),
    ).resolves.toEqual({
      deletedPlans: 0,
      deletedRevisions: 0,
      deletedItems: 0,
    });

    await expect(lifecycle.listCurrentDeletionMarkers()).resolves.toEqual([
      {
        organizationId: "org-a",
        subjectId: "athlete-a",
        completedAt: deletedAt,
        purgeAfter: new Date("2026-11-19T10:00:00.000Z"),
      },
    ]);
  });

  it("replays deletion markers into a restored older repository", async () => {
    const sourceRepository = new InMemoryTrainingPlanRepository();
    const sourceLifecycle = new TrainingPlanLifecycleService({
      repository: sourceRepository,
      now: () => deletedAt,
    });
    await sourceLifecycle.deleteSubjectData("org-a", "athlete-a");

    const targetRepository = new InMemoryTrainingPlanRepository();
    const targetPlans = new TrainingPlanService({
      repository: targetRepository,
      createId: deterministicIds("restored-plan"),
      now: () => new Date("2026-10-01T10:00:00.000Z"),
    });
    await targetPlans.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-01",
      items: [{ kind: "exercise", name: "Restored personal data" }],
    });

    await expect(
      reconcileTrainingPlanRestoredDatabase(
        sourceLifecycle,
        targetRepository,
      ),
    ).resolves.toEqual({
      requiredDeletionCount: 1,
      insertedMarkerCount: 1,
      deletedPlans: 1,
      deletedRevisions: 1,
      deletedItems: 1,
    });
    await expect(
      targetPlans.findCurrent("org-a", "restored-plan"),
    ).resolves.toBeUndefined();
    await expect(
      targetPlans.create("org-a", {
        subjectId: "athlete-a",
        planDate: "2026-10-02",
      }),
    ).rejects.toBeInstanceOf(TrainingPlanSubjectDeletedError);
  });

  it("retains markers through the reconciliation window and purges them afterwards", async () => {
    const repository = new InMemoryTrainingPlanRepository();
    const lifecycle = new TrainingPlanLifecycleService({
      repository,
      now: () => deletedAt,
    });
    await lifecycle.deleteSubjectData("org-a", "athlete-a");

    const beforeExpiry = new TrainingPlanLifecycleService({
      repository,
      now: () => beforeMarkerExpiry,
    });
    await expect(beforeExpiry.purgeExpiredDeletionMarkers()).resolves.toBe(0);
    await expect(beforeExpiry.listCurrentDeletionMarkers()).resolves.toHaveLength(1);

    const afterExpiry = new TrainingPlanLifecycleService({
      repository,
      now: () => afterMarkerExpiry,
    });
    await expect(afterExpiry.purgeExpiredDeletionMarkers()).resolves.toBe(1);
    await expect(afterExpiry.listCurrentDeletionMarkers()).resolves.toEqual([]);
  });

  it("validates lifecycle scope and fails closed on invalid repository results", async () => {
    const lifecycle = new TrainingPlanLifecycleService({
      repository: {
        async deleteSubjectData() {
          return {
            deletedPlans: 0,
            deletedRevisions: -1,
            deletedItems: 0,
          };
        },
        async listCurrentDeletionMarkers() {
          return [];
        },
        async reconcileDeletionMarker() {
          return {
            markerInserted: false,
            deletedPlans: 0,
            deletedRevisions: 0,
            deletedItems: 0,
          };
        },
        async purgeExpiredDeletionMarkers() {
          return 0;
        },
      },
      now: () => deletedAt,
    });

    await expect(
      lifecycle.deleteSubjectData(" org-a", "athlete-a"),
    ).rejects.toBeInstanceOf(TrainingPlanValidationError);
    await expect(
      lifecycle.deleteSubjectData("org-a", ""),
    ).rejects.toBeInstanceOf(TrainingPlanValidationError);
    await expect(
      lifecycle.deleteSubjectData("org-a", "athlete-a"),
    ).rejects.toThrow(/invalid deletion result/);
  });
});

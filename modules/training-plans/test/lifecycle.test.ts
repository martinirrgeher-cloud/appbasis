import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingPlanRepository,
  TrainingPlanLifecycleService,
  TrainingPlanService,
  TrainingPlanValidationError,
} from "../src/index";

function deterministicIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

describe("training-plans lifecycle", () => {
  it("physically removes every revision and item for one subject inside one organization", async () => {
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
      ),
      now: () => new Date("2026-10-15T10:00:00.000Z"),
    });
    const lifecycle = new TrainingPlanLifecycleService({ repository });

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
      },
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

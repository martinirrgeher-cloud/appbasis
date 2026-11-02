import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingBlockRepository,
  TrainingBlockLifecycleService,
  TrainingBlockFavoriteDeletionService,
  TrainingBlockService,
} from "../src/index";

describe("training-block personal preference lifecycle primitive", () => {

  it("atomically marks personal favorites deleted and rejects future favorites for the subject only", async () => {
    const repo = new InMemoryTrainingBlockRepository();
    const service = new TrainingBlockService({
      repository: repo,
      createId: (() => {
        const ids = ["block-a", "block-b"];
        return () => ids.shift() ?? "invalid";
      })(),
    });
    const deletion = new TrainingBlockFavoriteDeletionService({
      repository: repo,
      now: () => new Date("2026-11-02T19:30:00.000Z"),
    });
    await service.create("org-a", { name: "A" });
    await service.create("org-b", { name: "B" });
    await service.setFavorite("org-a", "person-1", "block-a", true);
    await service.setFavorite("org-a", "person-2", "block-a", true);
    await service.setFavorite("org-b", "person-1", "block-b", true);

    await expect(deletion.deletePrincipalFavorites("org-a", "person-1"))
      .resolves.toEqual({ markerInserted: true, deletedFavorites: 1 });
    await expect(deletion.deletePrincipalFavorites("org-a", "person-1"))
      .resolves.toEqual({ markerInserted: false, deletedFavorites: 0 });
    await expect(service.setFavorite("org-a", "person-1", "block-a", true))
      .rejects.toThrow(/deletion marker/);
    await expect(service.setFavorite("org-a", "person-1", "block-a", false))
      .resolves.toBe(true);
    await expect(repo.listFavoriteBlockIds("org-a", "person-2"))
      .resolves.toEqual(["block-a"]);
    await expect(repo.listFavoriteBlockIds("org-b", "person-1"))
      .resolves.toEqual(["block-b"]);
    await expect(service.listRevisions("org-a", "block-a")).resolves.toHaveLength(1);
  });

  it("fails closed on invalid identifiers, clocks and repository results", async () => {
    let calls = 0;
    const deletion = new TrainingBlockFavoriteDeletionService({
      repository: {
        async markPrincipalDeletedAndDeleteFavorites() {
          calls++;
          return { markerInserted: true, deletedFavorites: 1 };
        },
      },
    });
    await expect(deletion.deletePrincipalFavorites("", "person")).rejects.toThrow();
    await expect(deletion.deletePrincipalFavorites("org", "")).rejects.toThrow();
    expect(calls).toBe(0);
    expect(() => new TrainingBlockFavoriteDeletionService({ repository: {} as never }))
      .toThrow(/invalid/);
    const badClock = new TrainingBlockFavoriteDeletionService({
      repository: {
        async markPrincipalDeletedAndDeleteFavorites() {
          calls++;
          return { markerInserted: true, deletedFavorites: 0 };
        },
      },
      now: () => new Date(NaN),
    });
    await expect(badClock.deletePrincipalFavorites("org", "person")).rejects.toThrow(/clock/);
    expect(calls).toBe(0);
    const badResult = new TrainingBlockFavoriteDeletionService({
      repository: {
        async markPrincipalDeletedAndDeleteFavorites() {
          return { markerInserted: true, deletedFavorites: -1 };
        },
      },
    });
    await expect(badResult.deletePrincipalFavorites("org", "person")).rejects.toThrow(/invalid result/);
  });

  it("removes only the intended principal's favorites in the intended organization, idempotently", async () => {
    const repository = new InMemoryTrainingBlockRepository();
    const blocks = new TrainingBlockService({
      repository,
      createId: (() => {
        const ids = ["block-1", "block-2", "block-3"];
        return () => ids.shift() ?? "unexpected";
      })(),
    });
    const privacy = new TrainingBlockLifecycleService({ repository });
    await blocks.create("org-a", { name: "A1" });
    await blocks.create("org-a", { name: "A2" });
    await blocks.create("org-b", { name: "B1" });
    for (const [organization, principal, block] of [
      ["org-a", "principal-a", "block-1"],
      ["org-a", "principal-a", "block-2"],
      ["org-a", "principal-b", "block-1"],
      ["org-b", "principal-a", "block-3"],
    ]) {
      expect(await blocks.setFavorite(organization!, principal!, block!, true)).toBe(true);
    }
    await blocks.recordUsage("org-a", "block-1", {
      sourceKind: "training_plan",
      occurredAt: "2026-10-10T11:00:00.000Z",
      note: "not personal favorite data",
    });

    await expect(privacy.deletePrincipalFavorites("org-a", "principal-a")).resolves.toBe(2);
    await expect(privacy.deletePrincipalFavorites("org-a", "principal-a")).resolves.toBe(0);
    await expect(repository.listFavoriteBlockIds("org-a", "principal-a")).resolves.toEqual([]);
    await expect(repository.listFavoriteBlockIds("org-a", "principal-b")).resolves.toEqual(["block-1"]);
    await expect(repository.listFavoriteBlockIds("org-b", "principal-a")).resolves.toEqual(["block-3"]);
    await expect(blocks.listRevisions("org-a", "block-1")).resolves.toHaveLength(1);
    await expect(blocks.listUsage("org-a", "block-1")).resolves.toHaveLength(1);
  });

  it("rejects invalid IDs without executing any deletion", async () => {
    let calls = 0;
    const privacy = new TrainingBlockLifecycleService({
      repository: {
        async deletePrincipalFavorites() { calls += 1; return 0; },
      },
    });
    await expect(privacy.deletePrincipalFavorites("", "principal")).rejects.toThrow();
    await expect(privacy.deletePrincipalFavorites("org", "")).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("fails closed on invalid repositories or reported counts", async () => {
    expect(() => new TrainingBlockLifecycleService({
      repository: {} as never,
    })).toThrow(/invalid/);
    const privacy = new TrainingBlockLifecycleService({
      repository: {
        async deletePrincipalFavorites() { return -1; },
      },
    });
    await expect(privacy.deletePrincipalFavorites("org", "principal")).rejects.toThrow(/invalid count/);
  });
});

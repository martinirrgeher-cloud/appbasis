import { describe, expect, it } from "vitest";
import { reconcileTrainingBlockFavoritesRestoredDatabase } from "../src/index";
import type { TrainingBlockFavoriteDeletionMarker } from "../src/index";

const now = new Date("2026-11-02T12:00:00.000Z");
const marker: TrainingBlockFavoriteDeletionMarker = Object.freeze({
  organizationId: "org-a",
  principalId: "principal-a",
  completedAt: new Date("2026-10-30T12:00:00.000Z"),
  purgeAfter: new Date("2026-12-04T12:00:00.000Z"),
});

describe("training-block favorite offline restore boundary", () => {
  it("replays the newer authority snapshot and supports idempotent retries", async () => {
    const replayed: TrainingBlockFavoriteDeletionMarker[] = [];
    const restored = new Set<string>();
    const target = {
      async reconcileDeletionMarker(input: TrainingBlockFavoriteDeletionMarker) {
        replayed.push(input);
        const key = JSON.stringify([input.organizationId, input.principalId]);
        const markerInserted = !restored.has(key);
        restored.add(key);
        return { markerInserted, deletedFavorites: markerInserted ? 2 : 0 };
      },
    };
    const source = { async listCurrentDeletionMarkers() { return [marker]; } };
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(source, target, now))
      .resolves.toEqual({
        requiredDeletionCount: 1, insertedMarkerCount: 1, deletedFavorites: 2,
      });
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(source, target, now))
      .resolves.toEqual({
        requiredDeletionCount: 1, insertedMarkerCount: 0, deletedFavorites: 0,
      });
    expect(replayed).toHaveLength(2);
  });

  it("validates the complete source before any target writes", async () => {
    let targetWrites = 0;
    const target = {
      async reconcileDeletionMarker() {
        targetWrites++;
        return { markerInserted: true, deletedFavorites: 0 };
      },
    };
    for (const candidates of [
      [marker, marker],
      [marker, { ...marker, principalId: "  invalid" }],
      [marker, { ...marker, purgeAfter: new Date("2026-12-03T12:00:00.000Z") }],
      [marker, { ...marker, completedAt: new Date("2026-11-03T12:00:00.000Z") }],
      [marker, { ...marker, purgeAfter: new Date("2026-11-01T12:00:00.000Z") }],
    ]) {
      await expect(reconcileTrainingBlockFavoritesRestoredDatabase(
        { async listCurrentDeletionMarkers() { return candidates; } },
        target, now,
      )).rejects.toThrow();
    }
    expect(targetWrites).toBe(0);
  });

  it("blocks on a failed target replay and never reports partial success", async () => {
    const another: TrainingBlockFavoriteDeletionMarker = {
      ...marker, principalId: "principal-b",
    };
    let count = 0;
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(
      { async listCurrentDeletionMarkers() { return [marker, another]; } },
      { async reconcileDeletionMarker() {
        count++;
        if (count === 2) throw new Error("marker conflict");
        return { markerInserted: true, deletedFavorites: 0 };
      } },
      now,
    )).rejects.toThrow(/marker conflict/);
    expect(count).toBe(2);
  });

  it("fails closed on invalid source lists, timestamps and replay responses", async () => {
    const target = { async reconcileDeletionMarker() {
      return { markerInserted: false, deletedFavorites: -1 };
    } };
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(
      { async listCurrentDeletionMarkers() { return [marker]; } }, target, new Date(NaN),
    )).rejects.toThrow(/timestamp/);
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(
      { async listCurrentDeletionMarkers() { return null as never; } }, target, now,
    )).rejects.toThrow(/authoritative/);
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(
      { async listCurrentDeletionMarkers() { return [marker]; } }, target, now,
    )).rejects.toThrow(/replay result/);
  });
});

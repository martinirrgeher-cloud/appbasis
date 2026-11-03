import { describe, expect, it } from "vitest";

import {
  reconcileTrainingBlockSubjectUsageRestoredDatabase,
  type TrainingBlockSubjectUsageDeletionMarker,
} from "../src/index";

const now = new Date("2027-01-10T12:00:00.000Z");
const marker: TrainingBlockSubjectUsageDeletionMarker = Object.freeze({
  organizationId: "org-a",
  subjectId: "athlete-a",
  completedAt: new Date("2026-11-01T12:00:00.000Z"),
  purgeAfter: new Date("2026-12-06T12:00:00.000Z"),
});

describe("training-block subject usage OFFLINE restore safety", () => {
  it("replays expired-but-effective authority and supports idempotent retries", async () => {
    const seen = new Set<string>();
    const target = {
      async reconcileSubjectUsageDeletionMarker(input: TrainingBlockSubjectUsageDeletionMarker) {
        const key = JSON.stringify([input.organizationId, input.subjectId]);
        const markerInserted = !seen.has(key);
        seen.add(key);
        return { markerInserted, deletedUsageEvents: markerInserted ? 2 : 0 };
      },
    };
    const source = { async listSubjectUsageDeletionMarkers() { return [marker]; } };
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      source, target, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1, insertedMarkerCount: 1, deletedUsageEvents: 2,
    });
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      source, target, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1, insertedMarkerCount: 0, deletedUsageEvents: 0,
    });
  });

  it("validates the ENTIRE source before the first target mutation", async () => {
    let writes = 0;
    const target = {
      async reconcileSubjectUsageDeletionMarker() {
        writes++;
        return { markerInserted: true, deletedUsageEvents: 0 };
      },
    };
    for (const markers of [
      [marker, marker],
      [marker, { ...marker, subjectId: " other" }],
      [marker, { ...marker, organizationId: "org-other " }],
      [marker, { ...marker, purgeAfter: new Date("2026-12-07T12:00:00.000Z") }],
      [marker, { ...marker, completedAt: new Date("2027-01-11T12:00:00.000Z") }],
      [marker, { ...marker, completedAt: new Date(NaN) }],
    ]) {
      await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
        { async listSubjectUsageDeletionMarkers() { return markers; } },
        target, now,
      )).rejects.toThrow();
    }
    expect(writes).toBe(0);
  });

  it("fails on incomplete authority, invalid result, or target replay conflicts", async () => {
    const target = { async reconcileSubjectUsageDeletionMarker() {
      return { markerInserted: false, deletedUsageEvents: -1 };
    } };
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      { async listSubjectUsageDeletionMarkers() { return null as never; } },
      target, now,
    )).rejects.toThrow(/authority/);
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      { async listSubjectUsageDeletionMarkers() { return [marker]; } },
      target, now,
    )).rejects.toThrow(/replay result/);
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      { async listSubjectUsageDeletionMarkers() { return [marker]; } },
      target, new Date(NaN),
    )).rejects.toThrow(/timestamp/);

    const other = { ...marker, subjectId: "athlete-b" };
    let writes = 0;
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      { async listSubjectUsageDeletionMarkers() { return [marker, other]; } },
      { async reconcileSubjectUsageDeletionMarker() {
        writes++;
        if (writes === 2) throw new Error("conflicting restored tombstone");
        return { markerInserted: true, deletedUsageEvents: 1 };
      } },
      now,
    )).rejects.toThrow(/conflicting/);
    expect(writes).toBe(2);
  });

  it("does not treat an empty authority response as evidence of deletion completeness", async () => {
    let writes = 0;
    const result = await reconcileTrainingBlockSubjectUsageRestoredDatabase(
      { async listSubjectUsageDeletionMarkers() { return []; } },
      { async reconcileSubjectUsageDeletionMarker() {
        writes++;
        return { markerInserted: true, deletedUsageEvents: 0 };
      } },
      now,
    );
    expect(result).toEqual({
      requiredDeletionCount: 0, insertedMarkerCount: 0, deletedUsageEvents: 0,
    });
    expect(writes).toBe(0);
  });
});

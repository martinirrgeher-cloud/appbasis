import { describe, expect, it } from "vitest";

import {
  reconcileTrainingDocumentationRestoredDatabase,
  type TrainingDocumentationSubjectDeletionMarker,
} from "../src/index";

const now = new Date("2027-02-01T12:00:00.000Z");
const marker: TrainingDocumentationSubjectDeletionMarker = {
  organizationId: "org-a",
  subjectId: "athlete-a",
  completedAt: new Date("2026-11-01T12:00:00.000Z"),
  purgeAfter: new Date("2026-12-06T12:00:00.000Z"),
};

describe("training-documentation offline restore authority", () => {
  it("replays expired-but-effective decisions, counts redaction and remains idempotent", async () => {
    const seen = new Set<string>();
    const source = {
      async listSubjectDeletionMarkers() { return [marker]; },
    };
    const target = {
      async reconcileSubjectDeletionMarker(decision: TrainingDocumentationSubjectDeletionMarker) {
        const key = JSON.stringify([decision.organizationId, decision.subjectId]);
        const markerInserted = !seen.has(key);
        seen.add(key);
        return {
          markerInserted,
          deletedDocuments: markerInserted ? 1 : 0,
          deletedRevisions: markerInserted ? 2 : 0,
          redactedOtherSubjectRevisions: markerInserted ? 3 : 0,
        };
      },
    };
    await expect(reconcileTrainingDocumentationRestoredDatabase(
      source, target, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1,
      insertedMarkerCount: 1,
      deletedDocuments: 1,
      deletedRevisions: 2,
      redactedOtherSubjectRevisions: 3,
    });
    await expect(reconcileTrainingDocumentationRestoredDatabase(
      source, target, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1,
      insertedMarkerCount: 0,
      deletedDocuments: 0,
      deletedRevisions: 0,
      redactedOtherSubjectRevisions: 0,
    });
  });

  it("rejects the entire malformed source before the first offline write", async () => {
    let writes = 0;
    const target = { async reconcileSubjectDeletionMarker() {
      writes++;
      return { markerInserted: true, deletedDocuments: 0,
        deletedRevisions: 0, redactedOtherSubjectRevisions: 0 };
    } };
    const invalidInputs: unknown[] = [
      [marker, marker],
      [marker, { ...marker, subjectId: " other" }],
      [marker, { ...marker, organizationId: "other " }],
      [marker, { ...marker, purgeAfter: new Date("2026-12-07T12:00:00.000Z") }],
      [marker, { ...marker, completedAt: new Date("2027-02-02T12:00:00.000Z") }],
      [marker, { ...marker, completedAt: new Date(NaN) }],
      [marker, { ...marker, completedAt: "2026-11-01T12:00:00Z" }],
      [marker, { ...marker, purgeAfter: null }],
      [marker, null],
      null,
    ];
    for (const input of invalidInputs) {
      await expect(reconcileTrainingDocumentationRestoredDatabase(
        { async listSubjectDeletionMarkers() {
          return input as readonly TrainingDocumentationSubjectDeletionMarker[];
        } },
        target, now,
      )).rejects.toThrow();
    }
    expect(writes).toBe(0);
  });

  it("rejects invalid replay totals and propagates conflicts (no promotion)", async () => {
    await expect(reconcileTrainingDocumentationRestoredDatabase(
      { async listSubjectDeletionMarkers() { return [marker]; } },
      { async reconcileSubjectDeletionMarker() {
        return { markerInserted: true, deletedDocuments: 2,
          deletedRevisions: 1, redactedOtherSubjectRevisions: 0 };
      } }, now,
    )).rejects.toThrow(/replay result/);
    await expect(reconcileTrainingDocumentationRestoredDatabase(
      { async listSubjectDeletionMarkers() { return [marker]; } },
      { async reconcileSubjectDeletionMarker() {
        throw new Error("conflicting deletion decision");
      } }, now,
    )).rejects.toThrow(/conflicting/);
    await expect(reconcileTrainingDocumentationRestoredDatabase(
      { async listSubjectDeletionMarkers() { return [marker]; } },
      { async reconcileSubjectDeletionMarker() {
        return { markerInserted: true, deletedDocuments: 0,
          deletedRevisions: 0, redactedOtherSubjectRevisions: 0 };
      } }, new Date(NaN),
    )).rejects.toThrow(/timestamp/);
  });

  it("does not claim that an empty source proves historical completeness", async () => {
    let writes = 0;
    const result = await reconcileTrainingDocumentationRestoredDatabase(
      { async listSubjectDeletionMarkers() { return []; } },
      { async reconcileSubjectDeletionMarker() {
        writes++;
        return { markerInserted: true, deletedDocuments: 0,
          deletedRevisions: 0, redactedOtherSubjectRevisions: 0 };
      } }, now,
    );
    expect(result).toEqual({
      requiredDeletionCount: 0,
      insertedMarkerCount: 0,
      deletedDocuments: 0,
      deletedRevisions: 0,
      redactedOtherSubjectRevisions: 0,
    });
    expect(writes).toBe(0);
  });
});

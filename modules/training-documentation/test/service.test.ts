import { describe, expect, it } from "vitest";

import {
  InMemoryTrainingDocumentationRepository,
  TrainingDocumentationCompletedError,
  TrainingDocumentationConflictError,
  TrainingDocumentationService,
} from "../src";

function service() {
  const repository = new InMemoryTrainingDocumentationRepository();
  let id = 0;
  let minute = 0;
  return new TrainingDocumentationService({
    repository,
    createId: () => "documentation-" + String(++id),
    now: () =>
      new Date(
        "2026-10-26T08:" + String(minute++).padStart(2, "0") + ":00.000Z",
      ),
  });
}

const draft = {
  subjectId: "group-1",
  sessionDate: "2026-10-26",
  sourcePlanId: "plan-1",
  sourcePlanRevision: 2,
  note: "Plan übernommen",
  items: [
    {
      kind: "exercise" as const,
      sourceItemId: "item-1",
      sourceExerciseId: "exercise-1",
      name: "Steigerungsläufe",
      plannedRepetitions: "4",
    },
  ],
  attendance: [
    {
      participantId: "athlete-1",
      displayName: "Anna Beispiel",
      status: "present" as const,
    },
  ],
};

describe("training documentation service", () => {
  it("creates, edits, completes, reopens and preserves the plan source", async () => {
    const subject = service();
    const created = await subject.create("org-1", draft);
    expect(created).toMatchObject({
      id: "documentation-1",
      status: "draft",
      currentRevision: 1,
      sourcePlanId: "plan-1",
      sourcePlanRevision: 2,
    });

    const updated = await subject.update("org-1", created.id, 1, {
      note: "Tatsächlich kürzer",
      items: [
        {
          ...draft.items[0],
          performed: true,
          actualRepetitions: "3",
        },
      ],
    });
    expect(updated).toMatchObject({
      currentRevision: 2,
      status: "draft",
      revision: {
        note: "Tatsächlich kürzer",
        items: [{ actualRepetitions: "3" }],
      },
    });

    const completed = await subject.complete("org-1", created.id, 2);
    expect(completed).toMatchObject({
      currentRevision: 3,
      status: "completed",
    });
    expect(completed?.completedAt).toMatch(/^2026-10-26T08:/);

    await expect(
      subject.update("org-1", created.id, 3, { note: "nicht erlaubt" }),
    ).rejects.toBeInstanceOf(TrainingDocumentationCompletedError);

    const reopened = await subject.reopen("org-1", created.id, 3);
    expect(reopened).toMatchObject({
      currentRevision: 4,
      status: "draft",
      completedAt: null,
      sourcePlanId: "plan-1",
      sourcePlanRevision: 2,
    });

    const revisions = await subject.listRevisions("org-1", created.id);
    expect(revisions.map((entry) => entry.revision)).toEqual([4, 3, 2, 1]);
  });

  it("fails closed on stale revisions", async () => {
    const subject = service();
    const created = await subject.create("org-1", draft);
    await subject.update("org-1", created.id, 1, { note: "neu" });
    await expect(
      subject.complete("org-1", created.id, 1),
    ).rejects.toBeInstanceOf(TrainingDocumentationConflictError);
  });

  it("keeps one documentation per subject and day", async () => {
    const subject = service();
    await subject.create("org-1", draft);
    await expect(subject.create("org-1", draft)).rejects.toMatchObject({
      name: "TrainingDocumentationTargetOccupiedError",
    });
  });
});

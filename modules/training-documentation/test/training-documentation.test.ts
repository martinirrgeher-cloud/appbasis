import { describe, expect, it } from "vitest";

import {
  TrainingDocumentationValidationError,
  normalizeTrainingDocumentationDraft,
} from "../src";

describe("training documentation domain", () => {
  it("normalizes a plan snapshot, actual values and attendance", () => {
    expect(
      normalizeTrainingDocumentationDraft({
        subjectId: "group-1",
        sessionDate: "2026-10-26",
        sourcePlanId: "plan-1",
        sourcePlanRevision: 4,
        note: "  Gute Einheit  ",
        items: [
          {
            kind: "block",
            sourceItemId: "item-block-1",
            sourceBlockId: "block-1",
            sourceBlockRevision: 3,
            name: "Sprint",
            plannedDurationMinutes: 20,
            performed: true,
            actualDurationMinutes: 18,
            exercises: [
              {
                sourceItemId: "item-exercise-1",
                sourceExerciseId: "exercise-1",
                name: "30 m Sprint",
                plannedRepetitions: "6",
                performed: true,
                actualRepetitions: "5",
              },
            ],
          },
        ],
        attendance: [
          {
            participantId: "athlete-1",
            displayName: "Anna Beispiel",
            status: "present",
          },
        ],
      }),
    ).toMatchObject({
      subjectId: "group-1",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      note: "Gute Einheit",
      items: [
        {
          kind: "block",
          sortOrder: 0,
          actualDurationMinutes: 18,
          exercises: [
            {
              kind: "exercise",
              sortOrder: 0,
              actualRepetitions: "5",
            },
          ],
        },
      ],
      attendance: [
        {
          participantId: "athlete-1",
          status: "present",
        },
      ],
    });
  });

  it("defaults planned items to performed and rejects duplicate attendance", () => {
    const draft = normalizeTrainingDocumentationDraft({
      subjectId: "group-1",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-1",
      sourcePlanRevision: 1,
      items: [{ kind: "exercise", name: "Lauf" }],
    });
    expect(draft.items[0]).toMatchObject({ performed: true });

    expect(() =>
      normalizeTrainingDocumentationDraft({
        subjectId: "group-1",
        sessionDate: "2026-10-26",
        sourcePlanId: "plan-1",
        sourcePlanRevision: 1,
        attendance: [
          {
            participantId: "athlete-1",
            displayName: "A",
            status: "present",
          },
          {
            participantId: "athlete-1",
            displayName: "A",
            status: "absent",
          },
        ],
      }),
    ).toThrow(TrainingDocumentationValidationError);
  });
});

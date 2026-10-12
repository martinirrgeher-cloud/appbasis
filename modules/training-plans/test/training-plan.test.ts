import { describe, expect, it } from "vitest";

import {
  TrainingPlanValidationError,
  normalizeTrainingPlanDraft,
} from "../src/training-plan";

describe("training-plans domain", () => {
  it("normalizes one athlete/day plan with blocks and standalone exercises", () => {
    expect(
      normalizeTrainingPlanDraft({
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        note: " Schwerpunkt Sprint ",
        items: [
          {
            kind: "block",
            sourceBlockId: "block-1",
            sourceBlockRevision: 4,
            name: " Beschleunigung ",
            durationMinutes: 35,
            note: " technisch sauber ",
            exercises: [
              {
                sourceExerciseId: "exercise-1",
                name: " 30 m Sprint ",
                sets: " 4 ",
                repetitions: " 3 ",
                amount: " 30 ",
                unit: " m ",
                comment: " lange Pause ",
              },
            ],
          },
          {
            kind: "exercise",
            name: " Auslaufen ",
            amount: " 10 ",
            unit: " min ",
          },
        ],
      }),
    ).toEqual({
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      note: "Schwerpunkt Sprint",
      items: [
        {
          kind: "block",
          sourceBlockId: "block-1",
          sourceBlockRevision: 4,
          name: "Beschleunigung",
          durationMinutes: 35,
          note: "technisch sauber",
          sortOrder: 0,
          exercises: [
            {
              kind: "exercise",
              sourceExerciseId: "exercise-1",
              name: "30 m Sprint",
              sets: "4",
              repetitions: "3",
              amount: "30",
              unit: "m",
              comment: "lange Pause",
              sortOrder: 0,
            },
          ],
        },
        {
          kind: "exercise",
          sourceExerciseId: null,
          name: "Auslaufen",
          sets: null,
          repetitions: null,
          amount: "10",
          unit: "min",
          comment: null,
          sortOrder: 1,
        },
      ],
    });
  });

  it("keeps copied block provenance together and owns snapshot values", () => {
    const draft = normalizeTrainingPlanDraft({
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          sourceBlockId: "block-1",
          sourceBlockRevision: 7,
          name: "Snapshot name",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "Snapshot exercise",
              repetitions: "5",
            },
          ],
        },
      ],
    });

    expect(draft.items[0]).toMatchObject({
      sourceBlockId: "block-1",
      sourceBlockRevision: 7,
      name: "Snapshot name",
    });
    expect(
      draft.items[0]?.kind === "block"
        ? draft.items[0].exercises[0]
        : null,
    ).toMatchObject({
      sourceExerciseId: "exercise-1",
      name: "Snapshot exercise",
      repetitions: "5",
    });
  });

  it("allows catalog-backed and manual exercises", () => {
    const draft = normalizeTrainingPlanDraft({
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      items: [
        {
          kind: "exercise",
          sourceExerciseId: "exercise-1",
          name: "Katalogübung",
        },
        {
          kind: "exercise",
          name: "Manuelle Übung",
        },
      ],
    });

    expect(draft.items.map((item) =>
      item.kind === "exercise" ? item.sourceExerciseId : null,
    )).toEqual(["exercise-1", null]);
  });

  it("requires block id and revision provenance together", () => {
    expect(() =>
      normalizeTrainingPlanDraft({
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        items: [
          {
            kind: "block",
            sourceBlockId: "block-1",
            name: "Block",
          },
        ],
      }),
    ).toThrow(/id and revision must be provided together/);

    expect(() =>
      normalizeTrainingPlanDraft({
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        items: [
          {
            kind: "block",
            sourceBlockRevision: 2,
            name: "Block",
          },
        ],
      }),
    ).toThrow(/id and revision must be provided together/);
  });

  it("rejects invalid dates and oversized plan contents", () => {
    expect(() =>
      normalizeTrainingPlanDraft({
        subjectId: "athlete-1",
        planDate: "2026-02-30",
      }),
    ).toThrow(TrainingPlanValidationError);

    expect(() =>
      normalizeTrainingPlanDraft({
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        items: Array.from({ length: 201 }, (_, index) => ({
          kind: "exercise" as const,
          name: `Exercise ${index}`,
        })),
      }),
    ).toThrow(/at most 200/);

    expect(() =>
      normalizeTrainingPlanDraft({
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        items: [
          ...Array.from({ length: 2 }, (_, blockIndex) => ({
            kind: "block" as const,
            name: `Block ${blockIndex}`,
            exercises: Array.from({ length: 200 }, (_, exerciseIndex) => ({
              name: `B${blockIndex}-E${exerciseIndex}`,
            })),
          })),
          ...Array.from({ length: 101 }, (_, index) => ({
            kind: "exercise" as const,
            name: `Top ${index}`,
          })),
        ],
      }),
    ).toThrow(/at most 500/);
  });

  it("rejects PostgreSQL-incompatible text", () => {
    for (const invalid of ["A\0B", "\ud800", "\udc00"]) {
      expect(() =>
        normalizeTrainingPlanDraft({
          subjectId: "athlete-1",
          planDate: "2026-10-12",
          items: [{ kind: "exercise", name: invalid }],
        }),
      ).toThrow(TrainingPlanValidationError);
    }
  });
});

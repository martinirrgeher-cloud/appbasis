import { describe, expect, it } from "vitest";

import {
  TrainingBlockValidationError,
  normalizeTrainingBlockDraft,
} from "../src/training-block";

describe("training-blocks domain", () => {
  it("normalizes one audience, optional duration and exercise parameter overrides", () => {
    expect(
      normalizeTrainingBlockDraft({
        name: " Beschleunigung A ",
        audienceId: "group-sprint",
        durationMinutes: 35,
        note: " Technik vor Intensität ",
        exercises: [
          {
            exerciseId: "exercise-1",
            note: " 3 Minuten Serienpause ",
            parameterOverrides: [
              { key: "sets", value: "4" },
              { key: "distance", value: "30 m" },
            ],
          },
        ],
      }),
    ).toEqual({
      name: "Beschleunigung A",
      audienceId: "group-sprint",
      durationMinutes: 35,
      note: "Technik vor Intensität",
      exercises: [
        {
          exerciseId: "exercise-1",
          note: "3 Minuten Serienpause",
          parameterOverrides: [
            { key: "sets", value: "4", sortOrder: 0 },
            { key: "distance", value: "30 m", sortOrder: 1 },
          ],
          sortOrder: 0,
        },
      ],
    });
  });

  it("keeps duration empty when it has not been planned yet", () => {
    expect(
      normalizeTrainingBlockDraft({
        name: "Technikblock",
        audienceId: "group-u16",
      }).durationMinutes,
    ).toBeNull();
  });

  it("allows the same catalog exercise more than once in one block", () => {
    const block = normalizeTrainingBlockDraft({
      name: "Sprintleiter",
      exercises: [
        { exerciseId: "exercise-1" },
        { exerciseId: "exercise-1" },
      ],
    });

    expect(block.exercises).toHaveLength(2);
    expect(block.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      "exercise-1",
      "exercise-1",
    ]);
    expect(block.exercises.map((exercise) => exercise.sortOrder)).toEqual([
      0,
      1,
    ]);
  });

  it("rejects duplicate parameter overrides inside one exercise item", () => {
    expect(() =>
      normalizeTrainingBlockDraft({
        name: "Block",
        exercises: [
          {
            exerciseId: "exercise-1",
            parameterOverrides: [
              { key: "sets", value: "3" },
              { key: "sets", value: "4" },
            ],
          },
        ],
      }),
    ).toThrow(/duplicate parameter override/);
  });

  it("rejects invalid names, durations and oversized item collections", () => {
    expect(() =>
      normalizeTrainingBlockDraft({
        name: " ",
      }),
    ).toThrow(TrainingBlockValidationError);

    expect(() =>
      normalizeTrainingBlockDraft({
        name: "Block",
        durationMinutes: 0,
      }),
    ).toThrow(/duration/);

    expect(() =>
      normalizeTrainingBlockDraft({
        name: "Block",
        exercises: Array.from({ length: 201 }, (_, index) => ({
          exerciseId: `exercise-${index}`,
        })),
      }),
    ).toThrow(/at most 200/);
  });
});

import { describe, expect, it } from "vitest";

import {
  ULC_EXERCISE_CATEGORIES,
  ULC_EXERCISE_PARAMETER_KEYS,
  UlcExerciseCatalogValidationError,
  createUlcExerciseCatalogItem,
  exerciseCategoryLabel,
} from "../worker/exercise-catalog-domain";

describe("ULC exercise catalog domain", () => {
  it("normalizes the first catalog item contract", () => {
    expect(
      createUlcExerciseCatalogItem(
        {
          name: "  A-Skip  ",
          categoryKey: "warmup",
          subcategory: " Lauf-ABC ",
          goal: " Kniehub und Fußaufsatz ",
          equipment: ["Hütchen", " Minihürden "],
          videoUrl: "https://example.com/a-skip",
          groupIds: ["u14-group", "u12-group"],
          parameters: [
            {
              key: "distance_m",
              label: "Distanz",
              unit: "m",
              inputType: "number",
              defaultValue: "20",
              minValue: 10,
              maxValue: 60,
              stepValue: 5,
              isRequired: true,
              sortOrder: 20,
            },
            {
              key: "sets",
              label: "Sätze",
              inputType: "number",
              defaultValue: "2",
              sortOrder: 10,
            },
          ],
        },
        { id: "exercise-1", organizationId: "verein-1" },
      ),
    ).toEqual({
      id: "exercise-1",
      organizationId: "verein-1",
      name: "A-Skip",
      categoryKey: "warmup",
      subcategory: "Lauf-ABC",
      goal: "Kniehub und Fußaufsatz",
      description: null,
      coachingCues: null,
      commonMistakes: null,
      equipment: ["Hütchen", "Minihürden"],
      videoUrl: "https://example.com/a-skip",
      groupIds: ["u12-group", "u14-group"],
      parameters: [
        {
          key: "sets",
          label: "Sätze",
          unit: "",
          inputType: "number",
          defaultValue: "2",
          minValue: null,
          maxValue: null,
          stepValue: null,
          isRequired: false,
          sortOrder: 10,
        },
        {
          key: "distance_m",
          label: "Distanz",
          unit: "m",
          inputType: "number",
          defaultValue: "20",
          minValue: 10,
          maxValue: 60,
          stepValue: 5,
          isRequired: true,
          sortOrder: 20,
        },
      ],
      isActive: true,
    });
  });

  it("pins the accepted sprint-oriented categories and planning parameters", () => {
    expect(ULC_EXERCISE_CATEGORIES.map((category) => category.key)).toEqual([
      "warmup",
      "acceleration",
      "max_velocity",
      "speed_endurance",
      "start_reaction",
      "technique",
      "plyometrics",
      "strength",
      "stability",
      "regeneration",
      "other",
    ]);
    expect(ULC_EXERCISE_PARAMETER_KEYS).toContain("sets");
    expect(ULC_EXERCISE_PARAMETER_KEYS).toContain("repetitions");
    expect(ULC_EXERCISE_PARAMETER_KEYS).toContain("distance_m");
    expect(ULC_EXERCISE_PARAMETER_KEYS).toContain("intensity_percent");
    expect(ULC_EXERCISE_PARAMETER_KEYS).toContain("rest_s");
    expect(exerciseCategoryLabel("max_velocity")).toBe(
      "Maximalgeschwindigkeit",
    );
  });

  it("rejects invalid categories, unsafe links and duplicate scope values", () => {
    expect(() =>
      createUlcExerciseCatalogItem(
        {
          name: "A-Skip",
          categoryKey: "unknown" as "warmup",
        },
        { id: "exercise-1", organizationId: "verein-1" },
      ),
    ).toThrow(UlcExerciseCatalogValidationError);

    expect(() =>
      createUlcExerciseCatalogItem(
        {
          name: "A-Skip",
          categoryKey: "warmup",
          videoUrl: "javascript:alert(1)",
        },
        { id: "exercise-1", organizationId: "verein-1" },
      ),
    ).toThrow(/HTTP or HTTPS/);

    expect(() =>
      createUlcExerciseCatalogItem(
        {
          name: "A-Skip",
          categoryKey: "warmup",
          groupIds: ["group-1", "group-1"],
        },
        { id: "exercise-1", organizationId: "verein-1" },
      ),
    ).toThrow(/duplicates/);
  });

  it("rejects invalid planning parameter ranges and duplicate parameter keys", () => {
    expect(() =>
      createUlcExerciseCatalogItem(
        {
          name: "Sprint",
          categoryKey: "acceleration",
          parameters: [
            {
              key: "distance_m",
              label: "Distanz",
              inputType: "number",
              minValue: 40,
              maxValue: 20,
            },
          ],
        },
        { id: "exercise-1", organizationId: "verein-1" },
      ),
    ).toThrow(/minimum must not exceed maximum/);

    expect(() =>
      createUlcExerciseCatalogItem(
        {
          name: "Sprint",
          categoryKey: "acceleration",
          parameters: [
            {
              key: "sets",
              label: "Sätze",
              inputType: "number",
            },
            {
              key: "sets",
              label: "Serien",
              inputType: "number",
            },
          ],
        },
        { id: "exercise-1", organizationId: "verein-1" },
      ),
    ).toThrow(/duplicate key/);
  });
});

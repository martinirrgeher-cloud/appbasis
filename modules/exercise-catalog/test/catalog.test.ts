import { describe, expect, it } from "vitest";

import {
  EXERCISE_CATALOG_CAPABILITIES,
  ExerciseCatalogValidationError,
  createExerciseCatalogDefinition,
  createExerciseCatalogItem,
} from "../src/index";

const definition = createExerciseCatalogDefinition({
  categories: [
    { key: "speed", label: "Speed" },
    { key: "strength", label: "Strength" },
  ],
  parameterKeys: ["distance_m", "sets", "tempo_text"],
});

describe("exercise catalog module foundation", () => {
  it("exposes deterministic module capabilities", () => {
    expect(EXERCISE_CATALOG_CAPABILITIES).toEqual({
      edit: "exercise-catalog:edit",
      view: "exercise-catalog:view",
    });
  });

  it("validates configured categories and parameter keys", () => {
    const item = createExerciseCatalogItem(
      {
        name: "Flying sprint",
        categoryKey: "speed",
        audienceIds: ["u16", "sprint"],
        equipment: ["cones"],
        videoUrl: "https://example.test/video",
        parameters: [
          {
            key: "distance_m",
            label: "Distance",
            unit: "m",
            inputType: "number",
            defaultValue: "30",
            minValue: 10,
            maxValue: 80,
            stepValue: 5,
          },
        ],
      },
      {
        id: "exercise-1",
        organizationId: "org-1",
        definition,
      },
    );

    expect(item).toMatchObject({
      id: "exercise-1",
      organizationId: "org-1",
      categoryKey: "speed",
      audienceIds: ["sprint", "u16"],
      isActive: true,
    });
    expect(item.parameters[0]).toMatchObject({
      key: "distance_m",
      inputType: "number",
      defaultValue: "30",
    });
  });

  it("rejects values not enabled by the definition", () => {
    expect(() =>
      createExerciseCatalogItem(
        { name: "Unknown", categoryKey: "throws" },
        { id: "exercise-1", organizationId: "org-1", definition },
      ),
    ).toThrow(/category is not enabled/i);

    expect(() =>
      createExerciseCatalogItem(
        {
          name: "Unknown parameter",
          categoryKey: "speed",
          parameters: [
            {
              key: "athletics_only",
              label: "Athletics",
              inputType: "text",
            },
          ],
        },
        { id: "exercise-2", organizationId: "org-1", definition },
      ),
    ).toThrow(/parameter key is not enabled/i);
  });

  it("fails closed for duplicate config and invalid parameter ranges", () => {
    expect(() =>
      createExerciseCatalogDefinition({
        categories: [
          { key: "speed", label: "Speed" },
          { key: "speed", label: "Duplicate" },
        ],
      }),
    ).toThrow(/duplicate key/i);

    expect(() =>
      createExerciseCatalogItem(
        {
          name: "Invalid range",
          categoryKey: "speed",
          parameters: [
            {
              key: "distance_m",
              label: "Distance",
              inputType: "number",
              minValue: 20,
              maxValue: 10,
            },
          ],
        },
        { id: "exercise-3", organizationId: "org-1", definition },
      ),
    ).toThrow(ExerciseCatalogValidationError);
  });

  it("accepts app-specific categories and parameter keys without module enums", () => {
    const custom = createExerciseCatalogDefinition({
      categories: [{ key: "mobility", label: "Mobility" }],
      parameterKeys: ["rounds"],
    });
    const item = createExerciseCatalogItem(
      {
        name: "Mobility circuit",
        categoryKey: "mobility",
        parameters: [
          {
            key: "rounds",
            label: "Rounds",
            inputType: "number",
            defaultValue: "3",
          },
        ],
      },
      { id: "generic-1", organizationId: "org-x", definition: custom },
    );

    expect(item.categoryKey).toBe("mobility");
    expect(item.parameters[0]?.key).toBe("rounds");
  });
});

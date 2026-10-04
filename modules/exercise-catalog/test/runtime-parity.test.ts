import { describe, expect, it } from "vitest";

import {
  ExerciseCatalogValidationError,
  createExerciseCatalogDefinition,
  createExerciseCatalogItem,
} from "../src/index";

const definition = createExerciseCatalogDefinition({
  categories: [{ key: "speed", label: "Speed" }],
  parameterKeys: ["sets"],
});

describe("exercise catalog runtime/schema parity", () => {
  it("rejects more than 100 equipment entries", () => {
    expect(() =>
      createExerciseCatalogItem(
        {
          name: "Equipment overflow",
          categoryKey: "speed",
          equipment: Array.from(
            { length: 101 },
            (_, index) => "item-" + String(index),
          ),
        },
        { id: "item-1", organizationId: "org-1", definition },
      ),
    ).toThrow(ExerciseCatalogValidationError);
  });

  it("rejects non-boolean active and required flags", () => {
    expect(() =>
      createExerciseCatalogItem(
        {
          name: "Invalid active",
          categoryKey: "speed",
          isActive: "false" as never,
        },
        { id: "item-2", organizationId: "org-1", definition },
      ),
    ).toThrow(ExerciseCatalogValidationError);

    expect(() =>
      createExerciseCatalogItem(
        {
          name: "Invalid required",
          categoryKey: "speed",
          parameters: [
            {
              key: "sets",
              label: "Sets",
              inputType: "number",
              isRequired: "false" as never,
            },
          ],
        },
        { id: "item-3", organizationId: "org-1", definition },
      ),
    ).toThrow(ExerciseCatalogValidationError);
  });

  it("rejects malformed outer item arguments as validation failures", () => {
    expect(() =>
      createExerciseCatalogItem(null as never, {
        id: "item-4",
        organizationId: "org-1",
        definition,
      }),
    ).toThrow(ExerciseCatalogValidationError);

    expect(() =>
      createExerciseCatalogItem(
        { name: "Invalid context", categoryKey: "speed" },
        null as never,
      ),
    ).toThrow(ExerciseCatalogValidationError);
  });

  it("rejects a canonicalized video URL that exceeds the schema limit", () => {
    const unicodeUrl = "https://example.test/" + "é".repeat(400);
    expect(unicodeUrl.length).toBeLessThanOrEqual(2_000);

    expect(() =>
      createExerciseCatalogItem(
        {
          name: "Expanded URL",
          categoryKey: "speed",
          videoUrl: unicodeUrl,
        },
        { id: "item-5", organizationId: "org-1", definition },
      ),
    ).toThrow(ExerciseCatalogValidationError);
  });
});

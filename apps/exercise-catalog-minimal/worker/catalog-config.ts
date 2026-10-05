import { createExerciseCatalogDefinition } from "@appbasis/exercise-catalog";

export const EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID =
  "exercise-catalog-minimal-org";

export const EXERCISE_CATALOG_MINIMAL_DEFINITION =
  createExerciseCatalogDefinition({
    categories: [
      { key: "strength", label: "Strength" },
      { key: "mobility", label: "Mobility" },
    ],
    parameterKeys: ["duration", "repetitions"],
  });

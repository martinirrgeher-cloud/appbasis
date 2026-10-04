import { ExerciseCatalogValidationError } from "./catalog-error";
import type {
  ExerciseCatalogCategory,
  ExerciseCatalogDefinition,
} from "./types";
import { requiredKey, requiredText } from "./validation";

export function createExerciseCatalogDefinition(input: {
  readonly categories: readonly ExerciseCatalogCategory[];
  readonly parameterKeys?: readonly string[];
}): ExerciseCatalogDefinition {
  if (!Array.isArray(input.categories) || input.categories.length === 0) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog categories must be a non-empty array.",
    );
  }

  const seenCategories = new Set<string>();
  const categories = input.categories.map((category) => {
    const key = requiredKey(category.key, "Exercise category key");
    if (seenCategories.has(key)) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog categories contain a duplicate key.",
      );
    }
    seenCategories.add(key);
    return Object.freeze({
      key,
      label: requiredText(category.label, "Exercise category label", 1, 120),
    });
  });

  const rawParameterKeys = input.parameterKeys ?? [];
  if (!Array.isArray(rawParameterKeys)) {
    throw new ExerciseCatalogValidationError(
      "Exercise parameter keys must be an array.",
    );
  }
  const parameterKeys = rawParameterKeys.map((key) =>
    requiredKey(key, "Exercise parameter key"),
  );
  if (new Set(parameterKeys).size !== parameterKeys.length) {
    throw new ExerciseCatalogValidationError(
      "Exercise parameter keys contain duplicates.",
    );
  }

  return Object.freeze({
    categories: Object.freeze(categories),
    parameterKeys: Object.freeze([...parameterKeys].sort()),
  });
}

export function assertExerciseCatalogDefinition(
  value: ExerciseCatalogDefinition,
): ExerciseCatalogDefinition {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.parameterKeys)
  ) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog definition is invalid.",
    );
  }
  return createExerciseCatalogDefinition({
    categories: value.categories,
    parameterKeys: value.parameterKeys,
  });
}

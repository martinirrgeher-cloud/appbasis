import { ExerciseCatalogValidationError } from "./catalog-error";
import type {
  ExerciseCatalogCategory,
  ExerciseCatalogDefinition,
  ExerciseCatalogDifficulty,
} from "./types";
import { requiredKey, requiredText } from "./validation";

export function createExerciseCatalogDefinition(input: {
  readonly categories: readonly ExerciseCatalogCategory[];
  readonly parameterKeys?: readonly string[];
  readonly difficulties?: readonly ExerciseCatalogDifficulty[];
}): ExerciseCatalogDefinition {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog definition input is invalid.",
    );
  }
  if (!Array.isArray(input.categories) || input.categories.length === 0) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog categories must be a non-empty array.",
    );
  }

  const seenCategories = new Set<string>();
  const categories = Array.from(input.categories).map((category) => {
    if (
      category === null ||
      typeof category !== "object" ||
      Array.isArray(category)
    ) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog category is invalid.",
      );
    }
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

  const rawDifficulties = input.difficulties;
  if (rawDifficulties !== undefined && !Array.isArray(rawDifficulties)) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog difficulties must be an array.",
    );
  }
  const seenDifficulties = new Set<string>();
  const difficulties = Array.from(rawDifficulties ?? []).map((difficulty) => {
    if (
      difficulty === null ||
      typeof difficulty !== "object" ||
      Array.isArray(difficulty)
    ) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog difficulty is invalid.",
      );
    }
    const key = requiredKey(difficulty.key, "Exercise difficulty key");
    if (seenDifficulties.has(key)) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog difficulties contain a duplicate key.",
      );
    }
    seenDifficulties.add(key);
    return Object.freeze({
      key,
      label: requiredText(
        difficulty.label,
        "Exercise difficulty label",
        1,
        120,
      ),
    });
  });

  const rawParameterKeys = input.parameterKeys;
  if (rawParameterKeys !== undefined && !Array.isArray(rawParameterKeys)) {
    throw new ExerciseCatalogValidationError(
      "Exercise parameter keys must be an array.",
    );
  }
  const parameterKeys = Array.from(rawParameterKeys ?? []).map((key) =>
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
    difficulties: Object.freeze(
      [...difficulties].sort((left, right) => left.key.localeCompare(right.key)),
    ),
  });
}

export function assertExerciseCatalogDefinition(
  value: ExerciseCatalogDefinition,
): ExerciseCatalogDefinition {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.parameterKeys) ||
    !Array.isArray(value.difficulties)
  ) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog definition is invalid.",
    );
  }
  return createExerciseCatalogDefinition({
    categories: value.categories,
    parameterKeys: value.parameterKeys,
    difficulties: value.difficulties,
  });
}

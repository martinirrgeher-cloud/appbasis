import { ExerciseCatalogValidationError } from "./catalog-error";
import { assertExerciseCatalogDefinition } from "./definition";
import type {
  CreateExerciseCatalogItemInput,
  ExerciseCatalogDefinition,
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
  ExerciseCatalogParameterInput,
} from "./types";
import {
  optionalText,
  requiredIdentifier,
  requiredKey,
  requiredText,
} from "./validation";

export function createExerciseCatalogItem(
  input: CreateExerciseCatalogItemInput,
  context: {
    readonly id: string;
    readonly organizationId: string;
    readonly definition: ExerciseCatalogDefinition;
  },
): ExerciseCatalogItem {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog item input is invalid.",
    );
  }
  if (
    context === null ||
    typeof context !== "object" ||
    Array.isArray(context)
  ) {
    throw new ExerciseCatalogValidationError(
      "Exercise catalog item context is invalid.",
    );
  }
  const definition = assertExerciseCatalogDefinition(context.definition);
  const categoryKey = requiredKey(input.categoryKey, "Exercise category key");
  if (!definition.categories.some((entry) => entry.key === categoryKey)) {
    throw new ExerciseCatalogValidationError(
      "Exercise category is not enabled by the catalog definition.",
    );
  }

  return Object.freeze({
    id: requiredIdentifier(context.id, "Exercise id"),
    organizationId: requiredIdentifier(
      context.organizationId,
      "Organization id",
    ),
    name: requiredText(input.name, "Exercise name", 2, 120),
    categoryKey,
    subcategory: optionalText(input.subcategory, "Exercise subcategory", 100),
    goal: optionalText(input.goal, "Exercise goal", 240),
    description: optionalText(input.description, "Exercise description", 10_000),
    coachingCues: optionalText(input.coachingCues, "Exercise coaching cues", 10_000),
    commonMistakes: optionalText(
      input.commonMistakes,
      "Exercise common mistakes",
      10_000,
    ),
    equipment: normalizeUniqueText(
      optionalArray(input.equipment, "Equipment"),
      "Equipment",
      80,
      100,
    ),
    videoUrl: optionalHttpUrl(input.videoUrl),
    audienceIds: normalizeUniqueIdentifiers(
      optionalArray(input.audienceIds, "Exercise audience"),
      "Exercise audience id",
    ),
    parameters: normalizeParameters(
      optionalArray(input.parameters, "Exercise parameter"),
      definition.parameterKeys,
    ),
    isActive: optionalBoolean(input.isActive, "Exercise active flag", true),
  });
}

function normalizeParameters(
  values: readonly ExerciseCatalogParameterInput[],
  allowedKeys: readonly string[],
): readonly ExerciseCatalogParameter[] {
  if (!Array.isArray(values)) {
    throw new ExerciseCatalogValidationError(
      "Exercise parameters must be an array.",
    );
  }
  const allowed = new Set(allowedKeys);
  const normalized = values.map((value, index) => {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new ExerciseCatalogValidationError(
        "Exercise parameter is invalid.",
      );
    }
    const key = requiredKey(value.key, "Exercise parameter key");
    if (!allowed.has(key)) {
      throw new ExerciseCatalogValidationError(
        "Exercise parameter key is not enabled by the catalog definition.",
      );
    }
    if (value.inputType !== "number" && value.inputType !== "text") {
      throw new ExerciseCatalogValidationError(
        "Exercise parameter input type is invalid.",
      );
    }

    const minimum = optionalFiniteNumber(value.minValue, "Parameter minimum");
    const maximum = optionalFiniteNumber(value.maxValue, "Parameter maximum");
    const step = optionalFiniteNumber(value.stepValue, "Parameter step");
    if (minimum !== null && maximum !== null && minimum > maximum) {
      throw new ExerciseCatalogValidationError(
        "Exercise parameter minimum must not exceed maximum.",
      );
    }
    if (step !== null && step <= 0) {
      throw new ExerciseCatalogValidationError(
        "Exercise parameter step must be greater than zero.",
      );
    }

    const defaultValue = optionalText(
      value.defaultValue,
      "Parameter default value",
      200,
    );
    if (
      value.inputType === "number" &&
      defaultValue !== null &&
      !Number.isFinite(Number(defaultValue))
    ) {
      throw new ExerciseCatalogValidationError(
        "Numeric exercise parameter default value is invalid.",
      );
    }

    return Object.freeze({
      key,
      label: requiredText(value.label, "Parameter label", 1, 80),
      unit: optionalText(value.unit, "Parameter unit", 20) ?? "",
      inputType: value.inputType,
      defaultValue,
      minValue: minimum,
      maxValue: maximum,
      stepValue: step,
      isRequired: optionalBoolean(
        value.isRequired,
        "Parameter required flag",
        false,
      ),
      sortOrder: optionalIntegerInRange(
        value.sortOrder,
        (index + 1) * 10,
        "Parameter sort order",
        0,
        100_000,
      ),
    });
  });

  const keys = normalized.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) {
    throw new ExerciseCatalogValidationError(
      "Exercise parameters contain a duplicate key.",
    );
  }

  return Object.freeze(
    [...normalized].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
    ),
  );
}

function normalizeUniqueIdentifiers(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) {
    throw new ExerciseCatalogValidationError(label + " list is invalid.");
  }
  const normalized = values.map((value) => requiredIdentifier(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new ExerciseCatalogValidationError(
      label + " list contains duplicates.",
    );
  }
  return Object.freeze([...normalized].sort());
}

function normalizeUniqueText(
  values: readonly string[],
  label: string,
  maximumLength: number,
  maximumItems: number,
): readonly string[] {
  if (!Array.isArray(values) || values.length > maximumItems) {
    throw new ExerciseCatalogValidationError(label + " list is invalid.");
  }
  const normalized = values.map((value) =>
    requiredText(value, label, 1, maximumLength),
  );
  const folded = normalized.map((value) => value.toLocaleLowerCase("de"));
  if (new Set(folded).size !== folded.length) {
    throw new ExerciseCatalogValidationError(
      label + " list contains duplicates.",
    );
  }
  return Object.freeze(
    [...normalized].sort((left, right) =>
      left.localeCompare(right, "de", { sensitivity: "base" }),
    ),
  );
}

function optionalArray<T>(
  value: readonly T[] | undefined,
  label: string,
): readonly T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ExerciseCatalogValidationError(label + " list is invalid.");
  }
  return Array.from(value);
}

function optionalBoolean(
  value: unknown,
  label: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw new ExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

function optionalIntegerInRange(
  value: unknown,
  defaultValue: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  return integerInRange(
    value === undefined ? defaultValue : value,
    label,
    minimum,
    maximum,
  );
}

function optionalHttpUrl(value: unknown): string | null {
  const normalized = optionalText(value, "Exercise video URL", 2_000);
  if (normalized === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ExerciseCatalogValidationError("Exercise video URL is invalid.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ExerciseCatalogValidationError(
      "Exercise video URL must use HTTP or HTTPS.",
    );
  }
  const canonical = parsed.toString();
  if (canonical.length > 2_000) {
    throw new ExerciseCatalogValidationError("Exercise video URL is too long.");
  }
  return canonical;
}

function optionalFiniteNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

function integerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new ExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

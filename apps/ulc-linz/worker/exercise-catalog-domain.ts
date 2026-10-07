export const ULC_EXERCISE_CATEGORIES = Object.freeze([
  Object.freeze({ key: "warmup", label: "Aufwärmen & Lauf-ABC" }),
  Object.freeze({ key: "acceleration", label: "Beschleunigung" }),
  Object.freeze({ key: "max_velocity", label: "Maximalgeschwindigkeit" }),
  Object.freeze({ key: "speed_endurance", label: "Schnelligkeitsausdauer" }),
  Object.freeze({ key: "start_reaction", label: "Start & Reaktion" }),
  Object.freeze({ key: "technique", label: "Technik" }),
  Object.freeze({ key: "plyometrics", label: "Plyometrie" }),
  Object.freeze({ key: "strength", label: "Kraft" }),
  Object.freeze({ key: "stability", label: "Stabilisation" }),
  Object.freeze({ key: "regeneration", label: "Regeneration" }),
  Object.freeze({ key: "other", label: "Sonstiges" }),
] as const);

export type UlcExerciseCategoryKey =
  (typeof ULC_EXERCISE_CATEGORIES)[number]["key"];

export const ULC_EXERCISE_DIFFICULTIES = Object.freeze([
  Object.freeze({ key: "easy", label: "Leicht" }),
  Object.freeze({ key: "medium", label: "Mittel" }),
  Object.freeze({ key: "hard", label: "Schwer" }),
] as const);

export type UlcExerciseDifficultyKey =
  (typeof ULC_EXERCISE_DIFFICULTIES)[number]["key"];

export const ULC_EXERCISE_PARAMETER_KEYS = Object.freeze([
  "sets",
  "repetitions",
  "distance_m",
  "weight_kg",
  "duration_s",
  "target_time_s",
  "intensity_percent",
  "rest_s",
  "series_rest_s",
  "approach_distance_m",
  "flying_distance_m",
  "contacts",
  "resistance_kg",
  "height_cm",
  "tempo_text",
  "surface_text",
  "start_position_text",
  "note_text",
] as const);

export type UlcExerciseParameterKey =
  (typeof ULC_EXERCISE_PARAMETER_KEYS)[number];

export type UlcExerciseParameterInputType = "number" | "text";

export interface UlcExerciseParameterDefinition {
  readonly key: UlcExerciseParameterKey;
  readonly label: string;
  readonly unit: string;
  readonly inputType: UlcExerciseParameterInputType;
  readonly defaultValue: string | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly stepValue: number | null;
  readonly isRequired: boolean;
  readonly sortOrder: number;
}

export interface UlcExerciseCatalogItem {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly categoryKey: UlcExerciseCategoryKey;
  readonly subcategory: string | null;
  readonly difficultyKey: UlcExerciseDifficultyKey | null;
  readonly goal: string | null;
  readonly description: string | null;
  readonly coachingCues: string | null;
  readonly commonMistakes: string | null;
  readonly equipment: readonly string[];
  readonly videoUrl: string | null;
  readonly videoUrls: readonly string[];
  readonly groupIds: readonly string[];
  readonly similarExerciseIds: readonly string[];
  readonly parameters: readonly UlcExerciseParameterDefinition[];
  readonly isActive: boolean;
}

export interface CreateUlcExerciseCatalogItemInput {
  readonly name: string;
  readonly categoryKey: UlcExerciseCategoryKey;
  readonly subcategory?: string | null;
  readonly difficultyKey?: UlcExerciseDifficultyKey | null;
  readonly goal?: string | null;
  readonly description?: string | null;
  readonly coachingCues?: string | null;
  readonly commonMistakes?: string | null;
  readonly equipment?: readonly string[];
  readonly videoUrl?: string | null;
  readonly videoUrls?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly similarExerciseIds?: readonly string[];
  readonly parameters?: readonly {
    readonly key: UlcExerciseParameterKey;
    readonly label: string;
    readonly unit?: string;
    readonly inputType: UlcExerciseParameterInputType;
    readonly defaultValue?: string | null;
    readonly minValue?: number | null;
    readonly maxValue?: number | null;
    readonly stepValue?: number | null;
    readonly isRequired?: boolean;
    readonly sortOrder?: number;
  }[];
  readonly isActive?: boolean;
}

export class UlcExerciseCatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UlcExerciseCatalogValidationError";
  }
}

export function createUlcExerciseCatalogItem(
  input: CreateUlcExerciseCatalogItemInput,
  context: { readonly id: string; readonly organizationId: string },
): UlcExerciseCatalogItem {
  const id = requiredIdentifier(context.id, "Exercise id");
  const groupIds = normalizedUniqueIdentifiers(
    input.groupIds ?? [],
    "Training group id",
  );
  const similarExerciseIds = normalizedUniqueIdentifiers(
    input.similarExerciseIds ?? [],
    "Similar exercise id",
  );
  if (similarExerciseIds.includes(id)) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise cannot be similar to itself.",
    );
  }
  const parameters = normalizedParameters(input.parameters ?? []);
  const videoUrls = normalizeVideoUrls(input.videoUrl, input.videoUrls);

  return Object.freeze({
    id,
    organizationId: requiredIdentifier(
      context.organizationId,
      "Organization id",
    ),
    name: requiredText(input.name, "Exercise name", 2, 120),
    categoryKey: requiredCategory(input.categoryKey),
    subcategory: optionalText(input.subcategory, "Exercise subcategory", 100),
    difficultyKey: optionalDifficulty(input.difficultyKey),
    goal: optionalText(input.goal, "Exercise goal", 240),
    description: optionalText(
      input.description,
      "Exercise description",
      10_000,
    ),
    coachingCues: optionalText(
      input.coachingCues,
      "Exercise coaching cues",
      10_000,
    ),
    commonMistakes: optionalText(
      input.commonMistakes,
      "Exercise common mistakes",
      10_000,
    ),
    equipment: normalizedUniqueText(input.equipment ?? [], "Equipment", 80),
    videoUrl: videoUrls[0] ?? null,
    videoUrls,
    groupIds,
    similarExerciseIds,
    parameters,
    isActive: input.isActive ?? true,
  });
}

export function exerciseCategoryLabel(
  key: UlcExerciseCategoryKey,
): string {
  const category = ULC_EXERCISE_CATEGORIES.find(
    (candidate) => candidate.key === key,
  );
  if (category === undefined) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise category is invalid.",
    );
  }
  return category.label;
}

function normalizedParameters(
  inputs: CreateUlcExerciseCatalogItemInput["parameters"],
): readonly UlcExerciseParameterDefinition[] {
  if (!Array.isArray(inputs)) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise parameters must be an array.",
    );
  }
  const result = inputs.map((input, index) => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new UlcExerciseCatalogValidationError(
        "Exercise parameter is invalid.",
      );
    }
    const minValue = optionalFiniteNumber(input.minValue, "Parameter minimum");
    const maxValue = optionalFiniteNumber(input.maxValue, "Parameter maximum");
    const stepValue = optionalFiniteNumber(input.stepValue, "Parameter step");
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      throw new UlcExerciseCatalogValidationError(
        "Exercise parameter minimum must not exceed maximum.",
      );
    }
    if (stepValue !== null && stepValue <= 0) {
      throw new UlcExerciseCatalogValidationError(
        "Exercise parameter step must be greater than zero.",
      );
    }
    if (input.inputType !== "number" && input.inputType !== "text") {
      throw new UlcExerciseCatalogValidationError(
        "Exercise parameter input type is invalid.",
      );
    }
    const defaultValue = optionalText(
      input.defaultValue,
      "Parameter default value",
      200,
    );
    if (
      input.inputType === "number" &&
      defaultValue !== null &&
      !Number.isFinite(Number(defaultValue))
    ) {
      throw new UlcExerciseCatalogValidationError(
        "Numeric exercise parameter default value is invalid.",
      );
    }

    return Object.freeze({
      key: requiredParameterKey(input.key),
      label: requiredText(input.label, "Parameter label", 1, 80),
      unit: optionalText(input.unit, "Parameter unit", 20) ?? "",
      inputType: input.inputType,
      defaultValue,
      minValue,
      maxValue,
      stepValue,
      isRequired: input.isRequired ?? false,
      sortOrder: integerInRange(
        input.sortOrder ?? (index + 1) * 10,
        "Parameter sort order",
        0,
        100_000,
      ),
    });
  });

  const keys = result.map((parameter) => parameter.key);
  if (new Set(keys).size !== keys.length) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise parameters contain a duplicate key.",
    );
  }

  return Object.freeze(
    [...result].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
    ),
  );
}

function requiredCategory(value: unknown): UlcExerciseCategoryKey {
  if (
    typeof value !== "string" ||
    !ULC_EXERCISE_CATEGORIES.some((category) => category.key === value)
  ) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise category is invalid.",
    );
  }
  return value as UlcExerciseCategoryKey;
}

function optionalDifficulty(value: unknown): UlcExerciseDifficultyKey | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !ULC_EXERCISE_DIFFICULTIES.some((difficulty) => difficulty.key === value)
  ) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise difficulty is invalid.",
    );
  }
  return value as UlcExerciseDifficultyKey;
}

function normalizeVideoUrls(
  legacyVideoUrl: unknown,
  rawVideoUrls: readonly string[] | undefined,
): readonly string[] {
  const source =
    rawVideoUrls === undefined
      ? legacyVideoUrl === undefined || legacyVideoUrl === null || legacyVideoUrl === ""
        ? []
        : [legacyVideoUrl]
      : rawVideoUrls;
  if (!Array.isArray(source) || source.length > 20) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise video URL list is invalid.",
    );
  }
  const normalized = source.map((value) => {
    const url = optionalHttpUrl(value);
    if (url === null) {
      throw new UlcExerciseCatalogValidationError(
        "Exercise video URL list contains an empty value.",
      );
    }
    return url;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise video URL list contains duplicates.",
    );
  }
  const legacy =
    legacyVideoUrl === undefined || legacyVideoUrl === null || legacyVideoUrl === ""
      ? null
      : optionalHttpUrl(legacyVideoUrl);
  if (
    rawVideoUrls !== undefined &&
    legacy !== null &&
    normalized[0] !== legacy
  ) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise video URL must match the first videoUrls entry.",
    );
  }
  return Object.freeze(normalized);
}

function requiredParameterKey(value: unknown): UlcExerciseParameterKey {
  if (
    typeof value !== "string" ||
    !ULC_EXERCISE_PARAMETER_KEYS.includes(
      value as UlcExerciseParameterKey,
    )
  ) {
    throw new UlcExerciseCatalogValidationError(
      "Exercise parameter key is invalid.",
    );
  }
  return value as UlcExerciseParameterKey;
}

function normalizedUniqueIdentifiers(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) {
    throw new UlcExerciseCatalogValidationError(label + " list is invalid.");
  }
  const normalized = values.map((value) => requiredIdentifier(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new UlcExerciseCatalogValidationError(
      label + " list contains duplicates.",
    );
  }
  return Object.freeze([...normalized].sort());
}

function normalizedUniqueText(
  values: readonly string[],
  label: string,
  maximumLength: number,
): readonly string[] {
  if (!Array.isArray(values)) {
    throw new UlcExerciseCatalogValidationError(label + " list is invalid.");
  }
  const normalized = values.map((value) =>
    requiredText(value, label, 1, maximumLength),
  );
  const folded = normalized.map((value) => value.toLocaleLowerCase("de"));
  if (new Set(folded).size !== folded.length) {
    throw new UlcExerciseCatalogValidationError(
      label + " list contains duplicates.",
    );
  }
  return Object.freeze(
    [...normalized].sort((left, right) =>
      left.localeCompare(right, "de", { sensitivity: "base" }),
    ),
  );
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

function requiredText(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new UlcExerciseCatalogValidationError(label + " must be text.");
  }
  const normalized = value.trim();
  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new UlcExerciseCatalogValidationError(
      label +
        " must contain between " +
        String(minimumLength) +
        " and " +
        String(maximumLength) +
        " characters.",
    );
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new UlcExerciseCatalogValidationError(label + " must be text.");
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximumLength) {
    throw new UlcExerciseCatalogValidationError(
      label +
        " must contain at most " +
        String(maximumLength) +
        " characters.",
    );
  }
  return normalized;
}

function optionalHttpUrl(value: unknown): string | null {
  const normalized = optionalText(value, "Exercise video URL", 2_000);
  if (normalized === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new UlcExerciseCatalogValidationError(
      "Exercise video URL is invalid.",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UlcExerciseCatalogValidationError(
      "Exercise video URL must use HTTP or HTTPS.",
    );
  }
  return parsed.toString();
}

function optionalFiniteNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UlcExerciseCatalogValidationError(label + " is invalid.");
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
    throw new UlcExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

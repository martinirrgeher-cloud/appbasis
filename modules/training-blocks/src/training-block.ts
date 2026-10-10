export interface TrainingBlockParameterOverrideInput {
  readonly key: string;
  readonly value: string;
}

export interface TrainingBlockParameterOverride {
  readonly key: string;
  readonly value: string;
  readonly sortOrder: number;
}

export interface TrainingBlockExerciseInput {
  readonly exerciseId: string;
  readonly note?: string | null;
  readonly parameterOverrides?: readonly TrainingBlockParameterOverrideInput[];
}

export interface TrainingBlockExerciseDraft {
  readonly exerciseId: string;
  readonly note: string | null;
  readonly parameterOverrides: readonly TrainingBlockParameterOverride[];
  readonly sortOrder: number;
}

export interface CreateTrainingBlockDraftInput {
  readonly name: string;
  readonly audienceId?: string | null;
  readonly durationMinutes?: number | null;
  readonly note?: string | null;
  readonly exercises?: readonly TrainingBlockExerciseInput[];
}

export interface TrainingBlockDraft {
  readonly name: string;
  readonly audienceId: string | null;
  readonly durationMinutes: number | null;
  readonly note: string | null;
  readonly exercises: readonly TrainingBlockExerciseDraft[];
}

export class TrainingBlockValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingBlockValidationError";
  }
}

export function normalizeTrainingBlockDraft(
  input: CreateTrainingBlockDraftInput,
): TrainingBlockDraft {
  if (!isRecord(input)) {
    throw new TrainingBlockValidationError(
      "Training block input must be an object.",
    );
  }

  const exercises = input.exercises ?? [];
  if (!Array.isArray(exercises) || exercises.length > 200) {
    throw new TrainingBlockValidationError(
      "Training block exercises must contain at most 200 entries.",
    );
  }

  return Object.freeze({
    name: requiredText(input.name, "Training block name", 120),
    audienceId: optionalIdentifier(input.audienceId, "Training block audience"),
    durationMinutes: optionalDuration(input.durationMinutes),
    note: optionalText(input.note, "Training block note", 3000),
    exercises: Object.freeze(
      exercises.map((exercise, index) =>
        normalizeExercise(exercise, index),
      ),
    ),
  });
}

function normalizeExercise(
  input: TrainingBlockExerciseInput,
  sortOrder: number,
): TrainingBlockExerciseDraft {
  if (!isRecord(input)) {
    throw new TrainingBlockValidationError(
      "Training block exercise must be an object.",
    );
  }

  const parameterOverrides = input.parameterOverrides ?? [];
  if (!Array.isArray(parameterOverrides) || parameterOverrides.length > 50) {
    throw new TrainingBlockValidationError(
      "Training block exercise parameter overrides must contain at most 50 entries.",
    );
  }

  const normalizedOverrides = parameterOverrides.map((override, index) =>
    normalizeParameterOverride(override, index),
  );
  const keys = normalizedOverrides.map((override) => override.key);
  if (new Set(keys).size !== keys.length) {
    throw new TrainingBlockValidationError(
      "Training block exercise contains a duplicate parameter override.",
    );
  }

  return Object.freeze({
    exerciseId: requiredIdentifier(
      input.exerciseId,
      "Training block exercise id",
    ),
    note: optionalText(input.note, "Training block exercise note", 2000),
    parameterOverrides: Object.freeze(normalizedOverrides),
    sortOrder,
  });
}

function normalizeParameterOverride(
  input: TrainingBlockParameterOverrideInput,
  sortOrder: number,
): TrainingBlockParameterOverride {
  if (!isRecord(input)) {
    throw new TrainingBlockValidationError(
      "Training block parameter override must be an object.",
    );
  }
  return Object.freeze({
    key: requiredText(input.key, "Training block parameter key", 80),
    value: requiredText(input.value, "Training block parameter value", 500),
    sortOrder,
  });
}

function optionalDuration(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1440) {
    throw new TrainingBlockValidationError(
      "Training block duration must be a whole number between 1 and 1440 minutes.",
    );
  }
  return value;
}

function optionalIdentifier(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredIdentifier(value, label);
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new TrainingBlockValidationError(`${label} is invalid.`);
  }
  return value;
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new TrainingBlockValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new TrainingBlockValidationError(
      `${label} must contain between 1 and ${maximumLength} characters.`,
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
    throw new TrainingBlockValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximumLength) {
    throw new TrainingBlockValidationError(
      `${label} must contain at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

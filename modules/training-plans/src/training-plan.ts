const MAX_TOP_LEVEL_ITEMS = 200;
const MAX_BLOCK_EXERCISES = 200;
const MAX_TOTAL_EXERCISES = 500;

export interface TrainingPlanExerciseInput {
  readonly kind: "exercise";
  readonly sourceExerciseId?: string | null;
  readonly name: string;
  readonly sets?: string | null;
  readonly repetitions?: string | null;
  readonly amount?: string | null;
  readonly unit?: string | null;
  readonly comment?: string | null;
}

export interface TrainingPlanBlockInput {
  readonly kind: "block";
  readonly sourceBlockId?: string | null;
  readonly sourceBlockRevision?: number | null;
  readonly name: string;
  readonly durationMinutes?: number | null;
  readonly note?: string | null;
  readonly exercises?: readonly Omit<TrainingPlanExerciseInput, "kind">[];
}

export type TrainingPlanItemInput =
  | TrainingPlanBlockInput
  | TrainingPlanExerciseInput;

export interface CreateTrainingPlanDraftInput {
  readonly subjectId: string;
  readonly planDate: string;
  readonly note?: string | null;
  readonly items?: readonly TrainingPlanItemInput[];
}

export interface TrainingPlanExerciseDraft {
  readonly kind: "exercise";
  readonly sourceExerciseId: string | null;
  readonly name: string;
  readonly sets: string | null;
  readonly repetitions: string | null;
  readonly amount: string | null;
  readonly unit: string | null;
  readonly comment: string | null;
  readonly sortOrder: number;
}

export interface TrainingPlanBlockDraft {
  readonly kind: "block";
  readonly sourceBlockId: string | null;
  readonly sourceBlockRevision: number | null;
  readonly name: string;
  readonly durationMinutes: number | null;
  readonly note: string | null;
  readonly exercises: readonly TrainingPlanExerciseDraft[];
  readonly sortOrder: number;
}

export type TrainingPlanItemDraft =
  | TrainingPlanBlockDraft
  | TrainingPlanExerciseDraft;

export interface TrainingPlanDraft {
  readonly subjectId: string;
  readonly planDate: string;
  readonly note: string | null;
  readonly items: readonly TrainingPlanItemDraft[];
}

export class TrainingPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingPlanValidationError";
  }
}

export function normalizeTrainingPlanDraft(
  input: CreateTrainingPlanDraftInput,
): TrainingPlanDraft {
  if (!isRecord(input)) {
    throw new TrainingPlanValidationError(
      "Training plan input must be an object.",
    );
  }

  const items = input.items ?? [];
  if (!Array.isArray(items) || items.length > MAX_TOP_LEVEL_ITEMS) {
    throw new TrainingPlanValidationError(
      `Training plan items must contain at most ${MAX_TOP_LEVEL_ITEMS} entries.`,
    );
  }

  let totalExerciseCount = 0;
  const normalizedItems = items.map((item, index) => {
    const normalized = normalizeItem(item, index);
    totalExerciseCount +=
      normalized.kind === "exercise" ? 1 : normalized.exercises.length;
    return normalized;
  });
  if (totalExerciseCount > MAX_TOTAL_EXERCISES) {
    throw new TrainingPlanValidationError(
      `Training plan exercises must contain at most ${MAX_TOTAL_EXERCISES} entries in total.`,
    );
  }

  return Object.freeze({
    subjectId: requiredIdentifier(input.subjectId, "Training plan subject"),
    planDate: isoDate(input.planDate),
    note: optionalText(input.note, "Training plan note", 3000),
    items: Object.freeze(normalizedItems),
  });
}

function normalizeItem(
  input: TrainingPlanItemInput,
  sortOrder: number,
): TrainingPlanItemDraft {
  if (!isRecord(input)) {
    throw new TrainingPlanValidationError(
      "Training plan item must be an object.",
    );
  }
  if (input.kind === "exercise") {
    return normalizeExercise(input, sortOrder);
  }
  if (input.kind === "block") {
    return normalizeBlock(input, sortOrder);
  }
  throw new TrainingPlanValidationError("Training plan item kind is invalid.");
}

function normalizeBlock(
  input: TrainingPlanBlockInput,
  sortOrder: number,
): TrainingPlanBlockDraft {
  const sourceBlockId = optionalIdentifier(
    input.sourceBlockId,
    "Training plan source block",
  );
  const sourceBlockRevision = optionalPositiveInteger(
    input.sourceBlockRevision,
    "Training plan source block revision",
  );
  if ((sourceBlockId === null) !== (sourceBlockRevision === null)) {
    throw new TrainingPlanValidationError(
      "Training plan source block id and revision must be provided together.",
    );
  }

  const exercises = input.exercises ?? [];
  if (!Array.isArray(exercises) || exercises.length > MAX_BLOCK_EXERCISES) {
    throw new TrainingPlanValidationError(
      `Training plan block exercises must contain at most ${MAX_BLOCK_EXERCISES} entries.`,
    );
  }

  return Object.freeze({
    kind: "block",
    sourceBlockId,
    sourceBlockRevision,
    name: requiredText(input.name, "Training plan block name", 120),
    durationMinutes: optionalPositiveInteger(
      input.durationMinutes,
      "Training plan block duration",
    ),
    note: optionalText(input.note, "Training plan block note", 3000),
    exercises: Object.freeze(
      exercises.map((exercise, index) =>
        normalizeExercise(
          {
            ...exercise,
            kind: "exercise",
          },
          index,
        ),
      ),
    ),
    sortOrder,
  });
}

function normalizeExercise(
  input: TrainingPlanExerciseInput,
  sortOrder: number,
): TrainingPlanExerciseDraft {
  return Object.freeze({
    kind: "exercise",
    sourceExerciseId: optionalIdentifier(
      input.sourceExerciseId,
      "Training plan source exercise",
    ),
    name: requiredText(input.name, "Training plan exercise name", 160),
    sets: optionalText(input.sets, "Training plan exercise sets", 80),
    repetitions: optionalText(
      input.repetitions,
      "Training plan exercise repetitions",
      80,
    ),
    amount: optionalText(input.amount, "Training plan exercise amount", 80),
    unit: optionalText(input.unit, "Training plan exercise unit", 80),
    comment: optionalText(
      input.comment,
      "Training plan exercise comment",
      2000,
    ),
    sortOrder,
  });
}

export function normalizeTrainingPlanIdentifier(
  value: unknown,
  label: string,
): string {
  return requiredIdentifier(value, label);
}

function optionalPositiveInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new TrainingPlanValidationError(
      `${label} must be a positive whole number.`,
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
    !isPostgresTextCompatible(value) ||
    codePointLength(value) === 0 ||
    codePointLength(value) > 200 ||
    value.trim() !== value
  ) {
    throw new TrainingPlanValidationError(`${label} is invalid.`);
  }
  return value;
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new TrainingPlanValidationError(`${label} must be text.`);
  }
  if (!isPostgresTextCompatible(value)) {
    throw new TrainingPlanValidationError(
      `${label} contains unsupported characters.`,
    );
  }
  const normalized = value.trim();
  const length = codePointLength(normalized);
  if (length === 0 || length > maximumLength) {
    throw new TrainingPlanValidationError(
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
    throw new TrainingPlanValidationError(`${label} must be text.`);
  }
  if (!isPostgresTextCompatible(value)) {
    throw new TrainingPlanValidationError(
      `${label} contains unsupported characters.`,
    );
  }
  const normalized = value.trim();
  const length = codePointLength(normalized);
  if (length === 0) return null;
  if (length > maximumLength) {
    throw new TrainingPlanValidationError(
      `${label} must contain at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function isoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TrainingPlanValidationError(
      "Training plan date must use YYYY-MM-DD.",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new TrainingPlanValidationError("Training plan date is invalid.");
  }
  return value;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isPostgresTextCompatible(value: string): boolean {
  if (value.includes("\0")) return false;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        return false;
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

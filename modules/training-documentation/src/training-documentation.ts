export type TrainingDocumentationStatus = "draft" | "completed";
export type TrainingAttendanceStatus =
  | "present"
  | "excused"
  | "absent"
  | "open";

export interface TrainingDocumentationExerciseInput {
  readonly kind: "exercise";
  readonly sourceItemId?: string | null;
  readonly sourceExerciseId?: string | null;
  readonly name: string;
  readonly plannedSets?: string | null;
  readonly plannedRepetitions?: string | null;
  readonly plannedAmount?: string | null;
  readonly plannedUnit?: string | null;
  readonly plannedComment?: string | null;
  readonly performed?: boolean;
  readonly actualSets?: string | null;
  readonly actualRepetitions?: string | null;
  readonly actualAmount?: string | null;
  readonly actualUnit?: string | null;
  readonly actualComment?: string | null;
}

export interface TrainingDocumentationBlockInput {
  readonly kind: "block";
  readonly sourceItemId?: string | null;
  readonly sourceBlockId?: string | null;
  readonly sourceBlockRevision?: number | null;
  readonly name: string;
  readonly plannedDurationMinutes?: number | null;
  readonly plannedNote?: string | null;
  readonly performed?: boolean;
  readonly actualDurationMinutes?: number | null;
  readonly actualNote?: string | null;
  readonly exercises?: readonly Omit<TrainingDocumentationExerciseInput, "kind">[];
}

export type TrainingDocumentationItemInput =
  | TrainingDocumentationExerciseInput
  | TrainingDocumentationBlockInput;

export interface TrainingDocumentationAttendanceInput {
  readonly participantId: string;
  readonly displayName: string;
  readonly status: TrainingAttendanceStatus;
}

export interface CreateTrainingDocumentationDraftInput {
  readonly subjectId: string;
  readonly sessionDate: string;
  readonly sourcePlanId: string;
  readonly sourcePlanRevision: number;
  readonly note?: string | null;
  readonly items?: readonly TrainingDocumentationItemInput[];
  readonly attendance?: readonly TrainingDocumentationAttendanceInput[];
}

export interface TrainingDocumentationExerciseDraft {
  readonly kind: "exercise";
  readonly sourceItemId: string | null;
  readonly sourceExerciseId: string | null;
  readonly name: string;
  readonly plannedSets: string | null;
  readonly plannedRepetitions: string | null;
  readonly plannedAmount: string | null;
  readonly plannedUnit: string | null;
  readonly plannedComment: string | null;
  readonly performed: boolean;
  readonly actualSets: string | null;
  readonly actualRepetitions: string | null;
  readonly actualAmount: string | null;
  readonly actualUnit: string | null;
  readonly actualComment: string | null;
  readonly sortOrder: number;
}

export interface TrainingDocumentationBlockDraft {
  readonly kind: "block";
  readonly sourceItemId: string | null;
  readonly sourceBlockId: string | null;
  readonly sourceBlockRevision: number | null;
  readonly name: string;
  readonly plannedDurationMinutes: number | null;
  readonly plannedNote: string | null;
  readonly performed: boolean;
  readonly actualDurationMinutes: number | null;
  readonly actualNote: string | null;
  readonly exercises: readonly TrainingDocumentationExerciseDraft[];
  readonly sortOrder: number;
}

export type TrainingDocumentationItemDraft =
  | TrainingDocumentationExerciseDraft
  | TrainingDocumentationBlockDraft;

export interface TrainingDocumentationAttendanceDraft {
  readonly participantId: string;
  readonly displayName: string;
  readonly status: TrainingAttendanceStatus;
}

export interface TrainingDocumentationDraft {
  readonly subjectId: string;
  readonly sessionDate: string;
  readonly sourcePlanId: string;
  readonly sourcePlanRevision: number;
  readonly note: string | null;
  readonly items: readonly TrainingDocumentationItemDraft[];
  readonly attendance: readonly TrainingDocumentationAttendanceDraft[];
}

export class TrainingDocumentationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingDocumentationValidationError";
  }
}

const MAX_TOP_LEVEL_ITEMS = 200;
const MAX_BLOCK_EXERCISES = 200;
const MAX_TOTAL_EXERCISES = 500;
const MAX_ATTENDANCE = 500;

export function normalizeTrainingDocumentationDraft(
  input: CreateTrainingDocumentationDraftInput,
): TrainingDocumentationDraft {
  if (!isRecord(input)) {
    throw new TrainingDocumentationValidationError(
      "Training documentation input must be an object.",
    );
  }
  const items = input.items ?? [];
  if (!Array.isArray(items) || items.length > MAX_TOP_LEVEL_ITEMS) {
    throw new TrainingDocumentationValidationError(
      `Training documentation items must contain at most ${MAX_TOP_LEVEL_ITEMS} entries.`,
    );
  }

  let totalExercises = 0;
  const normalizedItems = items.map((item, index) => {
    const normalized = normalizeItem(item, index);
    totalExercises +=
      normalized.kind === "exercise" ? 1 : normalized.exercises.length;
    return normalized;
  });
  if (totalExercises > MAX_TOTAL_EXERCISES) {
    throw new TrainingDocumentationValidationError(
      `Training documentation exercises must contain at most ${MAX_TOTAL_EXERCISES} entries in total.`,
    );
  }

  const attendance = input.attendance ?? [];
  if (!Array.isArray(attendance) || attendance.length > MAX_ATTENDANCE) {
    throw new TrainingDocumentationValidationError(
      `Training documentation attendance must contain at most ${MAX_ATTENDANCE} entries.`,
    );
  }
  const normalizedAttendance = attendance.map(normalizeAttendance);
  const attendanceIds = new Set(normalizedAttendance.map((entry) => entry.participantId));
  if (attendanceIds.size !== normalizedAttendance.length) {
    throw new TrainingDocumentationValidationError(
      "Training documentation attendance contains duplicate participants.",
    );
  }

  return Object.freeze({
    subjectId: normalizeTrainingDocumentationIdentifier(
      input.subjectId,
      "Training documentation subject",
    ),
    sessionDate: normalizeTrainingDocumentationDate(input.sessionDate),
    sourcePlanId: normalizeTrainingDocumentationIdentifier(
      input.sourcePlanId,
      "Training documentation source plan",
    ),
    sourcePlanRevision: normalizeTrainingDocumentationRevision(
      input.sourcePlanRevision,
      "Training documentation source plan revision",
    ),
    note: optionalText(input.note, "Training documentation note", 3000),
    items: Object.freeze(normalizedItems),
    attendance: Object.freeze(normalizedAttendance),
  });
}

export function normalizeTrainingDocumentationContent(input: {
  readonly note?: string | null;
  readonly items?: readonly TrainingDocumentationItemInput[];
  readonly attendance?: readonly TrainingDocumentationAttendanceInput[];
}): Pick<TrainingDocumentationDraft, "note" | "items" | "attendance"> {
  if (!isRecord(input)) {
    throw new TrainingDocumentationValidationError(
      "Training documentation content must be an object.",
    );
  }
  return normalizeTrainingDocumentationDraft({
    subjectId: "subject",
    sessionDate: "2000-01-01",
    sourcePlanId: "plan",
    sourcePlanRevision: 1,
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.items === undefined ? {} : { items: input.items }),
    ...(input.attendance === undefined
      ? {}
      : { attendance: input.attendance }),
  });
}

function normalizeItem(
  input: TrainingDocumentationItemInput,
  sortOrder: number,
): TrainingDocumentationItemDraft {
  if (!isRecord(input)) {
    throw new TrainingDocumentationValidationError(
      "Training documentation item must be an object.",
    );
  }
  if (input.kind === "exercise") {
    return normalizeExercise(input, sortOrder);
  }
  if (input.kind === "block") {
    return normalizeBlock(input, sortOrder);
  }
  throw new TrainingDocumentationValidationError(
    "Training documentation item kind is invalid.",
  );
}

function normalizeBlock(
  input: TrainingDocumentationBlockInput,
  sortOrder: number,
): TrainingDocumentationBlockDraft {
  const sourceBlockId = optionalIdentifier(
    input.sourceBlockId,
    "Training documentation source block",
  );
  const sourceBlockRevision = optionalRevision(
    input.sourceBlockRevision,
    "Training documentation source block revision",
  );
  if ((sourceBlockId === null) !== (sourceBlockRevision === null)) {
    throw new TrainingDocumentationValidationError(
      "Training documentation source block id and revision must be provided together.",
    );
  }
  const exercises = input.exercises ?? [];
  if (!Array.isArray(exercises) || exercises.length > MAX_BLOCK_EXERCISES) {
    throw new TrainingDocumentationValidationError(
      `Training documentation block exercises must contain at most ${MAX_BLOCK_EXERCISES} entries.`,
    );
  }
  return Object.freeze({
    kind: "block",
    sourceItemId: optionalIdentifier(
      input.sourceItemId,
      "Training documentation source item",
    ),
    sourceBlockId,
    sourceBlockRevision,
    name: requiredText(input.name, "Training documentation block name", 120),
    plannedDurationMinutes: optionalPositiveInteger(
      input.plannedDurationMinutes,
      "Training documentation planned duration",
    ),
    plannedNote: optionalText(
      input.plannedNote,
      "Training documentation planned block note",
      3000,
    ),
    performed: optionalBoolean(input.performed, true),
    actualDurationMinutes: optionalPositiveInteger(
      input.actualDurationMinutes,
      "Training documentation actual duration",
    ),
    actualNote: optionalText(
      input.actualNote,
      "Training documentation actual block note",
      3000,
    ),
    exercises: Object.freeze(
      exercises.map((exercise, index) =>
        normalizeExercise({ ...exercise, kind: "exercise" }, index),
      ),
    ),
    sortOrder,
  });
}

function normalizeExercise(
  input: TrainingDocumentationExerciseInput,
  sortOrder: number,
): TrainingDocumentationExerciseDraft {
  return Object.freeze({
    kind: "exercise",
    sourceItemId: optionalIdentifier(
      input.sourceItemId,
      "Training documentation source item",
    ),
    sourceExerciseId: optionalIdentifier(
      input.sourceExerciseId,
      "Training documentation source exercise",
    ),
    name: requiredText(input.name, "Training documentation exercise name", 160),
    plannedSets: optionalText(input.plannedSets, "Planned sets", 80),
    plannedRepetitions: optionalText(
      input.plannedRepetitions,
      "Planned repetitions",
      80,
    ),
    plannedAmount: optionalText(input.plannedAmount, "Planned amount", 80),
    plannedUnit: optionalText(input.plannedUnit, "Planned unit", 80),
    plannedComment: optionalText(
      input.plannedComment,
      "Planned exercise comment",
      2000,
    ),
    performed: optionalBoolean(input.performed, true),
    actualSets: optionalText(input.actualSets, "Actual sets", 80),
    actualRepetitions: optionalText(
      input.actualRepetitions,
      "Actual repetitions",
      80,
    ),
    actualAmount: optionalText(input.actualAmount, "Actual amount", 80),
    actualUnit: optionalText(input.actualUnit, "Actual unit", 80),
    actualComment: optionalText(
      input.actualComment,
      "Actual exercise comment",
      2000,
    ),
    sortOrder,
  });
}

function normalizeAttendance(
  input: TrainingDocumentationAttendanceInput,
): TrainingDocumentationAttendanceDraft {
  if (!isRecord(input)) {
    throw new TrainingDocumentationValidationError(
      "Training documentation attendance entry must be an object.",
    );
  }
  if (!["present", "excused", "absent", "open"].includes(input.status)) {
    throw new TrainingDocumentationValidationError(
      "Training documentation attendance status is invalid.",
    );
  }
  return Object.freeze({
    participantId: normalizeTrainingDocumentationIdentifier(
      input.participantId,
      "Training documentation participant",
    ),
    displayName: requiredText(
      input.displayName,
      "Training documentation participant name",
      200,
    ),
    status: input.status,
  });
}

export function normalizeTrainingDocumentationIdentifier(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200 ||
    !isPostgresTextCompatible(value)
  ) {
    throw new TrainingDocumentationValidationError(`${label} is invalid.`);
  }
  return value;
}

export function normalizeTrainingDocumentationDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000-")
  ) {
    throw new TrainingDocumentationValidationError(
      "Training documentation date must use YYYY-MM-DD.",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new TrainingDocumentationValidationError(
      "Training documentation date is invalid.",
    );
  }
  return value;
}

export function normalizeTrainingDocumentationRevision(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new TrainingDocumentationValidationError(
      `${label} must be a positive whole number.`,
    );
  }
  return value;
}

function optionalRevision(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  return normalizeTrainingDocumentationRevision(value, label);
}

function optionalPositiveInteger(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  return normalizeTrainingDocumentationRevision(value, label);
}

function optionalIdentifier(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return normalizeTrainingDocumentationIdentifier(value, label);
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new TrainingDocumentationValidationError(
      "Training documentation performed flag must be boolean.",
    );
  }
  return value;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || !isPostgresTextCompatible(value)) {
    throw new TrainingDocumentationValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (length === 0 || length > maximumLength) {
    throw new TrainingDocumentationValidationError(
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
  if (typeof value !== "string" || !isPostgresTextCompatible(value)) {
    throw new TrainingDocumentationValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (Array.from(normalized).length > maximumLength) {
    throw new TrainingDocumentationValidationError(
      `${label} must contain at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function isPostgresTextCompatible(value: string): boolean {
  if (value.includes("\0")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

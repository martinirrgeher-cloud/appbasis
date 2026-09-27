export type UlcTrainingModule = "kindertraining" | "u12" | "u14";
export type UlcTrainingSessionState = "scheduled" | "cancelled";
export type UlcTrainingAttendanceStatus =
  | "open"
  | "present"
  | "excused"
  | "absent";

export interface UlcTrainingSession {
  readonly id: string;
  readonly organizationId: string;
  readonly moduleId: UlcTrainingModule;
  readonly groupId: string;
  readonly sessionDate: string;
  readonly state: UlcTrainingSessionState;
  readonly note: string | null;
}

export interface CreateUlcTrainingSessionInput {
  readonly moduleId: UlcTrainingModule;
  readonly groupId: string;
  readonly sessionDate: string;
  readonly state?: UlcTrainingSessionState;
  readonly note?: string | null;
}

export interface UlcTrainingAttendance {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly athleteId: string;
  readonly status: UlcTrainingAttendanceStatus;
}

export class UlcTrainingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UlcTrainingValidationError";
  }
}

export function createUlcTrainingSession(
  input: CreateUlcTrainingSessionInput,
  context: { readonly id: string; readonly organizationId: string },
): UlcTrainingSession {
  return Object.freeze({
    id: requiredIdentifier(context.id, "Training session id"),
    organizationId: requiredIdentifier(
      context.organizationId,
      "Organization id",
    ),
    moduleId: requiredTrainingModule(input.moduleId),
    groupId: requiredIdentifier(input.groupId, "Training group id"),
    sessionDate: isoDate(input.sessionDate, "Training date"),
    state: requiredSessionState(input.state ?? "scheduled"),
    note: optionalText(input.note, "Training note", 3000),
  });
}

export function createUlcTrainingAttendance(
  input: {
    readonly organizationId: string;
    readonly sessionId: string;
    readonly athleteId: string;
    readonly status: UlcTrainingAttendanceStatus;
  },
): UlcTrainingAttendance {
  return Object.freeze({
    organizationId: requiredIdentifier(input.organizationId, "Organization id"),
    sessionId: requiredIdentifier(input.sessionId, "Training session id"),
    athleteId: requiredIdentifier(input.athleteId, "Athlete id"),
    status: requiredAttendanceStatus(input.status),
  });
}

export function normalizeUlcTrainingAttendanceSet(
  inputs: readonly {
    readonly organizationId: string;
    readonly sessionId: string;
    readonly athleteId: string;
    readonly status: UlcTrainingAttendanceStatus;
  }[],
): readonly UlcTrainingAttendance[] {
  if (!Array.isArray(inputs)) {
    throw new UlcTrainingValidationError("Training attendance must be an array.");
  }
  const result = inputs.map(createUlcTrainingAttendance);
  const athleteIds = result.map((entry) => entry.athleteId);
  if (new Set(athleteIds).size !== athleteIds.length) {
    throw new UlcTrainingValidationError(
      "Training attendance contains a duplicate athlete.",
    );
  }
  return Object.freeze(result);
}

function requiredTrainingModule(value: unknown): UlcTrainingModule {
  if (value !== "kindertraining" && value !== "u12" && value !== "u14") {
    throw new UlcTrainingValidationError("Training module is invalid.");
  }
  return value;
}

function requiredSessionState(value: unknown): UlcTrainingSessionState {
  if (value !== "scheduled" && value !== "cancelled") {
    throw new UlcTrainingValidationError("Training session state is invalid.");
  }
  return value;
}

function requiredAttendanceStatus(
  value: unknown,
): UlcTrainingAttendanceStatus {
  if (
    value !== "open" &&
    value !== "present" &&
    value !== "excused" &&
    value !== "absent"
  ) {
    throw new UlcTrainingValidationError("Training attendance status is invalid.");
  }
  return value;
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 200
  ) {
    throw new UlcTrainingValidationError(`${label} is invalid.`);
  }
  return value;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new UlcTrainingValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximumLength) {
    throw new UlcTrainingValidationError(
      `${label} must contain at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UlcTrainingValidationError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new UlcTrainingValidationError(`${label} is invalid.`);
  }
  return value;
}

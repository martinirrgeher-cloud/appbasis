/**
 * G-04 – Pure, server-time-based training-day and registration-window policy.
 *
 * This module intentionally does not change existing registration routes.
 * A group without an explicitly stored policy continues to allow all seven
 * days without a deadline until a separately reviewed rollout enables it.
 * Never accept `now`, `hasExistingRegistration` or session state from an HTTP body.
 */
export type UlcRegistrationWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type UlcRegistrationLateMode = "allow" | "block";

export interface UlcRegistrationSchedule {
  readonly weekdays: readonly UlcRegistrationWeekday[];
  readonly weeksAhead: number;
  readonly deadline: Readonly<{ daysBefore: number; localTime: string }> | null;
  readonly lateMode: UlcRegistrationLateMode;
}

export interface UlcRegistrationScheduleEvaluation {
  /** Include stored exceptional sessions/registrations in the week display. */
  readonly visible: boolean;
  readonly scheduledWeekday: boolean;
  readonly exceptionalTrainingDay: boolean;
  readonly isLate: boolean;
  readonly mayEdit: boolean;
  readonly reason: "open" | "non-training-day" | "too-far-ahead" |
    "cancelled" | "deadline-passed" | "past-training-day";
  readonly deadlineLocal: string | null;
}

export class UlcRegistrationScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UlcRegistrationScheduleValidationError";
  }
}

function invalid(message: string): never {
  throw new UlcRegistrationScheduleValidationError(message);
}

function exactObject(value: unknown, keys: readonly string[], label: string):
  Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    invalid(label + " must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify([...keys].sort())) {
    invalid(label + " has unexpected or missing fields.");
  }
  return record;
}

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("Invalid session date.");
  const parsed = new Date(value + "T12:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) invalid("Invalid session date.");
  return value;
}

function shiftDate(date: string, days: number): string {
  const reference = new Date(validDate(date) + "T12:00:00.000Z");
  reference.setUTCDate(reference.getUTCDate() + days);
  return reference.toISOString().slice(0, 10);
}

function weekday(date: string): UlcRegistrationWeekday {
  const d = new Date(validDate(date) + "T12:00:00.000Z").getUTCDay();
  return (d === 0 ? 7 : d) as UlcRegistrationWeekday;
}

function weekMonday(date: string): string {
  return shiftDate(date, 1 - weekday(date));
}

function viennaLocalDateTime(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalid("Invalid current time.");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year + "-" + fields.month + "-" + fields.day +
    "T" + fields.hour + ":" + fields.minute + ":" + fields.second;
}

/**
 * Resolve a Vienna deadline into one absolute instant, including DST changes.
 * During the fall-back hour the first occurrence closes registration; it must
 * never reopen when the wall clock moves backward. Missing spring-forward
 * times close at the first valid minute after the skipped hour.
 */
function viennaDeadlineInstant(deadlineLocal: string): number {
  const naiveUtc = Date.parse(deadlineLocal + ":00.000Z");
  if (!Number.isFinite(naiveUtc)) invalid("Invalid deadline date/time.");
  // Europe/Vienna uses UTC+1 / UTC+2. Check actual local clock values rather
  // than assuming a particular offset on the transition day.
  const candidates = [60, 120].map((minutes) => naiveUtc - minutes * 60_000);
  const matches = candidates.filter((candidate) =>
    viennaLocalDateTime(new Date(candidate)).slice(0, 16) === deadlineLocal);
  if (matches.length > 0) return Math.min(...matches);

  // A spring DST gap (e.g. 02:30) has no exact instant. Choose the very
  // first existing minute after it on the same Vienna calendar date.
  const begin = Math.min(...candidates) - 60 * 60_000;
  const end = Math.max(...candidates) + 60 * 60_000;
  for (let instant = begin; instant <= end; instant += 60_000) {
    const actual = viennaLocalDateTime(new Date(instant)).slice(0, 16);
    if (actual.startsWith(deadlineLocal.slice(0, 10)) &&
        actual >= deadlineLocal) return instant;
  }
  return invalid("Unable to resolve Vienna registration deadline.");
}

/** Reject malformed records rather than silently accepting unsafe defaults. */
export function normalizeUlcRegistrationSchedule(input: unknown):
  UlcRegistrationSchedule {
  const value = exactObject(input,
    ["weekdays", "weeksAhead", "deadline", "lateMode"], "Schedule");
  if (!Array.isArray(value.weekdays) || value.weekdays.length < 1 ||
      value.weekdays.length > 7 ||
      !value.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) ||
      new Set(value.weekdays).size !== value.weekdays.length ||
      value.weekdays.some((day, index, days) => index > 0 && days[index - 1] >= day)) {
    invalid("Weekdays must be a nonempty ascending unique ISO weekday list.");
  }
  if (!Number.isInteger(value.weeksAhead) ||
      Number(value.weeksAhead) < 0 || Number(value.weeksAhead) > 26) {
    invalid("Weeks ahead must be 0 to 26.");
  }
  if (value.lateMode !== "allow" && value.lateMode !== "block") {
    invalid("Late registration mode is invalid.");
  }
  let deadline: UlcRegistrationSchedule["deadline"] = null;
  if (value.deadline !== null) {
    const item = exactObject(value.deadline, ["daysBefore", "localTime"], "Deadline");
    if (!Number.isInteger(item.daysBefore) ||
        Number(item.daysBefore) < 0 || Number(item.daysBefore) > 14 ||
        typeof item.localTime !== "string" ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.localTime)) {
      invalid("Deadline must be 0–14 days before at HH:MM Europe/Vienna time.");
    }
    deadline = Object.freeze({
      daysBefore: Number(item.daysBefore),
      localTime: item.localTime as string,
    });
  }
  return Object.freeze({
    weekdays: Object.freeze([...value.weekdays] as UlcRegistrationWeekday[]),
    weeksAhead: Number(value.weeksAhead),
    deadline,
    lateMode: value.lateMode as UlcRegistrationLateMode,
  });
}

/**
 * The caller supplies already-authorized, server-read session facts.
 * This is a decision helper, not a replacement for DB-side write locking,
 * permission rechecks, or an authenticated policy administration endpoint.
 */
export function evaluateUlcRegistrationSchedule(input: {
  readonly schedule: UlcRegistrationSchedule | null;
  readonly sessionDate: string;
  readonly serverNow: Date;
  readonly sessionState: "scheduled" | "cancelled" | null;
  readonly hasExistingRegistration: boolean;
  /** Trusted app-owned exception approved through the trainer/admin path. */
  readonly authorizedExtraDay: boolean;
}): UlcRegistrationScheduleEvaluation {
  const day = validDate(input.sessionDate);
  const nowLocal = viennaLocalDateTime(input.serverNow);
  const today = nowLocal.slice(0, 10);
  const schedule = input.schedule === null ? null :
    normalizeUlcRegistrationSchedule(input.schedule);
  if (input.sessionState !== null && input.sessionState !== "scheduled" &&
      input.sessionState !== "cancelled") invalid("Invalid session state.");
  if (typeof input.hasExistingRegistration !== "boolean" ||
      typeof input.authorizedExtraDay !== "boolean") {
    invalid("Registration visibility flags are invalid.");
  }
  const scheduledWeekday = schedule === null ||
    schedule.weekdays.includes(weekday(day));
  // A previously auto-created session is NOT an authorization to bypass the
  // training-day policy. Only a separately approved exception permits edits.
  const exceptionalTrainingDay = input.authorizedExtraDay;
  const visible = scheduledWeekday || exceptionalTrainingDay ||
    input.sessionState !== null || input.hasExistingRegistration;
  const nowWeek = weekMonday(today);
  const targetWeek = weekMonday(day);
  const weeksBetween = Math.round(
    (Date.parse(targetWeek + "T12:00:00Z") -
     Date.parse(nowWeek + "T12:00:00Z")) / (7 * 86_400_000),
  );
  const tooFarAhead = schedule !== null && weeksBetween > schedule.weeksAhead;
  const inPast = schedule !== null && day < today;
  const deadlineLocal = schedule?.deadline
    ? shiftDate(day, -schedule.deadline.daysBefore) + "T" +
      schedule.deadline.localTime
    : null;
  const isLate = deadlineLocal !== null &&
    input.serverNow.getTime() > viennaDeadlineInstant(deadlineLocal);
  const reason: UlcRegistrationScheduleEvaluation["reason"] =
    input.sessionState === "cancelled" ? "cancelled" :
    !scheduledWeekday && !exceptionalTrainingDay ? "non-training-day" :
    !visible ? "non-training-day" :
    inPast ? "past-training-day" :
    tooFarAhead ? "too-far-ahead" :
    isLate && schedule?.lateMode === "block" ? "deadline-passed" : "open";
  return Object.freeze({
    visible, scheduledWeekday, exceptionalTrainingDay, isLate,
    mayEdit: reason === "open", reason, deadlineLocal,
  });
}

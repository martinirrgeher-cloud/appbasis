/**
 * Authoritative, server-side projection for the weekly trainer attendance view.
 * In the test-phase rollout, old sessions outside the group schedule are not
 * treated as exceptions. Only explicit "extra" calendar exceptions add dates.
 * This function never mutates or deletes stored attendance records.
 */
export function attendanceWeekDates(weekStart: string): readonly string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new Error("Invalid attendance week start.");
  }
  const day = new Date(weekStart + "T12:00:00.000Z");
  if (!Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== weekStart ||
      day.getUTCDay() !== 1) {
    throw new Error("Attendance week must start on Monday.");
  }
  return Object.freeze(Array.from({ length: 7 }, (_, index) => {
    const date = new Date(day);
    date.setUTCDate(day.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  }));
}

export function selectAttendanceCalendarDates(input: {
  readonly weekStart: string;
  /** null means no configured group calendar; retain the legacy seven days. */
  readonly weekdays: readonly number[] | null;
  readonly exceptions: readonly Readonly<{
    date: string;
    kind: "extra" | "cancelled" | null;
  }>[];
}): readonly string[] {
  const dates = attendanceWeekDates(input.weekStart);
  const exceptions = new Map(input.exceptions.map(item => [item.date, item.kind]));
  return Object.freeze(dates.filter((date, index) => {
    const kind = exceptions.get(date);
    return kind !== "cancelled" && (kind === "extra" ||
      input.weekdays === null || input.weekdays.includes(index + 1));
  }));
}

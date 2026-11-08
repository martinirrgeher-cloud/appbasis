import { describe, expect, it } from "vitest";
import {
  attendanceWeekDates,
  isScheduledAttendanceDate,
  selectAttendanceCalendarDates,
} from "../worker/attendance-calendar";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

const monday = "2026-11-09";
const allWeek = [
  "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12",
  "2026-11-13", "2026-11-14", "2026-11-15",
] as const;

describe("G-04.10 trainer attendance follows the group training calendar", () => {
  it("defaults to all seven days until the group actually has a calendar rule", () => {
    expect(attendanceWeekDates(monday)).toEqual(allWeek);
    expect(selectAttendanceCalendarDates({
      weekStart: monday, weekdays: null, exceptions: [],
    })).toEqual(allWeek);
  });

  it("shows only Tuesday for Kindertraining, regardless of old test sessions", () => {
    expect(selectAttendanceCalendarDates({
      weekStart: monday, weekdays: [2], exceptions: [],
    })).toEqual(["2026-11-10"]);
    // A change to training weekdays must not depend on legacy session dates.
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "for (const sessionDate of kindertrainingWeekCalendarDates)",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "const dates = kindertrainingWeekCalendarDates;",
    );
    // The week caption must still use the entire Monday-Sunday range, not
    // dates[6] from a one-day/two-day calendar selection.
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'germanDate(weekDates[0]) + " bis " + germanDate(weekDates[6])',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("empty.colSpan = dates.length + 1;");
  });

  it("uses explicit extra/cancelled exceptions instead of guessing from stored test data", () => {
    expect(selectAttendanceCalendarDates({
      weekStart: monday,
      weekdays: [2],
      exceptions: [
        { date: "2026-11-12", kind: "extra" },
        { date: "2026-11-10", kind: "cancelled" },
      ],
    })).toEqual(["2026-11-12"]);
    expect(selectAttendanceCalendarDates({
      weekStart: monday,
      weekdays: [2],
      exceptions: [{ date: "2026-11-14", kind: "extra" }],
    })).toEqual(["2026-11-10", "2026-11-14"]);
  });

  it("rejects stale writes on cancelled or no-longer-planned Kids dates", () => {
    expect(isScheduledAttendanceDate("2026-11-10", [2], null)).toBe(true);
    expect(isScheduledAttendanceDate("2026-11-11", [2], null)).toBe(false);
    expect(isScheduledAttendanceDate("2026-11-10", [2], "cancelled")).toBe(false);
    expect(isScheduledAttendanceDate("2026-11-14", [2], "extra")).toBe(true);
    expect(isScheduledAttendanceDate("2026-11-14", [2], "cancelled")).toBe(false);
    expect(isScheduledAttendanceDate("2026-11-14", null, null)).toBe(true);
    expect(isScheduledAttendanceDate("2026-02-30", [2], "extra")).toBe(false);
    expect(isScheduledAttendanceDate("not-a-date", [2], null)).toBe(false);
  });

  it("rejects invalid weeks and does not allow calendar errors to show arbitrary dates", () => {
    for (const bad of ["2026-11-10", "2026-02-30", "invalid", "2026-11-09x"]) {
      expect(() => attendanceWeekDates(bad)).toThrow();
    }
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/kindertraining/calendar?groupId="',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "if (!isKindertrainingWeekCalendar(calendar, groupId, weekStart))",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "kindertrainingWeekCalendarLoadError = true;",
    );
  });
});

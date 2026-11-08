import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";
import { ULC_REGISTRATION_CALENDAR_CSS } from "../worker/registration-calendar-ui";

function extract(name: string, next: string) {
  const from = ULC_LINZ_APP_SCRIPT.indexOf("function " + name + "(");
  const to = ULC_LINZ_APP_SCRIPT.indexOf("\nfunction " + next + "(", from + 1);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return ULC_LINZ_APP_SCRIPT.slice(from, to);
}

describe("G-04.8 shared group training days and actual registration days", () => {
  it("makes the calendar editor available in both attendance modes and protects edit permission", () => {
    const fn = extract("refreshGroupCalendarAvailability", "refreshGroupCalendarMode");
    const create = new Function(
      "selectedMasterdataGroup", "calendarUi",
      "masterdataCalendarAvailable", "masterdataCanEdit",
      fn + "\nreturn refreshGroupCalendarAvailability;",
    ) as (group: () => unknown, ui: unknown, available: boolean,
      canEdit: boolean) => () => void;
    for (const attendanceMode of ["trainer_roll_call", "self_registration"]) {
      const button = { hidden: true };
      create(() => ({ isActive: true, attendanceMode }), { open: button }, true, true)();
      expect(button.hidden).toBe(false);
      create(() => ({ isActive: false, attendanceMode }), { open: button }, true, true)();
      expect(button.hidden).toBe(true);
      create(() => ({ isActive: true, attendanceMode }), { open: button }, true, false)();
      expect(button.hidden).toBe(true);
    }
    expect(ULC_LINZ_APP_HTML).toContain('id="group-calendar-open"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-calendar-registration-settings"');
    expect(ULC_REGISTRATION_CALENDAR_CSS).toContain(
      "#group-calendar-registration-settings[hidden] { display: none; }",
    );
  });

  it("shows registration deadlines only when the same group has self-registration", () => {
    const fn = extract("refreshGroupCalendarMode", "fillGroupCalendarRule");
    const create = new Function(
      "selectedMasterdataGroup", "calendarUi",
      fn + "\nreturn refreshGroupCalendarMode;",
    ) as (group: () => unknown, ui: unknown) => () => void;
    const settings = { hidden: false };
    create(() => ({ attendanceMode: "trainer_roll_call" }),
      { registrationSettings: settings })();
    expect(settings.hidden).toBe(true);
    create(() => ({ attendanceMode: "self_registration" }),
      { registrationSettings: settings })();
    expect(settings.hidden).toBe(false);
  });

  it("renders only dates with server-authorized options, including special dates", () => {
    const fn = extract("visibleSelfRegistrationDates", "renderSelfRegistration");
    const actual = new Function(fn + "\nreturn visibleSelfRegistrationDates;")() as
      (dates: string[], options: Array<{ sessionDate: string }>) => string[];
    const week = [
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12",
      "2026-11-13", "2026-11-14", "2026-11-15",
    ];
    const monToThuAndSun = [week[0]!, week[1]!, week[2]!, week[3]!, week[6]!];
    const options = monToThuAndSun.map(sessionDate => ({ sessionDate }));
    expect(actual(week, options)).toEqual(monToThuAndSun);
    expect(actual(week, [...options, { sessionDate: week[5]! }]))
      .toEqual([...monToThuAndSun.slice(0, 4), week[5]!, week[6]!]);
    expect(actual(week, [])).toEqual([]);
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "for (const sessionDate of visibleSelfRegistrationDates(dates, selfRegistrationOptions))",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "const dates = registrationWeekDates(weekStart);",
    );
  });
});

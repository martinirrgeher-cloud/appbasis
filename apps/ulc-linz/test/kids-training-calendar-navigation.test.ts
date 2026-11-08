import { describe, expect, it } from "vitest";
import { ULC_KIDS_HTML, ULC_KIDS_SCRIPT, ULC_U14_SCRIPT } from "../worker/youth-attendance-ui";
import { ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_LINZ_APP_HTML } from "../worker/ui";

function dateShift(date: string, days: number): string {
  const d = new Date(date + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekStart(date: Date): string {
  const d = new Date(date);
  const weekday = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return d.toISOString().slice(0, 10);
}

function plannedDaysHarness(
  weeks: Record<string, string[]>,
  invalid = false,
) {
  const sourceStart = ULC_KIDS_SCRIPT.indexOf("function kidsCalendarWeekStart(");
  const sourceEnd = ULC_KIDS_SCRIPT.indexOf("async function loadKidsAttendance()", sourceStart);
  expect(sourceStart).toBeGreaterThan(0);
  expect(sourceEnd).toBeGreaterThan(sourceStart);
  const code = ULC_KIDS_SCRIPT.slice(sourceStart, sourceEnd);
  const requested: string[] = [];
  const requestJson = async (url: string) => {
    const params = new URL(url, "https://example.org").searchParams;
    const monday = params.get("weekStart") || "";
    requested.push(monday);
    if (invalid) return { groupId: "some-other-group", weekStart: monday, dates: [] };
    return { groupId: params.get("groupId"), weekStart: monday, dates: weeks[monday] || [] };
  };
  const factory = new Function(
    "requestJson", "localIsoDate", "localWeekStart",
    "registrationWeekDates", "shiftIsoDate",
    code + "\nreturn { find: kidsFindCalendarDate, fetch: kidsFetchCalendarDates };",
  ) as (...args: any[]) => {
    find: (groupId: string, anchor: string, direction: number, includeAnchor: boolean) => Promise<string>;
    fetch: (groupId: string, start: string) => Promise<string[]>;
  };
  const fns = factory(
    requestJson,
    (date: Date) => date.toISOString().slice(0, 10),
    weekStart,
    (monday: string) => Array.from({ length: 7 }, (_, i) => dateShift(monday, i)),
    dateShift,
  );
  return { ...fns, requested };
}

describe("G-04.11 Kindertraining day navigation obeys shared group calendar", () => {
  it("enables calendar gating only for Kindertraining, without changing U12 or U14", () => {
    expect(ULC_U12_SCRIPT).toContain("const u12FollowGroupCalendar = false;");
    expect(ULC_U14_SCRIPT).toContain("const u14FollowGroupCalendar = false;");
    expect(ULC_KIDS_SCRIPT).toContain("const kidsFollowGroupCalendar = true;");
    expect(ULC_KIDS_SCRIPT).toContain(
      '"/api/modules/kindertraining/calendar?groupId="',
    );
    expect(ULC_KIDS_SCRIPT).toContain("if (!dates.includes(selected))");
    expect(ULC_KIDS_SCRIPT).toContain("await kidsNavigateCalendarDate(");
    expect(ULC_KIDS_HTML).toContain("Nächstes Training");
  });

  it("starts from the next Tuesday and skips other days with both arrows", async () => {
    const { find, requested } = plannedDaysHarness({
      "2026-11-02": ["2026-11-03"],
      "2026-11-09": ["2026-11-10"],
      "2026-11-16": ["2026-11-17"],
    });
    expect(await find("kids-group", "2026-11-08", 1, true)).toBe("2026-11-10");
    expect(await find("kids-group", "2026-11-10", 1, false)).toBe("2026-11-17");
    expect(await find("kids-group", "2026-11-17", -1, false)).toBe("2026-11-10");
    expect(requested).toContain("2026-11-09");
    expect(requested).toContain("2026-11-16");
  });

  it("includes extra days, excludes cancellations, and denies invalid calendar responses", async () => {
    const { find, fetch } = plannedDaysHarness({
      "2026-11-09": ["2026-11-14"],
      "2026-11-16": ["2026-11-17"],
    });
    expect(await fetch("kids-group", "2026-11-09")).toEqual(["2026-11-14"]);
    expect(await find("kids-group", "2026-11-10", 1, true)).toBe("2026-11-14");
    await expect(plannedDaysHarness({}, true).fetch("kids-group", "2026-11-09"))
      .rejects.toThrow("INVALID_CALENDAR_RESPONSE");
    await expect(plannedDaysHarness({ "2026-11-09": ["2026-11-17"] })
      .fetch("kids-group", "2026-11-09")).rejects.toThrow("INVALID_CALENDAR_DATES");
  });

  it("renders seven small accessible day choices and separate optional panels", () => {
    const section = ULC_LINZ_APP_HTML.split('id="group-calendar-panel"')[1]
      ?.split('id="group-calendar-back"')[0] || "";
    expect(section.match(/class="registration-calendar-day"/g)).toHaveLength(7);
    expect(section.match(/data-calendar-weekday="true"/g)).toHaveLength(7);
    expect(section).toContain('class="registration-calendar-details" id="group-calendar-registration-settings"');
    expect(section).toContain("Zusatztraining oder Ausfall erfassen");
    expect(section).toContain('id="group-calendar-exception"');
    expect(section).toContain('id="group-calendar-save"');
  });
});

import { describe, expect, it } from "vitest";
import { ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT, ULC_U14_SCRIPT } from "../worker/youth-attendance-ui";
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
  weekdays: number[] | null = [2],
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
    if (invalid) return { groupId: "some-other-group", weekStart: monday, dates: [],
      calendarEnabled: true, weekdays };
    return { groupId: params.get("groupId"), weekStart: monday,
      dates: weeks[monday] || [], calendarEnabled: true, weekdays };
  };
  const selectedDate = {
    value: "",
    options: [] as Array<{ value: string; textContent: string }>,
    replaceChildren() { this.options = []; },
    append(option: { value: string; textContent: string }) { this.options.push(option); },
  };
  const factory = new Function(
    "requestJson", "localIsoDate", "localWeekStart",
    "registrationWeekDates", "shiftIsoDate",
    "kidsUi", "document", "germanWeekday", "germanDate", "kidsFollowGroupCalendar",
    "const kidsCalendarWeekCache = new Map();\nconst attendanceSessionGeneration = 1;\n" + code +
      "\nreturn { find: kidsFindCalendarDate, fetch: kidsFetchCalendarDates, populate: kidsPopulateCalendarChoices };",
  ) as (...args: any[]) => {
    find: (groupId: string, anchor: string, direction: number, includeAnchor: boolean,
      onlyWeekday?: number | null) => Promise<string>;
    fetch: (groupId: string, start: string) => Promise<string[]>;
    populate: (groupId: string, selected: string, isCurrent: () => boolean) => Promise<void>;
  };
  const fns = factory(
    requestJson,
    (date: Date) => date.toISOString().slice(0, 10),
    weekStart,
    (monday: string) => Array.from({ length: 7 }, (_, i) => dateShift(monday, i)),
    dateShift,
    { date: selectedDate }, { createElement: () => ({ value: "", textContent: "" }) },
    (date: string) => date.slice(8), (date: string) => date, true,
  );
  return { ...fns, requested, selectedDate };
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
    expect(ULC_KIDS_HTML).toContain('aria-label="Nächstes Training"');
    expect(ULC_KIDS_HTML).toContain('aria-label="Vorheriges Training"');
    expect(ULC_KIDS_HTML).toContain("Zum aktuellen Training");
    expect(ULC_KIDS_HTML).toContain('id="kids-calendar-hint"');
    expect(ULC_KIDS_CSS).toContain(".kids-calendar-hint[hidden]");
    expect(ULC_KIDS_HTML).toContain('<select id="kids-date"');
    expect(ULC_KIDS_HTML).not.toContain('<input type="date" id="kids-date"');
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

  it("uses a single arrow action to reach the following scheduled Tuesday", async () => {
    const { find } = plannedDaysHarness({
      "2026-11-09": ["2026-11-10"],
      "2026-11-16": ["2026-11-17"],
      "2026-11-23": ["2026-11-24"],
    });
    expect(await find("kids-group", "2026-11-10", 1, false))
      .toBe("2026-11-17");
    expect(await find("kids-group", "2026-11-17", -1, false))
      .toBe("2026-11-10");
    const controller = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("async function kidsMoveDate("),
      ULC_KIDS_SCRIPT.indexOf("async function kidsChangeDate("),
    );
    expect(controller).toContain("kidsCalendarRuleWeekdays === null");
    expect(controller).toContain("await kidsNavigateCalendarDate(selected, direction, false)");
    expect(controller).not.toContain("for (let i");
  });

  it("moves exactly one calendar week if no weekly rule was saved", async () => {
    const days = Array.from({ length: 7 }, (_, i) => dateShift("2026-11-09", i));
    const following = Array.from({ length: 7 }, (_, i) => dateShift("2026-11-16", i));
    const { find } = plannedDaysHarness({
      "2026-11-09": days,
      "2026-11-16": following,
    }, false, null);
    // From Tuesday 10 November, one action visits Tuesday 17 November,
    // not the six intervening weekdays.
    expect(await find("kids-group", "2026-11-17", 1, true, 2))
      .toBe("2026-11-17");
    const controller = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("async function kidsMoveDate("),
      ULC_KIDS_SCRIPT.indexOf("async function kidsChangeDate("),
    );
    expect(controller).toContain("shiftIsoDate(selected, direction * 7)");
    expect(ULC_KIDS_SCRIPT).toContain("Gleicher Wochentag");
    expect(ULC_KIDS_SCRIPT).toContain("noch keine Wochenregel gespeichert");
  });

  it("only offers server-approved days in the Kids date select", async () => {
    const { populate, selectedDate } = plannedDaysHarness({
      "2026-11-09": ["2026-11-10", "2026-11-14"],
      "2026-11-16": ["2026-11-17"],
    });
    await populate("kids-group", "2026-11-10", () => true);
    expect(selectedDate.options.map(option => option.value)).toEqual([
      "2026-11-10", "2026-11-14", "2026-11-17",
    ]);
    expect(selectedDate.value).toBe("2026-11-10");
    expect(selectedDate.options).not.toContainEqual(
      expect.objectContaining({ value: "2026-11-11" }),
    );
  });

  it("ignores stale responses without changing options or the selected day", async () => {
    const { populate, selectedDate } = plannedDaysHarness({
      "2026-11-09": ["2026-11-10"],
    });
    selectedDate.value = "2026-11-03";
    await populate("kids-group", "2026-11-10", () => false);
    expect(selectedDate.value).toBe("2026-11-03");
    expect(selectedDate.options).toHaveLength(0);
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

  it("locks existing attendance drafts until calendar navigation and target load finish", () => {
    const refresh = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("function refreshKidsControls()"),
      ULC_KIDS_SCRIPT.indexOf("function renderKidsContentRows("),
    );
    const draft = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("function kidsEditableDraft()"),
      ULC_KIDS_SCRIPT.indexOf("function refreshKidsMatrixControls("),
    );
    const nav = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("async function kidsNavigateCalendarDate("),
      ULC_KIDS_SCRIPT.indexOf("async function loadKidsAttendance("),
    );
    const change = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("async function kidsChangeDate()"),
      ULC_KIDS_SCRIPT.indexOf("async function kidsChangeGroup("),
    );
    expect(refresh).toContain("!kidsCalendarBusy && !cancelled");
    expect(draft).toContain("!kidsLoading && !kidsCalendarBusy");
    // Inputs/handlers and delayed writes must all obey the same lock.
    const add = ULC_KIDS_SCRIPT.slice(ULC_KIDS_SCRIPT.indexOf("function addKidsContent("),
      ULC_KIDS_SCRIPT.indexOf("function kidsPresentAthletes("));
    const save = ULC_KIDS_SCRIPT.slice(ULC_KIDS_SCRIPT.indexOf("async function saveKidsAttendance("),
      ULC_KIDS_SCRIPT.indexOf("async function kidsFlushChanges("));
    const timer = ULC_KIDS_SCRIPT.slice(ULC_KIDS_SCRIPT.indexOf("function scheduleKidsAutoSave("),
      ULC_KIDS_SCRIPT.indexOf("function markKidsDraftDirty("));
    expect(add).toContain("kidsCalendarBusy");
    // Explicit CAS flush must still save a frozen draft; normal edits remain disabled.
    expect(save).toContain("if (!kidsSnapshot || kidsLoading || !kidsReady");
    expect(save).not.toContain("kidsLoading || kidsCalendarBusy || !kidsReady");
    expect(timer).toContain("kidsCalendarBusy");
    expect(ULC_KIDS_SCRIPT).toContain("kidsLoading || kidsCalendarBusy ||");
    expect(ULC_KIDS_SCRIPT).toContain("kidsLoading || kidsCalendarBusy || !kidsWriteAllowed");
    const populate = nav.indexOf("await kidsPopulateCalendarChoices(");
    const assignment = nav.indexOf("kidsUi.date.value = chosen");
    const load = nav.indexOf("await loadKidsAttendance()");
    const release = nav.indexOf("} finally {");
    const freeze = nav.indexOf("kidsCalendarBusy = true");
    const flush = nav.indexOf("await kidsFlushChanges()");
    expect(freeze).toBeGreaterThan(0);
    expect(flush).toBeGreaterThan(freeze);
    const selectionFreeze = change.indexOf("kidsCalendarBusy = true");
    const selectionFlush = change.indexOf("await kidsFlushChanges()");
    expect(selectionFreeze).toBeGreaterThan(0);
    expect(selectionFlush).toBeGreaterThan(selectionFreeze);
    const group = ULC_KIDS_SCRIPT.slice(
      ULC_KIDS_SCRIPT.indexOf("async function kidsChangeGroup()"),
      ULC_KIDS_SCRIPT.indexOf("async function kidsReloadAttendance()"),
    );
    expect(group.indexOf("kidsCalendarBusy = true")).toBeLessThan(
      group.indexOf("await kidsFlushChanges()"),
    );
    expect(populate).toBeGreaterThan(0);
    expect(assignment).toBeGreaterThan(populate);
    expect(load).toBeGreaterThan(assignment);
    expect(release).toBeGreaterThan(load);
    expect(change.indexOf("await loadKidsAttendance()")).toBeLessThan(
      change.indexOf("} finally {"),
    );
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

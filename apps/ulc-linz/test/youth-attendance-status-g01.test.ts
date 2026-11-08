import { describe, expect, it } from "vitest";

import { aggregateU12Statistics } from "../worker/u12-statistics-postgres";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";

const roster = [
  { athleteId: "a", firstName: "Anna", lastName: "A" },
  { athleteId: "b", firstName: "Ben", lastName: "B" },
  { athleteId: "c", firstName: "Clara", lastName: "C" },
  { athleteId: "d", firstName: "David", lastName: "D" },
  { athleteId: "missing", firstName: "Else", lastName: "E" },
];
const makeRow = (session: string, athleteId: string | null, status: string | null) => ({
  session_id: session, session_date: session === "second" ? "2026-11-02" : "2026-11-01",
  trainer_count: 0, trainer_ids: [], content_titles: [], content_items: [],
  athlete_id: athleteId, status, content_slots: [],
});

describe("G-01 clarified youth attendance statuses", () => {
  it("distinguishes the saved status from the draft binary checkbox without changing its write contract", () => {
    const begin = ULC_U12_SCRIPT.indexOf("function u12DisplayedAttendanceStatus(");
    const end = ULC_U12_SCRIPT.indexOf("function updateU12AttendanceStatus(", begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const decide = new Function(
      ULC_U12_SCRIPT.slice(begin, end) + "\nreturn u12DisplayedAttendanceStatus;",
    )() as (person: { status: string }, checked: boolean, touched: boolean) => string;
    for (const state of ["open", "present", "absent", "excused"]) {
      expect(decide({ status: state }, state === "present", false)).toBe(state);
    }
    expect(decide({ status: "open" }, true, true)).toBe("present");
    expect(decide({ status: "excused" }, false, true)).toBe("absent");
    expect(ULC_U12_SCRIPT).toContain('status: u12TouchedAthletes.has(person.athleteId)');
    expect(ULC_U12_SCRIPT).toContain(': person.status,');
    expect(ULC_U12_SCRIPT).toContain('u12TouchedAthletes.clear();');
    expect(ULC_U12_SCRIPT).toContain("scheduleU12AutoSave()");
  });

  it("counts only scoped, existing attendance rows as assessed or open, with no invented missed trainings", () => {
    const report = aggregateU12Statistics([
      makeRow("first", "a", "present"),
      makeRow("first", "b", "open"),
      makeRow("first", "c", "excused"),
      makeRow("first", "d", "absent"),
      makeRow("first", "not-in-roster", "present"),
      makeRow("second", null, null),
    ], roster, "2026-11-01", "2026-11-07");

    expect(report.summary).toMatchObject({
      trainings: 2, attendance: 1, evaluatedStatuses: 3, openStatuses: 1,
    });
    expect(report.trainings).toEqual([
      { date: "2026-11-02", presentCount: 0, trainerPresentCount: 0,
        registeredCount: 0, openCount: 0, categoryCount: 0 },
      { date: "2026-11-01", presentCount: 1, trainerPresentCount: 0,
        registeredCount: 4, openCount: 1, categoryCount: 0 },
    ]);
    const byId = new Map(report.athletes.map((athlete) => [athlete.athleteId, athlete]));
    expect(byId.get("a")).toMatchObject({ attended: 1, evaluated: 1, openCount: 0, attendancePercent: 100 });
    expect(byId.get("b")).toMatchObject({ attended: 0, evaluated: 0, openCount: 1, attendancePercent: null });
    expect(byId.get("c")).toMatchObject({ attended: 0, evaluated: 1, openCount: 0, attendancePercent: 0 });
    expect(byId.get("d")).toMatchObject({ attended: 0, evaluated: 1, openCount: 0, attendancePercent: 0 });
    expect(byId.get("missing")).toMatchObject({ attended: 0, evaluated: 0, openCount: 0, attendancePercent: null });
    expect(report.summary.evaluatedStatuses + report.summary.openStatuses).toBe(
      report.trainings.reduce((sum, training) => sum + training.registeredCount, 0),
    );
  });

  it.each([
    ["u12", ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT],
    ["u14", ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT],
    ["kids", ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT],
  ] as const)("retains accessible compact status pills and explicit completeness in %s", (prefix, html, css, script) => {
    expect(html).toContain('id="' + prefix + '-statistics-completeness"');
    expect(script).toContain("function " + prefix + "DisplayedAttendanceStatus(");
    expect(script).toContain("function update" +
      prefix.charAt(0).toUpperCase() + prefix.slice(1) + "AttendanceStatus(");
    expect(script).toContain('open: { short: "Offen", long: "Offen – noch nicht erfasst" }');
    expect(script).toContain('excused: { short: "Entsch.", long: "Entschuldigt" }');
    expect(script).toContain("copy.long");
    expect(script).toContain('input.type = "checkbox"');
    expect(script).toContain('mark.closest(".' + prefix + '-person__answer")');
    expect(css).toContain('.' + prefix + '-person__answer[data-attendance-status="open"]');
    expect(css).toContain('.' + prefix + '-person__answer[data-attendance-status="excused"]');
    expect(css).toContain('min-height:44px');
    expect(script).toContain("Nicht angelegte Einträge werden nicht als Fehlzeiten gewertet.");
    expect(() => new Function(script)).not.toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  aggregateU12Statistics,
  PostgresUlcU12StatisticsRepository,
  validateU12StatisticsDateRange,
} from "../worker/u12-statistics-postgres";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

const roster = [
  { athleteId: "athlete-a", firstName: "Anna", lastName: "Auer" },
  { athleteId: "athlete-b", firstName: "Berta", lastName: "Binder" },
  { athleteId: "athlete-c", firstName: "Clara", lastName: "Christ" },
];
const sessions = [
  {
    session_id: "session-new", session_date: "2026-11-04",
    content_titles: ["Sprint / Schnelligkeit", "Sprung"],
    content_items: [{ code: "sprint", detail: "" }, { code: "jump", detail: "" }],
    athlete_id: "athlete-a", status: "present", content_slots: [1, 2],
  },
  {
    session_id: "session-new", session_date: "2026-11-04",
    content_titles: ["Sprint / Schnelligkeit", "Sprung"],
    content_items: [{ code: "sprint", detail: "" }, { code: "jump", detail: "" }],
    athlete_id: "athlete-b", status: "absent", content_slots: [],
  },
  {
    session_id: "session-old", session_date: "2026-10-01",
    content_titles: ["Sprint / Schnelligkeit", "Freies Alt-Training"],
    content_items: [{ code: "sprint", detail: "" }, { code: "", detail: "" }],
    athlete_id: "athlete-a", status: "present", content_slots: [1, 2],
  },
];

describe("U12 attendance statistics aggregation", () => {
  it("counts only persisted present participants and their assigned standard categories", () => {
    const report = aggregateU12Statistics(sessions, roster, "2026-08-07", "2026-11-07");
    expect(report.summary).toEqual({ trainings: 2, attendance: 2, categories: 2 });
    expect(report.trainings).toEqual([
      { date: "2026-11-04", presentCount: 1, registeredCount: 2, categoryCount: 2 },
      { date: "2026-10-01", presentCount: 1, registeredCount: 1, categoryCount: 1 },
    ]);
    expect(report.athletes.map(a => [a.lastName, a.attended])).toEqual([
      ["Binder", 0], ["Christ", 0], ["Auer", 2],
    ]);
    expect(report.athletes[2]?.categories).toEqual([
      { code: "sprint", label: "Sprint / Schnelligkeit", count: 2 },
      { code: "jump", label: "Sprung", count: 1 },
    ]);
    expect(report.categories).toEqual([
      { code: "sprint", label: "Sprint / Schnelligkeit", trainings: 2, assignments: 2 },
      { code: "jump", label: "Sprung", trainings: 1, assignments: 1 },
    ]);
  });

  it("does not leak personal rows that are not in the authorized historical U12 roster", () => {
    const others = sessions.concat([{
      ...sessions[0]!, athlete_id: "other-organization-athlete",
    }]);
    const report = aggregateU12Statistics(others, roster, "2026-08-07", "2026-11-07");
    expect(report.athletes).toHaveLength(3);
    expect(report.summary.attendance).toBe(2);
    expect(report.categories[0]?.assignments).toBe(2);
  });

  it("rejects invalid ranges, corrupted assignments and duplicate attendance", () => {
    expect(() => validateU12StatisticsDateRange("2026-02-30", "2026-11-07"))
      .toThrow(UlcTrainingValidationError);
    expect(() => validateU12StatisticsDateRange("2026-11-07", "2026-08-07"))
      .toThrow(UlcTrainingValidationError);
    expect(() => validateU12StatisticsDateRange("2023-01-01", "2026-11-07"))
      .toThrow(UlcTrainingValidationError);
    expect(() => aggregateU12Statistics([...sessions, sessions[0]!], roster, "2026-08-07", "2026-11-07"))
      .toThrow(UlcTrainingValidationError);
    expect(() => aggregateU12Statistics([{ ...sessions[0]!, content_slots: [7] }], roster,
      "2026-08-07", "2026-11-07")).toThrow(UlcTrainingValidationError);
  });

  it("uses an exact read-only database query with group/date/organization predicates", async () => {
    const unsafe = vi.fn(async (_query: string, _params?: unknown[]) => sessions);
    const repo = new PostgresUlcU12StatisticsRepository({ unsafe });
    const report = await repo.read("org-ulc", "group-u12", "2026-08-07", "2026-11-07", roster);
    expect(report.summary.trainings).toBe(2);
    expect(unsafe).toHaveBeenCalledTimes(1);
    expect(unsafe).toHaveBeenCalledWith(expect.stringContaining("FROM ulc_linz_training_session AS session"),
      ["org-ulc", "group-u12", "2026-08-07", "2026-11-07"]);
    const sql = unsafe.mock.calls[0]![0];
    for (const predicate of [
      "session.organization_id = $1", "session.group_id = $2",
      "session.module_id = 'u12'", "session.state = 'scheduled'",
      "session.session_date >= $3::date", "session.session_date <= $4::date",
      "attendance.organization_id = session.organization_id",
    ]) expect(sql).toContain(predicate);
    expect(sql).not.toMatch(/\\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\\b/i);
  });
});

describe("U12 statistics and mobile navigation", () => {
  it("removes all gear icons from group choices and keeps U14 category management accessible", () => {
    const nav = ULC_LINZ_APP_HTML.slice(
      ULC_LINZ_APP_HTML.indexOf('id="app-nav-attendance-menu"'),
      ULC_LINZ_APP_HTML.indexOf('id="app-nav-overflow"'),
    );
    expect(nav).not.toContain("⚙");
    expect(nav).not.toContain("app-nav__attendance-category");
    expect(nav).toContain('data-attendance-target="categories" data-youth-category-area="u14"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('void openYouthCategoryManagement("u14")');
  });

  it("moves U12 category settings into content panel and the plus action beside attendance", () => {
    const contentIndex = ULC_U12_HTML.indexOf('id="u12-content-card"');
    const settingsIndex = ULC_U12_HTML.indexOf('class="u12-category-shortcut"');
    const attendanceIndex = ULC_U12_HTML.indexOf('class="u12-attendance-toolbar"');
    const plusIndex = ULC_U12_HTML.indexOf('id="u12-add-athlete"');
    expect(contentIndex).toBeGreaterThan(0);
    expect(settingsIndex).toBeGreaterThan(contentIndex);
    expect(settingsIndex).toBeLessThan(attendanceIndex);
    expect(plusIndex).toBeGreaterThan(attendanceIndex);
    expect(ULC_U12_HTML).toContain('aria-label="Neues Kind anlegen">＋</button>');
    expect(ULC_U12_CSS).toContain(".u12-content-card { position:relative; }");
    expect(ULC_U12_CSS).toContain(".u12-attendance-toolbar");
    expect(ULC_U12_HTML).toContain("<h1>U12 · Anwesenheit</h1>");
  });

  it("provides a real read-only report dialog with three-month filter and three tabs", () => {
    expect(ULC_U12_HTML).toContain('id="u12-statistics-dialog"');
    expect(ULC_U12_HTML).toContain('id="u12-statistics-from"');
    expect(ULC_U12_HTML).toContain('id="u12-statistics-to"');
    expect(ULC_U12_HTML).toContain('data-u12-stats-tab="trainings"');
    expect(ULC_U12_HTML).toContain('data-u12-stats-tab="athletes"');
    expect(ULC_U12_HTML).toContain('data-u12-stats-tab="categories"');
    expect(ULC_U12_SCRIPT).toContain("today.getMonth() - 3");
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12/statistics?groupId="');
    expect(ULC_U12_SCRIPT).toContain('germanDate(training.date)');
    expect(ULC_U12_SCRIPT).toContain('athlete.lastName + " " + athlete.firstName');
    expect(ULC_U12_SCRIPT).toContain('category.assignments + " Athleten-Zuordnungen"');
    expect(ULC_U12_SCRIPT).not.toContain("statsSummary.innerHTML");
    expect(() => new Function(ULC_U12_SCRIPT)).not.toThrow();
    expect(ULC_U12_CSS).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
  });
});

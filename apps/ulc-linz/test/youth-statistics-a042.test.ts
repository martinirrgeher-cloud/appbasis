import { describe, expect, it, vi } from "vitest";

import {
  aggregateU12Statistics,
  PostgresUlcU12StatisticsRepository,
} from "../worker/u12-statistics-postgres";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

const from = "2026-10-01";
const to = "2026-11-07";
const names = [
  { trainerId: "trainer-a", firstName: "Anna", lastName: "Auer" },
  { trainerId: "trainer-b", firstName: "Berta", lastName: "Binder" },
  { trainerId: "org-other", firstName: "Not", lastName: "InThisGroup" },
];
const roster = [
  { athleteId: "kid-a", firstName: "Kind", lastName: "A" },
  { athleteId: "kid-b", firstName: "Kind", lastName: "B" },
  { athleteId: "kid-c", firstName: "Kind", lastName: "C" },
];
const row = (session_id: string, session_date: string,
  trainer_ids: string[], athlete_id: string | null, status: string | null) => ({
  session_id, session_date, trainer_count: trainer_ids.length, trainer_ids,
  content_titles: [], content_items: [], athlete_id, status, content_slots: [],
});

describe("A04.2 scoped youth statistics", () => {
  it("groups monthly participation once per session, including dates without athletes", () => {
    const result = aggregateU12Statistics([
      row("oct-1", "2026-10-04", ["trainer-a"], "kid-a", "present"),
      row("oct-1", "2026-10-04", ["trainer-a"], "kid-b", "absent"),
      row("oct-2", "2026-10-18", ["trainer-a", "trainer-b"], "kid-a", "excused"),
      row("nov", "2026-11-02", [], null, null),
    ], roster, from, to, names);
    expect(result.months).toEqual([
      { month: "2026-11", trainings: 1, attendance: 0, trainerAttendances: 0 },
      { month: "2026-10", trainings: 2, attendance: 1, trainerAttendances: 3 },
    ]);
    expect(result.summary).toMatchObject({
      trainings: 3, attendance: 1, trainerAttendances: 3,
      unidentifiedTrainerAttendances: 0,
    });
    expect(result.trainers.map((trainer) => [trainer.lastName, trainer.attended]))
      .toEqual([["Auer", 2], ["Binder", 1]]);
  });

  it("uses only documented statuses for rates and keeps missing records distinct from absence", () => {
    const result = aggregateU12Statistics([
      row("s-1", "2026-10-01", [], "kid-a", "present"),
      row("s-1", "2026-10-01", [], "kid-b", "open"),
      row("s-2", "2026-10-02", [], "kid-a", "absent"),
      row("s-2", "2026-10-02", [], "kid-b", "excused"),
      row("s-3", "2026-10-03", [], "kid-a", "present"),
      row("s-4", "2026-10-04", [], null, null),
    ], roster, from, to);
    const byId = new Map(result.athletes.map((athlete) => [athlete.athleteId, athlete]));
    expect(byId.get("kid-a")).toMatchObject({
      attended: 2, evaluated: 3, attendancePercent: 67,
    });
    expect(byId.get("kid-b")).toMatchObject({
      attended: 0, evaluated: 1, attendancePercent: 0,
    });
    expect(byId.get("kid-c")).toMatchObject({
      attended: 0, evaluated: 0, attendancePercent: null,
    });
    // One unrecorded training for kid A is not a documented absence.
    expect(byId.get("kid-a")?.evaluated).toBe(3);
  });

  it("never includes organization-wide trainers who have no scoped session presence", () => {
    const result = aggregateU12Statistics([
      row("session", "2026-11-01", ["trainer-b", "trainer-a"], "kid-a", "present"),
      row("session", "2026-11-01", ["trainer-b", "trainer-a"], "kid-b", "absent"),
    ], roster, from, to, names);
    expect(result.trainers.map((trainer) => trainer.trainerId)).toEqual(["trainer-a", "trainer-b"]);
    expect(result.trainers.some((trainer) => trainer.trainerId === "org-other")).toBe(false);
    expect(result.summary.trainerAttendances).toBe(2);
  });

  it("groups removed trainer identities without exposing IDs or unrelated names", () => {
    const result = aggregateU12Statistics([
      row("session", "2026-11-01", ["deleted-trainer", "trainer-a"], null, null),
    ], roster, from, to, names);
    expect(result.trainers).toEqual([{
      trainerId: "trainer-a", firstName: "Anna", lastName: "Auer", attended: 1,
    }]);
    expect(result.summary.unidentifiedTrainerAttendances).toBe(1);
    expect(result.summary.trainerAttendances).toBe(2);
    expect(JSON.stringify(result)).not.toContain("deleted-trainer");
  });

  it("fails closed on malformed, duplicate or contradictory trainer roll calls", () => {
    const valid = row("session", "2026-11-01", ["trainer-a"], "kid-a", "present");
    for (const trainer_ids of [
      undefined, null, "trainer-a", ["trainer-a", "trainer-a"], ["trainer-a", ""],
      ["trainer-a", 3],
    ]) {
      expect(() => aggregateU12Statistics([{ ...valid, trainer_ids }], roster, from, to, names))
        .toThrow(UlcTrainingValidationError);
    }
    expect(() => aggregateU12Statistics([
      valid, { ...valid, athlete_id: "kid-b", trainer_ids: ["trainer-b"] },
    ], roster, from, to, names)).toThrow(UlcTrainingValidationError);
  });

  it.each(["u12", "u14", "kindertraining"] as const)(
    "retrieves trainer IDs only from the exact scoped %s training sessions",
    async (area) => {
      const unsafe = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
        row("session", "2026-11-01", ["trainer-a"], null, null),
      ]);
      const result = await new PostgresUlcU12StatisticsRepository({ unsafe }, area)
        .read("org-1", "group-1", from, to, roster, names);
      expect(result.trainers.map((trainer) => [trainer.firstName, trainer.attended]))
        .toEqual([["Anna", 1]]);
      expect(unsafe).toHaveBeenCalledOnce();
      const [query, parameters] = unsafe.mock.calls[0]!;
      for (const invariant of [
        "session.organization_id = $1",
        "session.group_id = $2",
        "session.session_date >= $3::date",
        "session.session_date <= $4::date",
        "session.state = 'scheduled'",
        "trainer.organization_id = session.organization_id",
        "trainer.session_id = session.id",
      ]) expect(query).toContain(invariant);
      expect(parameters).toEqual([
        "org-1", "group-1", from, to, ...(area === "u12" ? [] : [area]),
      ]);
      expect(query).toContain(area === "u12"
        ? "session.module_id = 'u12'" : "session.module_id = $5");
      expect(query).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    },
  );

  it("shares four compact tabs, trainer results and months in all three pages", () => {
    for (const { html, css, script, prefix } of [
      { html: ULC_U12_HTML, css: ULC_U12_CSS, script: ULC_U12_SCRIPT, prefix: "u12" },
      { html: ULC_U14_HTML, css: ULC_U14_CSS, script: ULC_U14_SCRIPT, prefix: "u14" },
      { html: ULC_KIDS_HTML, css: ULC_KIDS_CSS, script: ULC_KIDS_SCRIPT, prefix: "kids" },
    ]) {
      for (const tab of ["trainings", "athletes", "categories", "trainers"]) {
        expect(html).toContain('data-' + prefix + '-stats-tab="' + tab + '"');
        expect(html).toContain('data-' + prefix + '-stats-panel="' + tab + '"');
      }
      expect(html).toContain('id="' + prefix + '-statistics-months"');
      expect(html).toContain('id="' + prefix + '-statistics-trainers"');
      expect(css).toContain("repeat(2,minmax(0,1fr))");
      expect(script).toContain('athlete.attendancePercent');
      expect(script).toContain('report.months');
      expect(script).toContain('report.trainers');
      expect(() => new Function(script)).not.toThrow();
    }
    expect(ULC_LINZ_APP_SCRIPT).toContain("bootstrapU14()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("bootstrapKids()");
  });
});

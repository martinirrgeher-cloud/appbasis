import { describe, expect, it, vi } from "vitest";

import {
  aggregateU12Statistics,
  PostgresUlcU12StatisticsRepository,
} from "../worker/u12-statistics-postgres";
import { ULC_U12_HTML, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_SCRIPT, ULC_KIDS_HTML, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";

const from = "2026-10-01";
const to = "2026-11-07";

describe("A04 youth trainer-presence statistics", () => {
  it("counts each trainer once per saved training even with multiple athlete rows", () => {
    const report = aggregateU12Statistics([
      { session_id: "a", session_date: "2026-11-06", trainer_count: 3, trainer_ids: ["trainer-1", "trainer-2", "trainer-3"],
        content_titles: [], content_items: [], athlete_id: "athlete-a",
        status: "present", content_slots: [] },
      { session_id: "a", session_date: "2026-11-06", trainer_count: 3, trainer_ids: ["trainer-1", "trainer-2", "trainer-3"],
        content_titles: [], content_items: [], athlete_id: "athlete-b",
        status: "present", content_slots: [] },
      { session_id: "b", session_date: "2026-10-30", trainer_count: 0, trainer_ids: [],
        content_titles: [], content_items: [], athlete_id: null,
        status: null, content_slots: null },
    ], [
      { athleteId: "athlete-a", firstName: "A", lastName: "Auer" },
      { athleteId: "athlete-b", firstName: "B", lastName: "Binder" },
    ], from, to);
    expect(report.summary).toEqual({
      trainings: 2, attendance: 2, trainerAttendances: 3,
      unidentifiedTrainerAttendances: 3, evaluatedStatuses: 2, openStatuses: 0, categories: 0,
    });
    expect(report.trainings.map(({ trainerPresentCount }) => trainerPresentCount))
      .toEqual([3, 0]);
  });

  it.each(["u14", "kindertraining"] as const)(
    "keeps trainer totals strictly inside the scoped %s youth module SQL query", async (moduleId) => {
      const unsafe = vi.fn(async (_sql: string, _params?: unknown[]) => []);
      const report = await new PostgresUlcU12StatisticsRepository({ unsafe }, moduleId)
        .read("verein-1", "group-a", from, to, []);
      expect(report.summary.trainerAttendances).toBe(0);
      expect(unsafe).toHaveBeenCalledOnce();
      const [sql, args] = unsafe.mock.calls[0]!;
      for (const clause of [
        "session.organization_id = $1",
        "session.group_id = $2",
        "session.module_id = $5",
        "trainer.organization_id = session.organization_id",
        "trainer.session_id = session.id",
      ]) expect(sql).toContain(clause);
      expect(args).toEqual(["verein-1", "group-a", from, to, moduleId]);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    },
  );

  it("inherits the same read-only reports in all three distinct attendance pages", () => {
    const pages = [
      { html: ULC_U12_HTML, script: ULC_U12_SCRIPT, prefix: "u12" },
      { html: ULC_U14_HTML, script: ULC_U14_SCRIPT, prefix: "u14" },
      { html: ULC_KIDS_HTML, script: ULC_KIDS_SCRIPT, prefix: "kids" },
    ];
    for (const { html, script, prefix } of pages) {
      expect(html).toContain('id="' + prefix + '-statistics-dialog"');
      expect(html).toContain('id="' + prefix + '-statistics-summary"');
      expect(html).toContain('id="' + prefix + '-statistics-months"');
      expect(html).toContain('id="' + prefix + '-statistics-trainers"');
      expect(html).toContain('data-' + prefix + '-stats-tab="trainers"');
      expect(script).toContain('["Trainer-Einsätze", report.summary.trainerAttendances]');
      expect(script).toContain('training.trainerPresentCount + " Trainer"');
      expect(script).toContain('requestJson("/api/modules/' + prefix + '/statistics?groupId="');
      expect(() => new Function(script)).not.toThrow();
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  PostgresUlcRegistrationCalendarRepository,
  UlcRegistrationCalendarDataError,
  type UlcRegistrationCalendarSqlClient,
} from "../worker/registration-calendar-postgres";
import {
  ULC_U12_SCRIPT,
} from "../worker/u12-ui";
import {
  ULC_U14_SCRIPT,
  ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";

describe("N17 calendar week batching and navigation critical path", () => {
  it("performs one bounded, organization-scoped query for seven dates", async () => {
    const queries: Array<{ statement: string; params: unknown[] }> = [];
    const sql: UlcRegistrationCalendarSqlClient = {
      unsafe: async (statement, params = []) => {
        queries.push({ statement, params });
        return [
          { session_date: "2026-11-10", kind: "extra", revision: 1 },
          { session_date: "2026-11-12", kind: "cancelled", revision: 2 },
          { session_date: "2026-11-14", kind: "none", revision: 3 },
        ];
      },
    };
    const calendar = new PostgresUlcRegistrationCalendarRepository(sql);
    const result = await calendar.readWeekExceptions("org-a", "kids-group", "2026-11-09");
    expect([...result.entries()]).toEqual([
      ["2026-11-10", { kind: "extra", revision: 1 }],
      ["2026-11-12", { kind: "cancelled", revision: 2 }],
      ["2026-11-14", { kind: null, revision: 3 }],
    ]);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.statement).toContain("organization_id = $1 AND group_id = $2");
    expect(queries[0]?.statement).toContain("BETWEEN $3::date AND $4::date");
    expect(queries[0]?.params).toEqual([
      "org-a", "kids-group", "2026-11-09", "2026-11-15",
    ]);
  });

  it("fails closed on invalid week boundaries, cross-week dates and duplicates", async () => {
    const invalidWeek = new PostgresUlcRegistrationCalendarRepository({
      unsafe: async () => [],
    });
    await expect(invalidWeek.readWeekExceptions("org", "group", "2026-11-10"))
      .rejects.toBeInstanceOf(UlcRegistrationCalendarDataError);
    await expect(invalidWeek.readWeekExceptions("org", "group", "2026-02-30"))
      .rejects.toBeInstanceOf(UlcRegistrationCalendarDataError);

    const rogue = new PostgresUlcRegistrationCalendarRepository({
      unsafe: async () => [{ session_date: "2026-11-16", kind: "extra", revision: 1 }],
    });
    await expect(rogue.readWeekExceptions("org", "group", "2026-11-09"))
      .rejects.toBeInstanceOf(UlcRegistrationCalendarDataError);

    const duplicate = new PostgresUlcRegistrationCalendarRepository({
      unsafe: async () => [
        { session_date: "2026-11-10", kind: "extra", revision: 1 },
        { session_date: "2026-11-10", kind: "extra", revision: 2 },
      ],
    });
    await expect(duplicate.readWeekExceptions("org", "group", "2026-11-09"))
      .rejects.toBeInstanceOf(UlcRegistrationCalendarDataError);
  });

  it("loads the independent youth categories and attendance snapshot concurrently in all areas", () => {
    // The U12 script is the source for the generated U14/Kids variants.
    // This regression protects the measured network critical path without
    // weakening any per-session read, authorization or snapshot validation.
    for (const [area, source] of [
      ["u12", ULC_U12_SCRIPT],
      ["u14", ULC_U14_SCRIPT],
      ["kindertraining", ULC_KIDS_SCRIPT],
    ] as const) {
      const loadName = area === "kindertraining"
        ? "loadKidsAttendance"
        : area === "u14" ? "loadU14Attendance" : "loadU12Attendance";
      const section = source.slice(
        source.indexOf("async function " + loadName + "("),
      );
      expect(section, area).toContain("const [, payload] = await Promise.all([");
      expect(section, area).not.toMatch(/await refreshYouthCategoryCatalog\([^)]*\);/);
      expect(section, area).toContain("if (generation !== attendanceSessionGeneration");
    }
  });
});

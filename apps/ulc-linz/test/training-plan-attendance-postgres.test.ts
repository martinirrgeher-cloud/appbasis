import { describe, expect, it } from "vitest";

import {
  PostgresUlcTrainingPlanAttendanceReader,
  type UlcTrainingPlanAttendanceSqlClient,
} from "../worker/training-plan-attendance-postgres";

describe("ULC E7B5 training plan attendance projection", () => {
  it("reads only one organization/subject/date range and returns planning-safe fields", async () => {
    const calls: Array<{
      query: string;
      parameters: readonly unknown[] | undefined;
    }> = [];
    const sql: UlcTrainingPlanAttendanceSqlClient = {
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            session_date: "2026-10-12",
            module_id: "u12",
            group_id: "group-u12",
            group_name: "U12 Sprint",
            group_short_name: "U12",
            session_state: "scheduled",
            status: "present",
          },
          {
            session_date: "2026-10-14",
            module_id: "kindertraining",
            group_id: "group-kids",
            group_name: "Kindertraining",
            group_short_name: null,
            session_state: "cancelled",
            status: "open",
          },
        ];
      },
    };

    const reader = new PostgresUlcTrainingPlanAttendanceReader(sql);
    await expect(
      reader.listForSubjectDateRange(
        "verein-1",
        "athlete-1",
        "2026-10-12",
        "2026-10-18",
      ),
    ).resolves.toEqual([
      {
        sessionDate: "2026-10-12",
        moduleId: "u12",
        groupId: "group-u12",
        groupName: "U12 Sprint",
        groupShortName: "U12",
        sessionState: "scheduled",
        status: "present",
      },
      {
        sessionDate: "2026-10-14",
        moduleId: "kindertraining",
        groupId: "group-kids",
        groupName: "Kindertraining",
        groupShortName: null,
        sessionState: "cancelled",
        status: "open",
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.parameters).toEqual([
      "verein-1",
      "athlete-1",
      "2026-10-12",
      "2026-10-18",
    ]);
    expect(calls[0]?.query).toContain(
      "attendance.organization_id = $1",
    );
    expect(calls[0]?.query).toContain("attendance.athlete_id = $2");
    expect(calls[0]?.query).toContain(
      "session.session_date BETWEEN $3::date AND $4::date",
    );
    expect(calls[0]?.query).not.toContain("session.note");
    expect(calls[0]?.query).not.toContain("first_name");
    expect(calls[0]?.query).not.toContain("last_name");
  });

  it("fails closed when source rows cannot be safely projected", async () => {
    for (const row of [
      {
        session_date: "2026-10-12",
        module_id: "unknown",
        group_id: "group-1",
        group_name: "Sprint",
        group_short_name: null,
        session_state: "scheduled",
        status: "present",
      },
      {
        session_date: "2026-10-12",
        module_id: "u12",
        group_id: "group-1",
        group_name: null,
        group_short_name: null,
        session_state: "scheduled",
        status: "present",
      },
      {
        session_date: "2026-10-12",
        module_id: "u12",
        group_id: "group-1",
        group_name: "Sprint",
        group_short_name: null,
        session_state: "scheduled",
        status: "invalid",
      },
    ]) {
      const reader = new PostgresUlcTrainingPlanAttendanceReader({
        async unsafe() {
          return [row];
        },
      });
      await expect(
        reader.listForSubjectDateRange(
          "verein-1",
          "athlete-1",
          "2026-10-12",
          "2026-10-18",
        ),
      ).rejects.toBeInstanceOf(Error);
    }
  });

  it("rejects malformed or excessive date ranges before SQL", async () => {
    let calls = 0;
    const reader = new PostgresUlcTrainingPlanAttendanceReader({
      async unsafe() {
        calls += 1;
        return [];
      },
    });

    for (const [fromDate, toDate] of [
      ["2026-10-18", "2026-10-12"],
      ["2026-10-01", "2026-11-02"],
      ["2026-02-30", "2026-03-01"],
    ]) {
      await expect(
        reader.listForSubjectDateRange(
          "verein-1",
          "athlete-1",
          fromDate,
          toDate,
        ),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(calls).toBe(0);
  });
});

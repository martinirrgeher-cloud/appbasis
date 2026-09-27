import { describe, expect, it } from "vitest";

import {
  PostgresUlcTrainingSessionRepository,
  UlcTrainingSessionPersistenceError,
} from "../worker/training-session-postgres";

describe("ULC training session PostgreSQL persistence", () => {
  it("saves session and full attendance snapshot in one atomic SQL statement", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          return [
            {
              id: "session-existing",
              organization_id: "verein-1",
              module_id: "kindertraining",
              group_id: "group-1",
              session_date: "2026-09-27",
              state: "scheduled",
              note: "Halle",
              saved_attendance_count: 2,
              deleted_stale_attendance_count: 1,
            },
          ];
        },
      },
      () => "session-proposed",
    );

    const result = await repository.saveSession(
      "verein-1",
      {
        moduleId: "kindertraining",
        groupId: "group-1",
        sessionDate: "2026-09-27",
        note: " Halle ",
      },
      [
        { athleteId: "athlete-1", status: "present" },
        { athleteId: "athlete-2", status: "excused" },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain(
      "ON CONFLICT (organization_id, module_id, group_id, session_date)",
    );
    expect(calls[0]?.query).toContain("saved_attendance AS");
    expect(calls[0]?.query).toContain("deleted_stale_attendance AS");
    expect(calls[0]?.parameters?.[0]).toBe("session-proposed");
    expect(calls[0]?.parameters?.[7]).toBe(
      JSON.stringify([
        { athlete_id: "athlete-1", status: "present" },
        { athlete_id: "athlete-2", status: "excused" },
      ]),
    );
    expect(result).toEqual({
      session: {
        id: "session-existing",
        organizationId: "verein-1",
        moduleId: "kindertraining",
        groupId: "group-1",
        sessionDate: "2026-09-27",
        state: "scheduled",
        note: "Halle",
      },
      attendance: [
        {
          organizationId: "verein-1",
          sessionId: "session-existing",
          athleteId: "athlete-1",
          status: "present",
        },
        {
          organizationId: "verein-1",
          sessionId: "session-existing",
          athleteId: "athlete-2",
          status: "excused",
        },
      ],
    });
  });

  it("reads a session only inside the requested organization and module scope", async () => {
    const queries: string[] = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query) {
          queries.push(query);
          if (query.includes("FROM ulc_linz_training_session")) {
            return [
              {
                id: "session-1",
                organization_id: "verein-1",
                module_id: "kindertraining",
                group_id: "group-1",
                session_date: "2026-09-27",
                state: "scheduled",
                note: null,
              },
            ];
          }
          return [
            {
              organization_id: "verein-1",
              session_id: "session-1",
              athlete_id: "athlete-1",
              status: "open",
            },
          ];
        },
      },
      () => "validation-id",
    );

    const result = await repository.readSession(
      "verein-1",
      "kindertraining",
      "group-1",
      "2026-09-27",
    );

    expect(queries[0]).toContain("organization_id = $1");
    expect(queries[0]).toContain("module_id = $2");
    expect(queries[1]).toContain("organization_id = $1");
    expect(result?.attendance[0]?.athleteId).toBe("athlete-1");
  });

  it("fails closed when the database returns a foreign organization", async () => {
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe() {
          return [
            {
              id: "session-1",
              organization_id: "verein-2",
              module_id: "kindertraining",
              group_id: "group-1",
              session_date: "2026-09-27",
              state: "scheduled",
              note: null,
            },
          ];
        },
      },
      () => "validation-id",
    );

    await expect(
      repository.readSession(
        "verein-1",
        "kindertraining",
        "group-1",
        "2026-09-27",
      ),
    ).rejects.toBeInstanceOf(UlcTrainingSessionPersistenceError);
  });
});

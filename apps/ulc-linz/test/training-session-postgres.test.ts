import { describe, expect, it } from "vitest";

import {
  PostgresUlcTrainingSessionRepository,
  UlcTrainingSessionConflictError,
  UlcTrainingSessionPersistenceError,
} from "../worker/training-session-postgres";

describe("ULC training session PostgreSQL persistence", () => {
  it("saves session and full attendance snapshot in one atomic SQL statement", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          if (query.includes("FROM ulc_linz_training_registration")) {
            return [];
          }
          return [
            {
              id: "session-existing",
              organization_id: "verein-1",
              module_id: "kindertraining",
              group_id: "group-1",
              session_date: "2026-09-27",
              state: "scheduled",
              note: "Halle",
              revision: "8",
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
      "7",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.query).toContain("updated_session AS");
    expect(calls[0]?.query).toContain("xmin::text = $9::text");
    expect(calls[0]?.query).toContain("inserted_session AS");
    expect(calls[0]?.query).toContain("DO NOTHING");
    expect(calls[0]?.query).toContain("saved_attendance AS");
    expect(calls[0]?.query).toContain("deleted_stale_attendance AS");
    expect(calls[0]?.parameters?.[0]).toBe("session-proposed");
    expect(calls[0]?.parameters?.[7]).toBe(
      JSON.stringify([
        { athlete_id: "athlete-1", status: "present" },
        { athlete_id: "athlete-2", status: "excused" },
      ]),
    );
    expect(calls[0]?.parameters?.[8]).toBe("7");
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
      revision: "8",
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
      registrations: [],
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
                revision: "11",
              },
            ];
          }
          if (query.includes("FROM ulc_linz_training_attendance")) {
            return [
              {
                organization_id: "verein-1",
                session_id: "session-1",
                athlete_id: "athlete-1",
                status: "open",
              },
            ];
          }
          if (query.includes("FROM ulc_linz_training_registration")) {
            return [];
          }
          throw new Error("Unexpected query");

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
    expect(queries[2]).toContain("ulc_linz_training_registration");
    expect(result?.revision).toBe("11");
    expect(result?.attendance[0]?.athleteId).toBe("athlete-1");
    expect(result?.registrations).toEqual([]);
  });

  it("lists scheduled attendance only for one athlete, organization and date range", async () => {
    const calls: Array<{
      query: string;
      parameters: readonly unknown[] | undefined;
    }> = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          return [
            {
              organization_id: "verein-1",
              athlete_id: "athlete-1",
              session_id: "session-1",
              session_date: "2026-09-27",
              status: "present",
            },
            {
              organization_id: "verein-1",
              athlete_id: "athlete-1",
              session_id: "session-2",
              session_date: "2026-09-26",
              status: "excused",
            },
          ];
        },
      },
      () => "validation-id",
    );

    await expect(
      repository.listAttendanceForAthleteDateRange(
        "verein-1",
        "athlete-1",
        "2026-09-21",
        "2026-09-27",
      ),
    ).resolves.toEqual([
      {
        sessionId: "session-1",
        sessionDate: "2026-09-27",
        status: "present",
      },
      {
        sessionId: "session-2",
        sessionDate: "2026-09-26",
        status: "excused",
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain(
      "attendance.organization_id = $1",
    );
    expect(calls[0]?.query).toContain(
      "attendance.athlete_id = $2",
    );
    expect(calls[0]?.query).toContain(
      "session.state = 'scheduled'",
    );
    expect(calls[0]?.query).toContain(
      "session.session_date >= $3::date",
    );
    expect(calls[0]?.query).toContain(
      "session.session_date <= $4::date",
    );
    expect(calls[0]?.parameters).toEqual([
      "verein-1",
      "athlete-1",
      "2026-09-21",
      "2026-09-27",
    ]);
  });

  it("rejects invalid attendance ranges before querying PostgreSQL", async () => {
    let called = false;
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe() {
          called = true;
          return [];
        },
      },
      () => "validation-id",
    );

    await expect(
      repository.listAttendanceForAthleteDateRange(
        "verein-1",
        "athlete-1",
        "2026-09-28",
        "2026-09-27",
      ),
    ).rejects.toMatchObject({
      name: "UlcTrainingValidationError",
    });
    expect(called).toBe(false);
  });

  it("fails closed when an attendance range row escapes organization or athlete scope", async () => {
    for (const row of [
      {
        organization_id: "verein-2",
        athlete_id: "athlete-1",
        session_id: "session-1",
        session_date: "2026-09-27",
        status: "present",
      },
      {
        organization_id: "verein-1",
        athlete_id: "athlete-2",
        session_id: "session-1",
        session_date: "2026-09-27",
        status: "present",
      },
    ]) {
      const repository = new PostgresUlcTrainingSessionRepository(
        {
          async unsafe() {
            return [row];
          },
        },
        () => "validation-id",
      );

      await expect(
        repository.listAttendanceForAthleteDateRange(
          "verein-1",
          "athlete-1",
          "2026-09-21",
          "2026-09-27",
        ),
      ).rejects.toBeInstanceOf(UlcTrainingSessionPersistenceError);
    }
  });

  it("reports a stale revision without touching attendance", async () => {
    const calls: string[] = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query) {
          calls.push(query);
          return [];
        },
      },
      () => "session-proposed",
    );

    await expect(
      repository.saveSession(
        "verein-1",
        {
          moduleId: "kindertraining",
          groupId: "group-1",
          sessionDate: "2026-09-27",
        },
        [{ athleteId: "athlete-1", status: "present" }],
        "7",
      ),
    ).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("saved_session AS MATERIALIZED");
  });

  it("creates a scheduled session idempotently before self-registration", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          if (query.includes("INSERT INTO ulc_linz_training_session")) {
            return [];
          }
          if (query.includes("FROM ulc_linz_training_session")) {
            return [{
              id: "session-existing",
              organization_id: "verein-1",
              module_id: "kindertraining",
              group_id: "group-1",
              session_date: "2026-09-27",
              state: "scheduled",
              note: null,
              revision: "3",
            }];
          }
          return [];
        },
      },
      () => "session-proposed",
    );

    await expect(
      repository.ensureScheduledSession(
        "verein-1",
        "kindertraining",
        "group-1",
        "2026-09-27",
      ),
    ).resolves.toMatchObject({
      session: { id: "session-existing", state: "scheduled" },
      registrations: [],
    });
    expect(calls[0]?.query).toContain("ON CONFLICT");
    expect(calls[0]?.parameters?.[0]).toBe("session-proposed");
  });

  it("stores registration revisions with one immutable change row", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcTrainingSessionRepository(
      {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          return [{
            organization_id: "verein-1",
            session_id: "session-1",
            athlete_id: "athlete-1",
            intention: "attending",
            revision: 2,
            updated_by_identity_id: "identity-athlete-1",
            change_count: 1,
          }];
        },
      },
      () => "registration-change-1",
    );

    await expect(
      repository.saveRegistration(
        "verein-1",
        "session-1",
        "athlete-1",
        "attending",
        1,
        "identity-athlete-1",
      ),
    ).resolves.toEqual({
      organizationId: "verein-1",
      sessionId: "session-1",
      athleteId: "athlete-1",
      intention: "attending",
      revision: 2,
      updatedByIdentityId: "identity-athlete-1",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain(
      "INSERT INTO ulc_linz_training_registration_change",
    );
    expect(calls[0]?.query).toContain("registration.revision = $5::int");
    expect(calls[0]?.parameters).toEqual([
      "verein-1",
      "session-1",
      "athlete-1",
      "attending",
      1,
      "identity-athlete-1",
      "registration-change-1",
    ]);
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

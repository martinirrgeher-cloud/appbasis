import {
  createUlcTrainingSession,
  normalizeUlcTrainingAttendanceSet,
  type CreateUlcTrainingSessionInput,
  type UlcTrainingAttendance,
  type UlcTrainingModule,
  type UlcTrainingSession,
} from "./training-session-domain";

type SqlParameter = string | number | boolean | null;

export interface UlcTrainingSessionSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcTrainingSessionSnapshot {
  readonly session: UlcTrainingSession;
  readonly attendance: readonly UlcTrainingAttendance[];
}

export class UlcTrainingSessionPersistenceError extends Error {
  readonly code = "ULC_TRAINING_SESSION_PERSISTENCE_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "UlcTrainingSessionPersistenceError";
  }
}

export class PostgresUlcTrainingSessionRepository {
  readonly #sql: UlcTrainingSessionSqlClient;
  readonly #createId: () => string;

  constructor(
    sql: UlcTrainingSessionSqlClient,
    createId: () => string = () => crypto.randomUUID(),
  ) {
    this.#sql = sql;
    this.#createId = createId;
  }

  async readSession(
    organizationId: string,
    moduleId: UlcTrainingModule,
    groupId: string,
    sessionDate: string,
  ): Promise<UlcTrainingSessionSnapshot | null> {
    const expected = createUlcTrainingSession(
      {
        moduleId,
        groupId,
        sessionDate,
      },
      {
        id: requiredGeneratedId(this.#createId()),
        organizationId,
      },
    );

    const rows = await this.#sql.unsafe(
      `SELECT id,
              organization_id,
              module_id,
              group_id,
              session_date::text AS session_date,
              state,
              note
       FROM ulc_linz_training_session
       WHERE organization_id = $1
         AND module_id = $2
         AND group_id = $3
         AND session_date = $4::date`,
      [
        expected.organizationId,
        expected.moduleId,
        expected.groupId,
        expected.sessionDate,
      ],
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1 || rows[0] === undefined) blocked();

    const session = sessionFromRow(rows[0], expected.organizationId);
    const attendanceRows = await this.#sql.unsafe(
      `SELECT organization_id, session_id, athlete_id, status
       FROM ulc_linz_training_attendance
       WHERE organization_id = $1
         AND session_id = $2
       ORDER BY athlete_id ASC`,
      [expected.organizationId, session.id],
    );
    const attendance = Object.freeze(
      attendanceRows.map((row) =>
        attendanceFromRow(row, expected.organizationId, session.id),
      ),
    );

    return Object.freeze({ session, attendance });
  }

  async saveSession(
    organizationId: string,
    input: CreateUlcTrainingSessionInput,
    attendanceInput: readonly {
      readonly athleteId: string;
      readonly status: UlcTrainingAttendance["status"];
    }[],
  ): Promise<UlcTrainingSessionSnapshot> {
    const proposed = createUlcTrainingSession(input, {
      id: requiredGeneratedId(this.#createId()),
      organizationId,
    });
    const normalizedAttendance = normalizeUlcTrainingAttendanceSet(
      attendanceInput.map((entry) => ({
        organizationId: proposed.organizationId,
        sessionId: proposed.id,
        athleteId: entry.athleteId,
        status: entry.status,
      })),
    );
    const payload = JSON.stringify(
      normalizedAttendance.map((entry) => ({
        athlete_id: entry.athleteId,
        status: entry.status,
      })),
    );

    const rows = await this.#sql.unsafe(
      `WITH saved_session AS (
         INSERT INTO ulc_linz_training_session (
           id,
           organization_id,
           module_id,
           group_id,
           session_date,
           state,
           note
         )
         VALUES ($1, $2, $3, $4, $5::date, $6, $7)
         ON CONFLICT (organization_id, module_id, group_id, session_date)
         DO UPDATE SET
           state = EXCLUDED.state,
           note = EXCLUDED.note,
           updated_at = now()
         RETURNING id,
                   organization_id,
                   module_id,
                   group_id,
                   session_date::text AS session_date,
                   state,
                   note
       ),
       input_attendance AS MATERIALIZED (
         SELECT athlete_id, status
         FROM jsonb_to_recordset($8::jsonb)
           AS entry(athlete_id text, status text)
       ),
       saved_attendance AS (
         INSERT INTO ulc_linz_training_attendance (
           organization_id,
           session_id,
           athlete_id,
           status
         )
         SELECT $2, session.id, input.athlete_id, input.status
         FROM saved_session session
         CROSS JOIN input_attendance input
         ON CONFLICT (session_id, athlete_id)
         DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           status = EXCLUDED.status,
           updated_at = now()
         RETURNING athlete_id
       ),
       deleted_stale_attendance AS (
         DELETE FROM ulc_linz_training_attendance attendance
         USING saved_session session
         WHERE attendance.organization_id = $2
           AND attendance.session_id = session.id
           AND NOT EXISTS (
             SELECT 1
             FROM input_attendance input
             WHERE input.athlete_id = attendance.athlete_id
           )
         RETURNING attendance.athlete_id
       )
       SELECT session.id,
              session.organization_id,
              session.module_id,
              session.group_id,
              session.session_date,
              session.state,
              session.note,
              (SELECT count(*)::int FROM saved_attendance)
                AS saved_attendance_count,
              (SELECT count(*)::int FROM deleted_stale_attendance)
                AS deleted_stale_attendance_count
       FROM saved_session session`,
      [
        proposed.id,
        proposed.organizationId,
        proposed.moduleId,
        proposed.groupId,
        proposed.sessionDate,
        proposed.state,
        proposed.note,
        payload,
      ],
    );

    if (rows.length !== 1 || rows[0] === undefined) blocked();
    const session = sessionFromRow(rows[0], proposed.organizationId);
    if (
      nonNegativeInteger(rows[0], "saved_attendance_count") !==
      normalizedAttendance.length
    ) {
      blocked();
    }
    nonNegativeInteger(rows[0], "deleted_stale_attendance_count");

    return Object.freeze({
      session,
      attendance: Object.freeze(
        normalizedAttendance.map((entry) =>
          Object.freeze({
            organizationId: session.organizationId,
            sessionId: session.id,
            athleteId: entry.athleteId,
            status: entry.status,
          }),
        ),
      ),
    });
  }
}

function sessionFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): UlcTrainingSession {
  const organizationId = rowString(row, "organization_id");
  if (organizationId !== expectedOrganizationId) blocked();
  return createUlcTrainingSession(
    {
      moduleId: rowTrainingModule(row.module_id),
      groupId: rowString(row, "group_id"),
      sessionDate: rowString(row, "session_date"),
      state: rowSessionState(row.state),
      note: rowNullableString(row, "note"),
    },
    {
      id: rowString(row, "id"),
      organizationId,
    },
  );
}

function attendanceFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  expectedSessionId: string,
): UlcTrainingAttendance {
  const values = normalizeUlcTrainingAttendanceSet([
    {
      organizationId: rowString(row, "organization_id"),
      sessionId: rowString(row, "session_id"),
      athleteId: rowString(row, "athlete_id"),
      status: rowAttendanceStatus(row.status),
    },
  ]);
  const attendance = values[0];
  if (
    attendance === undefined ||
    attendance.organizationId !== expectedOrganizationId ||
    attendance.sessionId !== expectedSessionId
  ) {
    blocked();
  }
  return attendance;
}

function rowTrainingModule(value: unknown): UlcTrainingModule {
  if (value !== "kindertraining" && value !== "u12" && value !== "u14") {
    blocked();
  }
  return value;
}

function rowSessionState(
  value: unknown,
): UlcTrainingSession["state"] {
  if (value !== "scheduled" && value !== "cancelled") blocked();
  return value;
}

function rowAttendanceStatus(
  value: unknown,
): UlcTrainingAttendance["status"] {
  if (
    value !== "open" &&
    value !== "present" &&
    value !== "excused" &&
    value !== "absent"
  ) {
    blocked();
  }
  return value;
}

function rowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    blocked();
  }
  return value;
}

function rowNullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") blocked();
  return value;
}

function nonNegativeInteger(
  row: Record<string, unknown>,
  key: string,
): number {
  const value = row[key];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    blocked();
  }
  return value;
}

function requiredGeneratedId(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    blocked();
  }
  return value;
}

function blocked(): never {
  throw new UlcTrainingSessionPersistenceError(
    "ULC training session persistence returned an inconsistent state.",
  );
}

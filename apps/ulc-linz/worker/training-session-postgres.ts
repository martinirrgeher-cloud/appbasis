import {
  createUlcTrainingRegistration,
  createUlcTrainingSession,
  normalizeUlcTrainingAttendanceSet,
  UlcTrainingValidationError,
  type CreateUlcTrainingSessionInput,
  type UlcTrainingAttendance,
  type UlcTrainingModule,
  type UlcTrainingRegistration,
  type UlcTrainingRegistrationIntention,
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
  readonly revision: string;
  readonly attendance: readonly UlcTrainingAttendance[];
  readonly registrations: readonly UlcTrainingRegistration[];
}

export interface UlcTrainingAttendanceSummary {
  readonly sessionId: string;
  readonly sessionDate: string;
  readonly status: UlcTrainingAttendance["status"];
}

export class UlcTrainingSessionConflictError extends Error {
  readonly code = "ULC_TRAINING_SESSION_CONFLICT";

  constructor() {
    super("ULC training session was changed by another editor.");
    this.name = "UlcTrainingSessionConflictError";
  }
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
              note,
              xmin::text AS revision
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
    const registrationRows = await this.#sql.unsafe(
      `SELECT organization_id,
              session_id,
              athlete_id,
              intention,
              revision,
              updated_by_identity_id
       FROM ulc_linz_training_registration
       WHERE organization_id = $1
         AND session_id = $2
       ORDER BY athlete_id ASC`,
      [expected.organizationId, session.id],
    );
    const registrations = Object.freeze(
      registrationRows.map((row) =>
        registrationFromRow(row, expected.organizationId, session.id),
      ),
    );

    return Object.freeze({
      session,
      revision: rowRevision(rows[0]),
      attendance,
      registrations,
    });
  }

  async ensureScheduledSession(
    organizationId: string,
    moduleId: UlcTrainingModule,
    groupId: string,
    sessionDate: string,
  ): Promise<UlcTrainingSessionSnapshot> {
    const proposed = createUlcTrainingSession(
      { moduleId, groupId, sessionDate },
      {
        id: requiredGeneratedId(this.#createId()),
        organizationId,
      },
    );
    await this.#sql.unsafe(
      `INSERT INTO ulc_linz_training_session (
         id,
         organization_id,
         module_id,
         group_id,
         session_date,
         state,
         note
       )
       VALUES ($1, $2, $3, $4, $5::date, 'scheduled', NULL)
       ON CONFLICT (organization_id, module_id, group_id, session_date)
       DO NOTHING`,
      [
        proposed.id,
        proposed.organizationId,
        proposed.moduleId,
        proposed.groupId,
        proposed.sessionDate,
      ],
    );
    const snapshot = await this.readSession(
      proposed.organizationId,
      proposed.moduleId,
      proposed.groupId,
      proposed.sessionDate,
    );
    if (snapshot === null || snapshot.session.state !== "scheduled") {
      throw new UlcTrainingSessionConflictError();
    }
    return snapshot;
  }

  async listAttendanceForAthleteDateRange(
    organizationId: string,
    athleteId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly UlcTrainingAttendanceSummary[]> {
    const organization = requiredInputIdentifier(
      organizationId,
      "Organization id",
    );
    const athlete = requiredInputIdentifier(athleteId, "Athlete id");
    const from = requiredInputDate(fromDate, "Attendance from date");
    const to = requiredInputDate(toDate, "Attendance to date");
    if (from > to) {
      throw new UlcTrainingValidationError(
        "Attendance date range is invalid.",
      );
    }

    const rows = await this.#sql.unsafe(
      `SELECT attendance.organization_id,
              attendance.athlete_id,
              attendance.session_id,
              session.session_date::text AS session_date,
              attendance.status
       FROM ulc_linz_training_attendance AS attendance
       INNER JOIN ulc_linz_training_session AS session
         ON session.id = attendance.session_id
        AND session.organization_id = attendance.organization_id
       WHERE attendance.organization_id = $1
         AND attendance.athlete_id = $2
         AND session.state = 'scheduled'
         AND session.session_date >= $3::date
         AND session.session_date <= $4::date
       ORDER BY session.session_date ASC,
                attendance.session_id ASC`,
      [organization, athlete, from, to],
    );

    return Object.freeze(
      rows.map((row) =>
        attendanceSummaryFromRow(row, organization, athlete),
      ),
    );
  }

  async saveSession(
    organizationId: string,
    input: CreateUlcTrainingSessionInput,
    attendanceInput: readonly {
      readonly athleteId: string;
      readonly status: UlcTrainingAttendance["status"];
    }[],
    expectedRevision: string | null,
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
    const revision =
      expectedRevision === null ? null : requiredRevisionToken(expectedRevision);

    const rows = await this.#sql.unsafe(
      `WITH updated_session AS (
         UPDATE ulc_linz_training_session
         SET state = $6,
             note = $7,
             updated_at = now()
         WHERE organization_id = $2
           AND module_id = $3
           AND group_id = $4
           AND session_date = $5::date
           AND $9::text IS NOT NULL
           AND xmin::text = $9::text
         RETURNING id,
                   organization_id,
                   module_id,
                   group_id,
                   session_date::text AS session_date,
                   state,
                   note,
                   xmin::text AS revision
       ),
       inserted_session AS (
         INSERT INTO ulc_linz_training_session (
           id,
           organization_id,
           module_id,
           group_id,
           session_date,
           state,
           note
         )
         SELECT $1, $2, $3, $4, $5::date, $6, $7
         WHERE $9::text IS NULL
         ON CONFLICT (organization_id, module_id, group_id, session_date)
         DO NOTHING
         RETURNING id,
                   organization_id,
                   module_id,
                   group_id,
                   session_date::text AS session_date,
                   state,
                   note,
                   xmin::text AS revision
       ),
       saved_session AS MATERIALIZED (
         SELECT * FROM updated_session
         UNION ALL
         SELECT * FROM inserted_session
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
              session.revision,
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
        revision,
      ],
    );

    if (rows.length === 0) {
      throw new UlcTrainingSessionConflictError();
    }
    if (rows.length !== 1 || rows[0] === undefined) blocked();
    const session = sessionFromRow(rows[0], proposed.organizationId);
    if (
      nonNegativeInteger(rows[0], "saved_attendance_count") !==
      normalizedAttendance.length
    ) {
      blocked();
    }
    nonNegativeInteger(rows[0], "deleted_stale_attendance_count");

    const registrationRows = await this.#sql.unsafe(
      `SELECT organization_id,
              session_id,
              athlete_id,
              intention,
              revision,
              updated_by_identity_id
       FROM ulc_linz_training_registration
       WHERE organization_id = $1
         AND session_id = $2
       ORDER BY athlete_id ASC`,
      [session.organizationId, session.id],
    );
    const registrations = Object.freeze(
      registrationRows.map((row) =>
        registrationFromRow(row, session.organizationId, session.id),
      ),
    );

    return Object.freeze({
      session,
      revision: rowRevision(rows[0]),
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
      registrations,
    });
  }

  async saveRegistration(
    organizationId: string,
    sessionId: string,
    athleteId: string,
    intention: UlcTrainingRegistrationIntention,
    expectedRevision: number | null,
    actorIdentityId: string,
  ): Promise<UlcTrainingRegistration> {
    const organization = requiredInputIdentifier(
      organizationId,
      "Organization id",
    );
    const session = requiredInputIdentifier(sessionId, "Training session id");
    const athlete = requiredInputIdentifier(athleteId, "Athlete id");
    const actor = requiredInputIdentifier(
      actorIdentityId,
      "Registration actor identity id",
    );
    const normalized = createUlcTrainingRegistration({
      organizationId: organization,
      sessionId: session,
      athleteId: athlete,
      intention,
      revision: expectedRevision ?? 1,
      updatedByIdentityId: actor,
    });
    const changeId = requiredGeneratedId(this.#createId());

    const rows = await this.#sql.unsafe(
      `WITH scoped_session AS MATERIALIZED (
         SELECT id
         FROM ulc_linz_training_session
         WHERE organization_id = $1
           AND id = $2
           AND state = 'scheduled'
       ),
       updated_registration AS (
         UPDATE ulc_linz_training_registration AS registration
         SET intention = $4,
             revision = registration.revision + 1,
             updated_by_identity_id = $6,
             updated_at = now()
         WHERE registration.organization_id = $1
           AND registration.session_id = $2
           AND registration.athlete_id = $3
           AND $5::int IS NOT NULL
           AND registration.revision = $5::int
           AND EXISTS (
             SELECT 1 FROM scoped_session WHERE id = registration.session_id
           )
         RETURNING organization_id,
                   session_id,
                   athlete_id,
                   intention,
                   revision,
                   updated_by_identity_id
       ),
       inserted_registration AS (
         INSERT INTO ulc_linz_training_registration (
           organization_id,
           session_id,
           athlete_id,
           intention,
           revision,
           updated_by_identity_id
         )
         SELECT $1, session.id, $3, $4, 1, $6
         FROM scoped_session AS session
         WHERE $5::int IS NULL
         ON CONFLICT (session_id, athlete_id) DO NOTHING
         RETURNING organization_id,
                   session_id,
                   athlete_id,
                   intention,
                   revision,
                   updated_by_identity_id
       ),
       saved_registration AS MATERIALIZED (
         SELECT * FROM updated_registration
         UNION ALL
         SELECT * FROM inserted_registration
       ),
       inserted_change AS (
         INSERT INTO ulc_linz_training_registration_change (
           id,
           organization_id,
           session_id,
           athlete_id,
           intention,
           revision,
           actor_identity_id
         )
         SELECT $7,
                organization_id,
                session_id,
                athlete_id,
                intention,
                revision,
                $6
         FROM saved_registration
         RETURNING id
       )
       SELECT registration.organization_id,
              registration.session_id,
              registration.athlete_id,
              registration.intention,
              registration.revision,
              registration.updated_by_identity_id,
              (SELECT count(*)::int FROM inserted_change) AS change_count
       FROM saved_registration AS registration`,
      [
        normalized.organizationId,
        normalized.sessionId,
        normalized.athleteId,
        normalized.intention,
        expectedRevision,
        normalized.updatedByIdentityId,
        changeId,
      ],
    );

    if (rows.length === 0) {
      throw new UlcTrainingSessionConflictError();
    }
    if (
      rows.length !== 1 ||
      rows[0] === undefined ||
      nonNegativeInteger(rows[0], "change_count") !== 1
    ) {
      blocked();
    }
    return registrationFromRow(
      rows[0],
      normalized.organizationId,
      normalized.sessionId,
    );
  }
}

function registrationFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  expectedSessionId: string,
): UlcTrainingRegistration {
  const registration = createUlcTrainingRegistration({
    organizationId: rowString(row, "organization_id"),
    sessionId: rowString(row, "session_id"),
    athleteId: rowString(row, "athlete_id"),
    intention: rowRegistrationIntention(row.intention),
    revision: rowPositiveInteger(row, "revision"),
    updatedByIdentityId: rowString(row, "updated_by_identity_id"),
  });
  if (
    registration.organizationId !== expectedOrganizationId ||
    registration.sessionId !== expectedSessionId
  ) {
    blocked();
  }
  return registration;
}

function attendanceSummaryFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  expectedAthleteId: string,
): UlcTrainingAttendanceSummary {
  const organizationId = rowString(row, "organization_id");
  const athleteId = rowString(row, "athlete_id");
  if (
    organizationId !== expectedOrganizationId ||
    athleteId !== expectedAthleteId
  ) {
    blocked();
  }
  return Object.freeze({
    sessionId: rowString(row, "session_id"),
    sessionDate: rowDateString(row, "session_date"),
    status: rowAttendanceStatus(row.status),
  });
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

function rowRegistrationIntention(
  value: unknown,
): UlcTrainingRegistrationIntention {
  if (
    value !== "unknown" &&
    value !== "attending" &&
    value !== "not_attending" &&
    value !== "maybe"
  ) {
    blocked();
  }
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

function requiredInputIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcTrainingValidationError(`${label} is invalid.`);
  }
  return value;
}

function requiredInputDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UlcTrainingValidationError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new UlcTrainingValidationError(`${label} is invalid.`);
  }
  return value;
}

function rowDateString(row: Record<string, unknown>, key: string): string {
  const value = rowString(row, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) blocked();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
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

function rowRevision(row: Record<string, unknown>): string {
  return requiredRevisionToken(row.revision);
}

function requiredRevisionToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    value.length > 20
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

function rowPositiveInteger(
  row: Record<string, unknown>,
  key: string,
): number {
  const value = row[key];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    blocked();
  }
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

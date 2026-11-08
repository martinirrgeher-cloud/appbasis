import {
  createUlcTrainingRegistration,
  createUlcTrainingSession,
  normalizeUlcTrainingAttendanceSet,
  normalizeUlcRegistrationNote,
  UlcTrainingValidationError,
  type CreateUlcTrainingSessionInput,
  type UlcTrainingAttendance,
  type UlcTrainingModule,
  type UlcTrainingRegistration,
  type UlcTrainingRegistrationIntention,
  type UlcTrainingSession,
} from "./training-session-domain";
import {
  normalizeUlcYouthContentItems,
  type UlcYouthContentItem,
} from "./training-content-catalog";

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
  readonly trainingTrainerIds?: readonly string[];
  /** Only U12 currently consumes these app-owned youth documentation fields. */
  readonly trainingContentTitles?: readonly string[];
  readonly trainingContentItems?: readonly UlcYouthContentItem[];
  readonly trainingContentAssignments?: readonly Readonly<{
    athleteId: string;
    slots: readonly number[];
  }>[];
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

function readTrainingContentTitles(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze([]); // legacy test fixture
  if (!Array.isArray(value) || value.length > 5 ||
      !value.every((title) => typeof title === "string" &&
        title.length > 0 && title.length <= 120 &&
        title.trim() === title &&
        [...title].every((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && code !== 127;
        }))) {
    throw new UlcTrainingSessionPersistenceError("Invalid training content titles.");
  }
  return Object.freeze([...value]);
}

function readTrainingContentItems(
  value: unknown,
  titles: readonly string[],
): readonly UlcYouthContentItem[] {
  // Legacy session rows have titles but no categorization metadata.
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return Object.freeze([]);
  }
  try {
    return normalizeUlcYouthContentItems(titles, value as readonly UlcYouthContentItem[]);
  } catch {
    throw new UlcTrainingSessionPersistenceError("Invalid training content metadata.");
  }
}

function readTrainingContentSlots(value: unknown): readonly number[] {
  if (value === undefined) return Object.freeze([]); // legacy test fixture
  if (!Array.isArray(value) || value.length > 5 ||
      new Set(value).size !== value.length ||
      !value.every((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 5)) {
    throw new UlcTrainingSessionPersistenceError("Invalid attendee content slots.");
  }
  return Object.freeze([...value].sort((a, b) => a - b));
}

function normalizeTrainingContentTitles(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length > 5 ||
      !value.every((title) => typeof title === "string" &&
        title.length > 0 && title.length <= 120 &&
        title.trim() === title &&
        [...title].every((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && code !== 127;
        }))) {
    throw new UlcTrainingValidationError("Training content titles must be 1–120 characters, maximum five.");
  }
  return Object.freeze([...value]);
}

function normalizeTrainingContentSlots(
  slots: readonly number[] | undefined,
  contentCount: number,
): readonly number[] {
  if (!Array.isArray(slots) || slots.length > 5 ||
      new Set(slots).size !== slots.length ||
      !slots.every((slot) => Number.isInteger(slot) &&
        slot >= 1 && slot <= contentCount)) {
    throw new UlcTrainingValidationError("Invalid athlete training content assignment.");
  }
  return Object.freeze([...slots].sort((a, b) => a - b));
}

function normalizeTrainingTrainerIds(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(
    (id) => typeof id === "string" && id.length > 0 && id.length <= 200 &&
      id.trim() === id,
  ) || new Set(value).size !== value.length) {
    throw new UlcTrainingValidationError("Invalid training trainer roll-call.");
  }
  return Object.freeze([...value].sort((a, b) => a.localeCompare(b)));
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
              training_content_titles,
              training_content_items,
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
      `SELECT organization_id, session_id, athlete_id, status, training_content_slots
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
              updated_by_identity_id,
              note
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
      ...(["u12", "u14", "kindertraining"].includes(moduleId)
        ? {
            trainingContentTitles: readTrainingContentTitles(
              rows[0].training_content_titles,
            ),
            trainingContentItems: readTrainingContentItems(
              rows[0].training_content_items,
              readTrainingContentTitles(rows[0].training_content_titles),
            ),
            trainingContentAssignments: Object.freeze(attendanceRows.map((row) =>
              Object.freeze({
                athleteId: String(row.athlete_id),
                slots: readTrainingContentSlots(row.training_content_slots),
              }),
            )),
          }
        : {}),
    });
  }

  /**
   * Scoped trainer roll-call for the authorized youth training. Never expose
   * organization-wide trainer identities from this read path.
   */
  async readTrainerPresence(
    organizationId: string,
    moduleId: UlcTrainingModule,
    groupId: string,
    sessionId: string,
  ): Promise<readonly string[]> {
    const rows = await this.#sql.unsafe(
      `SELECT attendance.trainer_id
       FROM ulc_linz_training_trainer_attendance AS attendance
       INNER JOIN ulc_linz_training_session AS session
         ON session.id = attendance.session_id
        AND session.organization_id = attendance.organization_id
       WHERE attendance.organization_id = $1
         AND session.id = $2
         AND session.module_id = $3
         AND session.group_id = $4
       ORDER BY attendance.trainer_id ASC`,
      [organizationId, sessionId, moduleId, groupId],
    );
    return Object.freeze(rows.map((row) => requiredInputIdentifier(
      row.trainer_id, "Training trainer id",
    )));
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

  /**
   * G-04: ensure a rejected registration never leaves behind an orphan session.
   * The candidate v17 trigger checks deadlines under the same transaction.
   * Fail closed if PostgreSQL transactions are unavailable.
   */
  async withRegistrationTransaction<T>(
    callback: (sessions: Pick<PostgresUlcTrainingSessionRepository,
      "ensureScheduledSession" | "saveRegistration">) => Promise<T>,
  ): Promise<T> {
    const transactionalSql = this.#sql as UlcTrainingSessionSqlClient & {
      begin?: <R>(
        callback: (transaction: UlcTrainingSessionSqlClient) => Promise<R>,
      ) => Promise<R>;
    };
    if (typeof transactionalSql.begin !== "function") {
      throw new UlcTrainingSessionPersistenceError(
        "Atomic registration requires a PostgreSQL transaction.",
      );
    }
    return transactionalSql.begin(async (transaction) => {
      const scopedSessions = new PostgresUlcTrainingSessionRepository(
        transaction,
        this.#createId,
      );
      return callback(scopedSessions);
    });
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
      readonly contentSlots?: readonly number[];
    }[],
    expectedRevision: string | null,
    trainingContentTitles?: readonly string[],
    trainingContentItems?: readonly UlcYouthContentItem[],
    trainingTrainerIds?: readonly string[],
    eligibleTrainerIds?: readonly string[],
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
    const titles = trainingContentTitles === undefined
      ? null : normalizeTrainingContentTitles(trainingContentTitles);
    if (trainingContentItems !== undefined && titles === null) {
      throw new UlcTrainingValidationError("Training content metadata requires titles.");
    }
    const contentItems = trainingContentItems === undefined
      ? null : normalizeUlcYouthContentItems(titles ?? [], trainingContentItems);
    const slotsByAthlete = new Map<string, readonly number[]>();
    if (titles !== null) {
      for (const entry of attendanceInput) {
        const slots = normalizeTrainingContentSlots(entry.contentSlots, titles.length);
        if (entry.status !== "present" && slots.length !== 0) {
          throw new UlcTrainingValidationError(
            "Only present athletes can be assigned training contents.",
          );
        }
        slotsByAthlete.set(entry.athleteId, slots);
      }
    } else if (attendanceInput.some((entry) => entry.contentSlots !== undefined)) {
      throw new UlcTrainingValidationError(
        "Content assignments require the full training content list.",
      );
    }
    const payload = JSON.stringify(
      normalizedAttendance.map((entry) => ({
        athlete_id: entry.athleteId,
        status: entry.status,
        ...(titles === null ? {} :
          { content_slots: slotsByAthlete.get(entry.athleteId) ?? [] }),
      })),
    );
    const revision =
      expectedRevision === null ? null : requiredRevisionToken(expectedRevision);
    if ((trainingTrainerIds === undefined) !== (eligibleTrainerIds === undefined)) {
      throw new UlcTrainingValidationError("Trainer roster must be supplied completely.");
    }
    const trainerRoster = trainingTrainerIds === undefined
      ? null : normalizeTrainingTrainerIds(trainingTrainerIds);
    const eligibleRoster = eligibleTrainerIds === undefined
      ? null : normalizeTrainingTrainerIds(eligibleTrainerIds);
    if (trainerRoster && eligibleRoster &&
        trainerRoster.some((trainerId) => !eligibleRoster.includes(trainerId))) {
      throw new UlcTrainingValidationError("Trainer is not assigned to this training group.");
    }

    const rows = await this.#sql.unsafe(
      `WITH updated_session AS (
         UPDATE ulc_linz_training_session
         SET state = $6,
             note = $7,
             training_content_titles = CASE
               WHEN $10::jsonb IS NULL THEN training_content_titles
               ELSE ARRAY(SELECT jsonb_array_elements_text($10::jsonb))
             END,
             training_content_items = CASE
               WHEN $11::jsonb IS NOT NULL THEN $11::jsonb
               WHEN $10::jsonb IS NULL OR training_content_titles =
                 ARRAY(SELECT jsonb_array_elements_text($10::jsonb))
                 THEN training_content_items
               ELSE '[]'::jsonb
             END,
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
                   training_content_titles,
                   training_content_items,
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
           note,
           training_content_titles,
           training_content_items
         )
         SELECT $1, $2, $3, $4, $5::date, $6, $7,
                ARRAY(SELECT jsonb_array_elements_text($10::jsonb)),
                COALESCE($11::jsonb, '[]'::jsonb)
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
                   training_content_titles,
                   training_content_items,
                   xmin::text AS revision
       ),
       saved_session AS MATERIALIZED (
         SELECT * FROM updated_session
         UNION ALL
         SELECT * FROM inserted_session
       ),
       input_attendance AS MATERIALIZED (
         SELECT athlete_id, status, content_slots
         FROM jsonb_to_recordset($8::jsonb)
           AS entry(athlete_id text, status text, content_slots smallint[])
       ),
       saved_attendance AS (
         INSERT INTO ulc_linz_training_attendance (
           organization_id,
           session_id,
           athlete_id,
           status,
           training_content_slots
         )
         SELECT $2, session.id, input.athlete_id, input.status,
                CASE WHEN input.status = 'present'
                  THEN COALESCE(input.content_slots, ARRAY[]::smallint[])
                  ELSE ARRAY[]::smallint[] END
         FROM saved_session session
         CROSS JOIN input_attendance input
         ON CONFLICT (session_id, athlete_id)
         DO UPDATE SET
           organization_id = EXCLUDED.organization_id,
           status = EXCLUDED.status,
           training_content_slots = CASE
             WHEN EXCLUDED.status <> 'present' THEN ARRAY[]::smallint[]
             WHEN $10::jsonb IS NULL THEN ulc_linz_training_attendance.training_content_slots
             ELSE EXCLUDED.training_content_slots
           END,
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
       ),
       selected_trainers AS MATERIALIZED (
         SELECT trainer_id FROM jsonb_array_elements_text(
           COALESCE($12::jsonb, '[]'::jsonb)
         ) AS trainer(trainer_id)
       ),
       eligible_trainers AS MATERIALIZED (
         SELECT trainer_id FROM jsonb_array_elements_text(
           COALESCE($13::jsonb, '[]'::jsonb)
         ) AS trainer(trainer_id)
       ),
       saved_trainers AS (
         INSERT INTO ulc_linz_training_trainer_attendance (
           organization_id, session_id, trainer_id
         )
         SELECT $2, session.id, trainer.trainer_id
         FROM saved_session AS session
         CROSS JOIN selected_trainers AS trainer
         WHERE $12::jsonb IS NOT NULL
           AND trainer.trainer_id IN (SELECT trainer_id FROM eligible_trainers)
         ON CONFLICT (session_id, trainer_id)
         DO UPDATE SET updated_at = now()
         RETURNING trainer_id
       ),
       deleted_stale_trainers AS (
         DELETE FROM ulc_linz_training_trainer_attendance AS trainer
         USING saved_session AS session
         WHERE trainer.organization_id = $2
           AND trainer.session_id = session.id
           AND $12::jsonb IS NOT NULL
           AND trainer.trainer_id IN (SELECT trainer_id FROM eligible_trainers)
           AND trainer.trainer_id NOT IN (SELECT trainer_id FROM selected_trainers)
         RETURNING trainer.trainer_id
       )
       SELECT session.id,
              session.organization_id,
              session.module_id,
              session.group_id,
              session.session_date,
              session.state,
              session.note,
              session.training_content_titles,
              session.training_content_items,
              session.revision,
              (SELECT count(*)::int FROM saved_attendance)
                AS saved_attendance_count,
              (SELECT count(*)::int FROM deleted_stale_attendance)
                AS deleted_stale_attendance_count,
              (SELECT count(*)::int FROM saved_trainers)
                AS saved_trainer_count,
              (SELECT count(*)::int FROM deleted_stale_trainers)
                AS deleted_stale_trainer_count
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
        titles === null ? null : JSON.stringify(titles),
        contentItems === null ? null : JSON.stringify(contentItems),
        trainerRoster === null ? null : JSON.stringify(trainerRoster),
        eligibleRoster === null ? null : JSON.stringify(eligibleRoster),
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
    if (trainerRoster !== null) {
      if (nonNegativeInteger(rows[0], "saved_trainer_count") !== trainerRoster.length) {
        blocked();
      }
      nonNegativeInteger(rows[0], "deleted_stale_trainer_count");
    }

    const registrationRows = await this.#sql.unsafe(
      `SELECT organization_id,
              session_id,
              athlete_id,
              intention,
              revision,
              updated_by_identity_id,
              note
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
      ...(trainerRoster === null ? {} : { trainingTrainerIds: trainerRoster }),
      ...(titles === null ? {} : {
        trainingContentTitles: titles,
        trainingContentItems: readTrainingContentItems(rows[0].training_content_items, titles),
        trainingContentAssignments: Object.freeze(
          normalizedAttendance.map((entry) => Object.freeze({
            athleteId: entry.athleteId,
            slots: slotsByAthlete.get(entry.athleteId) ?? Object.freeze([]),
          })),
        ),
      }),
    });
  }

  async saveRegistration(
    organizationId: string,
    sessionId: string,
    athleteId: string,
    intention: UlcTrainingRegistrationIntention,
    expectedRevision: number | null,
    actorIdentityId: string,
    proxyActorAthleteId?: string,
    note?: string | null,
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
    // An absent note is a status-only update: preserve the existing note.
    // Explicit null or empty text removes it, with an auditable revision.
    const noteSupplied = note !== undefined;
    const normalizedNote = noteSupplied
      ? normalizeUlcRegistrationNote(note)
      : null;
    const proxyActor = proxyActorAthleteId === undefined
      ? null
      : requiredInputIdentifier(proxyActorAthleteId, "Proxy actor athlete id");

    const rows = await this.#sql.unsafe(
      `WITH scoped_session AS MATERIALIZED (
         SELECT session.id
         FROM ulc_linz_training_session AS session
         WHERE session.organization_id = $1
           AND session.id = $2
           AND session.state = 'scheduled'
           -- Self-registration keeps its established contract. The proxy path
           -- additionally re-checks both athlete memberships and the actor's
           -- canonical active identity inside the exact write statement.
           AND ($8::text IS NULL OR (
             $8::text <> $3
             AND EXISTS (
               SELECT 1
               FROM appbasis_training_group AS training_group
               INNER JOIN appbasis_athlete AS actor_athlete
                 ON actor_athlete.id = $8
                AND actor_athlete.organization_id = session.organization_id
                AND actor_athlete.is_active = true
               INNER JOIN appbasis_athlete AS target_athlete
                 ON target_athlete.id = $3
                AND target_athlete.organization_id = session.organization_id
                AND target_athlete.is_active = true
               INNER JOIN ulc_linz_membership AS actor_membership
                 ON actor_membership.identity_id = $6
                AND actor_membership.organization_id = session.organization_id
                AND actor_membership.subject_id = actor_athlete.id
                AND actor_membership.source_role = 'athlete'
                AND actor_membership.active = true
               WHERE training_group.id = session.group_id
                 AND training_group.organization_id = session.organization_id
                 AND training_group.is_active = true
                 AND training_group.attendance_mode = 'self_registration'
                 AND (
                   SELECT count(*)
                   FROM appbasis_athlete_group_membership AS actor_group
                   WHERE actor_group.organization_id = session.organization_id
                     AND actor_group.athlete_id = actor_athlete.id
                     AND actor_group.group_id = training_group.id
                     AND actor_group.started_on <= session.session_date
                     AND (actor_group.ended_on IS NULL OR
                          actor_group.ended_on >= session.session_date)
                 ) = 1
                 AND (
                   SELECT count(*)
                   FROM appbasis_athlete_group_membership AS target_group
                   WHERE target_group.organization_id = session.organization_id
                     AND target_group.athlete_id = target_athlete.id
                     AND target_group.group_id = training_group.id
                     AND target_group.started_on <= session.session_date
                     AND (target_group.ended_on IS NULL OR
                          target_group.ended_on >= session.session_date)
                 ) = 1
             )
           ))
       ),
       updated_registration AS (
         UPDATE ulc_linz_training_registration AS registration
         SET intention = $4,
             note = CASE WHEN $9::boolean THEN $10::text ELSE registration.note END,
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
                   updated_by_identity_id,
                   note
       ),
       inserted_registration AS (
         INSERT INTO ulc_linz_training_registration (
           organization_id,
           session_id,
           athlete_id,
           intention,
           revision,
           updated_by_identity_id,
           note
         )
         SELECT $1, session.id, $3, $4, 1, $6, $10::text
         FROM scoped_session AS session
         WHERE $5::int IS NULL
         ON CONFLICT (session_id, athlete_id) DO NOTHING
         RETURNING organization_id,
                   session_id,
                   athlete_id,
                   intention,
                   revision,
                   updated_by_identity_id,
                   note
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
           actor_identity_id,
           note
         )
         SELECT $7,
                organization_id,
                session_id,
                athlete_id,
                intention,
                revision,
                $6,
                note
         FROM saved_registration
         RETURNING id
       )
       SELECT registration.organization_id,
              registration.session_id,
              registration.athlete_id,
              registration.intention,
              registration.revision,
              registration.updated_by_identity_id,
              registration.note,
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
        proxyActor,
        noteSupplied,
        normalizedNote,
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
    // Compatibility with pre-v11 mocked rows; real DB reads always return note.
    ...("note" in row
      ? { note: normalizeUlcRegistrationNote(rowNullableString(row, "note")) }
      : {}),
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

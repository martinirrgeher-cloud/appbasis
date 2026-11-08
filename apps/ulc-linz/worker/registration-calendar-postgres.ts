import {
  normalizeUlcRegistrationSchedule,
  type UlcRegistrationSchedule,
} from "./registration-schedule-policy";

/**
 * G-04 calendar persistence contract. INACTIVE until the separately approved
 * v17 migration, protected HTTP access and atomic registration guards exist.
 * No actor identity, notes, phone numbers or other member PII is stored.
 * A missing rule means the existing unrestricted registration behavior.
 */
type SqlParameter = string | number | boolean | null;
export interface UlcRegistrationCalendarSqlClient {
  unsafe(query: string, params?: SqlParameter[]): PromiseLike<readonly Record<string, unknown>[]>;
}

export class UlcRegistrationCalendarConflictError extends Error {
  constructor() {
    super("Calendar entry is stale, unauthorized, or the group is not available.");
    this.name = "UlcRegistrationCalendarConflictError";
  }
}

export class UlcRegistrationCalendarDataError extends Error {
  constructor() {
    super("Stored training calendar entry is invalid.");
    this.name = "UlcRegistrationCalendarDataError";
  }
}

export interface UlcRegistrationRuleRecord {
  readonly schedule: UlcRegistrationSchedule;
  readonly revision: number;
}

export interface UlcRegistrationExceptionRecord {
  /** A stored 'none' represents a versioned reset, not a deleted revision. */
  readonly kind: "extra" | "cancelled" | null;
  readonly revision: number;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 ||
      value !== value.trim()) throw new UlcRegistrationCalendarDataError();
  return value;
}

function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UlcRegistrationCalendarDataError();
  }
  const parsed = new Date(value + "T12:00:00.000Z");
  if (!Number.isFinite(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    throw new UlcRegistrationCalendarDataError();
  }
  return value;
}

function expectedRevision(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new UlcRegistrationCalendarDataError();
  }
  return Number(value);
}

function strictRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new UlcRegistrationCalendarDataError();
  }
  return Number(value);
}

function maskFor(weekdays: readonly number[]): number {
  return weekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

function decodeRule(row: Record<string, unknown>): UlcRegistrationRuleRecord {
  const mask = row.weekdays_mask;
  if (typeof mask !== "number" || !Number.isInteger(mask) || mask < 1 || mask > 127 ||
      typeof row.weeks_ahead !== "number" ||
      (row.deadline_days_before !== null && typeof row.deadline_days_before !== "number") ||
      (row.deadline_local_time !== null && typeof row.deadline_local_time !== "string")) {
    throw new UlcRegistrationCalendarDataError();
  }
  const weekdays = Array.from({ length: 7 }, (_, index) => index + 1)
    .filter((day) => (mask & (1 << (day - 1))) !== 0);
  try {
    return Object.freeze({
      schedule: normalizeUlcRegistrationSchedule({
        weekdays,
        weeksAhead: row.weeks_ahead,
        deadline: row.deadline_days_before === null && row.deadline_local_time === null
          ? null : { daysBefore: row.deadline_days_before, localTime: row.deadline_local_time },
        lateMode: row.late_mode,
      }),
      revision: strictRevision(row.revision),
    });
  } catch {
    throw new UlcRegistrationCalendarDataError();
  }
}

function decodeException(row: Record<string, unknown>): UlcRegistrationExceptionRecord {
  if (!["extra", "cancelled", "none"].includes(String(row.kind))) {
    throw new UlcRegistrationCalendarDataError();
  }
  return Object.freeze({
    kind: row.kind === "none" ? null : row.kind as "extra" | "cancelled",
    revision: strictRevision(row.revision),
  });
}

export class PostgresUlcRegistrationCalendarRepository {
  constructor(private readonly sql: UlcRegistrationCalendarSqlClient) {}

  async readRule(organizationId: string, groupId: string):
    Promise<UlcRegistrationRuleRecord | null> {
    const rows = await this.sql.unsafe(
      `SELECT weekdays_mask, weeks_ahead, deadline_days_before,
              deadline_local_time, late_mode, revision
         FROM ulc_linz_registration_calendar_rule
        WHERE organization_id = $1 AND group_id = $2`,
      [identifier(organizationId), identifier(groupId)],
    );
    if (rows.length > 1) throw new UlcRegistrationCalendarDataError();
    return rows.length ? decodeRule(rows[0]!) : null;
  }

  async readException(organizationId: string, groupId: string, sessionDate: string):
    Promise<UlcRegistrationExceptionRecord | null> {
    const rows = await this.sql.unsafe(
      `SELECT kind, revision FROM ulc_linz_registration_calendar_exception
        WHERE organization_id = $1 AND group_id = $2 AND session_date = $3::date`,
      [identifier(organizationId), identifier(groupId), date(sessionDate)],
    );
    if (rows.length > 1) throw new UlcRegistrationCalendarDataError();
    return rows.length ? decodeException(rows[0]!) : null;
  }

  /**
   * Revision CAS. Only a trusted, already authorized server handler may call
   * this method. The SQL itself requires an active training group in
   * the same organization and locks it to serialize policy writers.
   * Initial creation requires expectedRevision=null; modification requires
   * the exact stored revision. No replacement on stale/missing revisions.
   */
  async writeRule(
    organizationId: string,
    groupId: string,
    revision: number | null,
    rawSchedule: unknown,
  ): Promise<UlcRegistrationRuleRecord> {
    const org = identifier(organizationId);
    const group = identifier(groupId);
    const expected = expectedRevision(revision);
    const schedule = normalizeUlcRegistrationSchedule(rawSchedule);
    const rows = await this.sql.unsafe(
      `WITH eligible AS MATERIALIZED (
         SELECT id FROM appbasis_training_group
          WHERE organization_id = $1 AND id = $2
            AND is_active = true
            AND attendance_mode IN ('self_registration', 'trainer_roll_call')
          FOR UPDATE
       ), written AS (
         INSERT INTO ulc_linz_registration_calendar_rule
           (organization_id, group_id, weekdays_mask, weeks_ahead,
            deadline_days_before, deadline_local_time, late_mode, revision, updated_at)
         SELECT $1, $2, $3::smallint, $4::smallint, $5::smallint,
                $6::text, $7::text, 1, now()
           FROM eligible
          WHERE $8::integer IS NULL OR EXISTS (
            SELECT 1 FROM ulc_linz_registration_calendar_rule
             WHERE organization_id = $1 AND group_id = $2
               AND revision = $8::integer
          )
         ON CONFLICT (organization_id, group_id) DO UPDATE SET
           weekdays_mask = EXCLUDED.weekdays_mask,
           weeks_ahead = EXCLUDED.weeks_ahead,
           deadline_days_before = EXCLUDED.deadline_days_before,
           deadline_local_time = EXCLUDED.deadline_local_time,
           late_mode = EXCLUDED.late_mode,
           revision = ulc_linz_registration_calendar_rule.revision + 1,
           updated_at = now()
         WHERE $8::integer IS NOT NULL
           AND ulc_linz_registration_calendar_rule.revision = $8::integer
         RETURNING weekdays_mask, weeks_ahead, deadline_days_before,
                   deadline_local_time, late_mode, revision
       ) SELECT * FROM written`,
      [
        org, group, maskFor(schedule.weekdays), schedule.weeksAhead,
        schedule.deadline?.daysBefore ?? null, schedule.deadline?.localTime ?? null,
        schedule.lateMode, expected,
      ],
    );
    if (rows.length !== 1) throw new UlcRegistrationCalendarConflictError();
    return decodeRule(rows[0]!);
  }

  /** A reset writes "none" with a new revision so stale clients cannot revive an override. */
  async writeException(
    organizationId: string,
    groupId: string,
    sessionDate: string,
    revision: number | null,
    kind: "extra" | "cancelled" | null,
  ): Promise<UlcRegistrationExceptionRecord> {
    const org = identifier(organizationId);
    const group = identifier(groupId);
    const day = date(sessionDate);
    const expected = expectedRevision(revision);
    if (kind !== null && kind !== "extra" && kind !== "cancelled") {
      throw new UlcRegistrationCalendarDataError();
    }
    const rows = await this.sql.unsafe(
      `WITH eligible AS MATERIALIZED (
         SELECT id FROM appbasis_training_group
          WHERE organization_id = $1 AND id = $2
            AND is_active = true
            AND attendance_mode IN ('self_registration', 'trainer_roll_call')
          FOR UPDATE
       ), written AS (
         INSERT INTO ulc_linz_registration_calendar_exception
           (organization_id, group_id, session_date, kind, revision, updated_at)
         SELECT $1, $2, $3::date, $4, 1, now()
           FROM eligible
          WHERE $5::integer IS NULL OR EXISTS (
            SELECT 1 FROM ulc_linz_registration_calendar_exception
             WHERE organization_id = $1 AND group_id = $2
               AND session_date = $3::date AND revision = $5::integer
          )
         ON CONFLICT (organization_id, group_id, session_date) DO UPDATE SET
           kind = EXCLUDED.kind,
           revision = ulc_linz_registration_calendar_exception.revision + 1,
           updated_at = now()
         WHERE $5::integer IS NOT NULL
           AND ulc_linz_registration_calendar_exception.revision = $5::integer
         RETURNING kind, revision
       ) SELECT * FROM written`,
      [org, group, day, kind ?? "none", expected],
    );
    if (rows.length !== 1) throw new UlcRegistrationCalendarConflictError();
    return decodeException(rows[0]!);
  }
}

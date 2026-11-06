import {
  normalizeUlcRegistrationSchedule,
  type UlcRegistrationSchedule,
} from "./registration-schedule-policy";

/**
 * App-owned policy persistence. Only trusted server callers may use the write
 * methods. Do not expose a route before the canonical athletes:edit check,
 * the trainer exception authority, and registration write-side DB guards exist.
 */
type SqlParameter = string | number | boolean | null;
export interface UlcRegistrationPolicySqlClient {
  unsafe(query: string, parameters?: SqlParameter[]):
    PromiseLike<readonly Record<string, unknown>[]>;
}

export class UlcRegistrationPolicyConflictError extends Error {
  constructor() {
    super("The training-group policy changed or is no longer editable.");
    this.name = "UlcRegistrationPolicyConflictError";
  }
}

export class UlcRegistrationPolicyDataError extends Error {
  constructor() {
    super("The stored training-group policy is inconsistent.");
    this.name = "UlcRegistrationPolicyDataError";
  }
}

export interface UlcRegistrationExtraDayRecord {
  readonly approved: boolean;
  readonly revision: number;
}
function validExtraDay(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + "T12:00:00Z")) ||
      new Date(value + "T12:00:00Z").toISOString().slice(0,10) !== value) {
    throw new UlcRegistrationPolicyDataError();
  }
  return value;
}
function decodeExtraDay(row: Record<string, unknown>): UlcRegistrationExtraDayRecord {
  if (typeof row.is_approved !== "boolean" ||
      typeof row.revision !== "number" ||
      !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new UlcRegistrationPolicyDataError();
  }
  return Object.freeze({ approved: row.is_approved, revision: row.revision });
}

export interface UlcRegistrationPolicyRecord {
  readonly schedule: UlcRegistrationSchedule;
  readonly revision: number;
}

function identifier(input: string, _label: string): string {
  if (typeof input !== "string" || input.length < 1 || input.length > 200 ||
      input.trim() !== input) {
    throw new UlcRegistrationPolicyDataError();
  }
  return input;
}

function revision(input: number | null): number | null {
  if (input === null) return null;
  if (!Number.isSafeInteger(input) || input < 1) {
    throw new UlcRegistrationPolicyDataError();
  }
  return input;
}

function maskFor(weekdays: readonly number[]): number {
  return weekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

function decodePolicy(row: Record<string, unknown>): UlcRegistrationPolicyRecord {
  const mask = row.weekdays_mask;
  const rev = row.revision;
  if (typeof mask !== "number" || !Number.isInteger(mask) ||
      mask < 1 || mask > 127 || typeof rev !== "number" || !Number.isSafeInteger(rev) || rev < 1 ||
      typeof row.weeks_ahead !== "number" ||
      typeof row.late_mode !== "string") {
    throw new UlcRegistrationPolicyDataError();
  }
  const days = Array.from({ length: 7 }, (_, index) => index + 1)
    .filter((day) => (mask & (1 << (day - 1))) !== 0);
  const deadline = row.deadline_days_before === null &&
    row.deadline_local_time === null
      ? null
      : { daysBefore: row.deadline_days_before, localTime: row.deadline_local_time };
  try {
    return Object.freeze({
      schedule: normalizeUlcRegistrationSchedule({
        weekdays: days,
        weeksAhead: row.weeks_ahead,
        deadline,
        lateMode: row.late_mode,
      }),
      revision: Number(rev),
    });
  } catch {
    throw new UlcRegistrationPolicyDataError();
  }
}

export class PostgresUlcRegistrationPolicyRepository {
  constructor(private readonly sql: UlcRegistrationPolicySqlClient) {}

  /** A missing row is a deliberate legacy/no-restrictions policy. */
  async read(organizationId: string, groupId: string):
    Promise<UlcRegistrationPolicyRecord | null> {
    const org = identifier(organizationId, "Organization");
    const group = identifier(groupId, "Group");
    const rows = await this.sql.unsafe(
      `SELECT weekdays_mask, weeks_ahead, deadline_days_before,
              deadline_local_time, late_mode, revision
       FROM ulc_linz_registration_group_policy
       WHERE organization_id = $1 AND group_id = $2`,
      [org, group],
    );
    if (rows.length > 1) throw new UlcRegistrationPolicyDataError();
    return rows.length === 0 ? null : decodePolicy(rows[0]!);
  }

  /**
   * CAS update. The HTTP/controller layer must authenticate and authorize
   * athletes:edit before passing a server-derived actorIdentityId.
   * The DB scope additionally requires an active self-registration group.
   */
  async save(
    organizationId: string,
    groupId: string,
    actorIdentityId: string,
    expectedRevision: number | null,
    rawSchedule: unknown,
  ): Promise<UlcRegistrationPolicyRecord> {
    const org = identifier(organizationId, "Organization");
    const group = identifier(groupId, "Group");
    const actor = identifier(actorIdentityId, "Actor");
    const expected = revision(expectedRevision);
    const schedule = normalizeUlcRegistrationSchedule(rawSchedule);
    const rows = await this.sql.unsafe(
      `WITH eligible_group AS MATERIALIZED (
         SELECT id FROM appbasis_training_group
         WHERE id = $2 AND organization_id = $1
           AND is_active = true AND attendance_mode = 'self_registration'
         FOR UPDATE
       ),
       written AS (
         INSERT INTO ulc_linz_registration_group_policy (
           organization_id, group_id, weekdays_mask, weeks_ahead,
           deadline_days_before, deadline_local_time, late_mode,
           revision, updated_by_identity_id, updated_at
         )
         SELECT $1, $2, $3::int, $4::int, $5::int, $6::text, $7, 1, $8, now()
         FROM eligible_group
         ON CONFLICT (organization_id, group_id)
         DO UPDATE SET
           weekdays_mask = EXCLUDED.weekdays_mask,
           weeks_ahead = EXCLUDED.weeks_ahead,
           deadline_days_before = EXCLUDED.deadline_days_before,
           deadline_local_time = EXCLUDED.deadline_local_time,
           late_mode = EXCLUDED.late_mode,
           revision = ulc_linz_registration_group_policy.revision + 1,
           updated_by_identity_id = EXCLUDED.updated_by_identity_id,
           updated_at = now()
         WHERE $9::int IS NOT NULL
           AND ulc_linz_registration_group_policy.revision = $9::int
         RETURNING weekdays_mask, weeks_ahead, deadline_days_before,
                   deadline_local_time, late_mode, revision
       )
       SELECT * FROM written`,
      [
        org, group, maskFor(schedule.weekdays), schedule.weeksAhead,
        schedule.deadline?.daysBefore ?? null,
        schedule.deadline?.localTime ?? null,
        schedule.lateMode, actor, expected,
      ],
    );
    if (rows.length === 0) throw new UlcRegistrationPolicyConflictError();
    if (rows.length !== 1) throw new UlcRegistrationPolicyDataError();
    return decodePolicy(rows[0]!);
  }


  async readExtraDay(organizationId: string, groupId: string, sessionDate: string):
    Promise<UlcRegistrationExtraDayRecord | null> {
    const rows = await this.sql.unsafe(
      `SELECT is_approved, revision FROM ulc_linz_registration_extra_day
       WHERE organization_id = $1 AND group_id = $2 AND session_date = $3::date`,
      [identifier(organizationId, "Organization"), identifier(groupId, "Group"),
       validExtraDay(sessionDate)],
    );
    if (rows.length > 1) throw new UlcRegistrationPolicyDataError();
    return rows.length === 0 ? null : decodeExtraDay(rows[0]!);
  }

  /**
   * Server-actor-only CAS. Approval and revocation each append one immutable
   * actor/revision event, atomically with the visible state change.
   */
  async setExtraDay(
    organizationId: string, groupId: string, sessionDate: string,
    actorIdentityId: string, approved: boolean, expectedRevision: number | null,
    trainerScopeId: string | null = null,
  ): Promise<UlcRegistrationExtraDayRecord> {
    const org = identifier(organizationId, "Organization");
    const group = identifier(groupId, "Group");
    const date = validExtraDay(sessionDate);
    const actor = identifier(actorIdentityId, "Actor");
    const expected = revision(expectedRevision);
    const trainerScope = trainerScopeId === null
      ? null : identifier(trainerScopeId, "Trainer");
    if (typeof approved !== "boolean") throw new UlcRegistrationPolicyDataError();
    const rows = await this.sql.unsafe(
      `WITH eligible_group AS MATERIALIZED (
         SELECT training_group.id
         FROM appbasis_training_group AS training_group
         INNER JOIN ulc_linz_registration_group_policy AS policy
           ON policy.organization_id = training_group.organization_id
          AND policy.group_id = training_group.id
         WHERE training_group.organization_id = $1 AND training_group.id = $2
           AND training_group.is_active = true
           AND training_group.attendance_mode = 'self_registration'
           -- Trainers are rechecked inside the write statement to prevent
           -- a membership reassignment from bypassing group-scoped access.
           AND ($7::text IS NULL OR EXISTS (
             SELECT 1
             FROM ulc_linz_membership AS membership
             INNER JOIN appbasis_trainer AS trainer
               ON trainer.id = membership.subject_id
              AND trainer.organization_id = membership.organization_id
              AND trainer.is_active = true
             INNER JOIN appbasis_trainer_group_membership AS assignment
               ON assignment.organization_id = trainer.organization_id
              AND assignment.trainer_id = trainer.id
             WHERE membership.identity_id = $4
               AND membership.organization_id = $1
               AND membership.source_role = 'trainer'
               AND membership.active = true
               AND membership.ended_at IS NULL
               AND membership.subject_id = $7::text
               AND assignment.group_id = $2
             FOR SHARE OF membership, trainer, assignment
           ))
           AND ($5::boolean OR EXISTS (
             SELECT 1 FROM ulc_linz_registration_extra_day AS existing
             WHERE existing.organization_id = $1 AND existing.group_id = $2
               AND existing.session_date = $3::date
               AND existing.is_approved = true AND existing.revision = $6::int
           ))
           AND (NOT $5::boolean OR (
             $3::date >= (clock_timestamp() AT TIME ZONE 'Europe/Vienna')::date
             AND date_trunc('week', $3::date::timestamp) <=
               date_trunc('week', (clock_timestamp() AT TIME ZONE 'Europe/Vienna')::timestamp)
               + make_interval(weeks => policy.weeks_ahead)
             AND (policy.weekdays_mask &
               (1 << (EXTRACT(ISODOW FROM $3::date)::int - 1))) = 0
           ))
         FOR UPDATE OF training_group
       ),
       written AS (
         INSERT INTO ulc_linz_registration_extra_day (
           organization_id, group_id, session_date,
           approved_by_identity_id, approved_at, is_approved, revision,
           updated_by_identity_id, updated_at
         )
         SELECT $1, $2, $3::date, $4, now(), $5::boolean, 1, $4, now()
         FROM eligible_group
         ON CONFLICT (organization_id, group_id, session_date)
         DO UPDATE SET is_approved = EXCLUDED.is_approved,
                       updated_by_identity_id = EXCLUDED.updated_by_identity_id,
                       updated_at = now(),
                       revision = ulc_linz_registration_extra_day.revision + 1
         WHERE $6::int IS NOT NULL
           AND ulc_linz_registration_extra_day.revision = $6::int
           AND ulc_linz_registration_extra_day.is_approved <> $5::boolean
         RETURNING organization_id, group_id, session_date,
                   is_approved, revision, updated_by_identity_id
       ),
       audit AS (
         INSERT INTO ulc_linz_registration_extra_day_change (
           organization_id, group_id, session_date, revision,
           is_approved, actor_identity_id
         )
         SELECT organization_id, group_id, session_date, revision,
                is_approved, updated_by_identity_id FROM written
         RETURNING revision
       )
       SELECT written.is_approved, written.revision,
              (SELECT count(*)::int FROM audit) AS audit_count
       FROM written`,
      [org, group, date, actor, approved, expected, trainerScope],
    );
    if (rows.length === 0) throw new UlcRegistrationPolicyConflictError();
    if (rows.length !== 1 || rows[0]?.audit_count !== 1) {
      throw new UlcRegistrationPolicyDataError();
    }
    return decodeExtraDay(rows[0]!);
  }

  /** Explicit approval only; an existing session or registration is not proof. */
  async isApprovedExtraDay(
    organizationId: string, groupId: string, sessionDate: string,
  ): Promise<boolean> {
    const org = identifier(organizationId, "Organization");
    const group = identifier(groupId, "Group");
    if (typeof sessionDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ||
        Number.isNaN(Date.parse(sessionDate + "T12:00:00Z")) ||
        new Date(sessionDate + "T12:00:00Z").toISOString().slice(0, 10) !== sessionDate) {
      throw new UlcRegistrationPolicyDataError();
    }
    const rows = await this.sql.unsafe(
      `SELECT 1 AS approved
       FROM ulc_linz_registration_extra_day
       WHERE organization_id = $1 AND group_id = $2 AND session_date = $3::date
         AND is_approved = true`,
      [org, group, sessionDate],
    );
    if (rows.length > 1) throw new UlcRegistrationPolicyDataError();
    return rows.length === 1 && rows[0]?.approved === 1;
  }
}

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

export interface UlcRegistrationPolicyRecord {
  readonly schedule: UlcRegistrationSchedule;
  readonly revision: number;
}

function identifier(input: string, label: string): string {
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
      mask < 1 || mask > 127 || !Number.isSafeInteger(rev) || Number(rev) < 1 ||
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
         FOR SHARE
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

  /** Explicit approval only; an existing session or registration is not proof. */
  async isApprovedExtraDay(
    organizationId: string, groupId: string, sessionDate: string,
  ): Promise<boolean> {
    const org = identifier(organizationId, "Organization");
    const group = identifier(groupId, "Group");
    if (typeof sessionDate !== "string" ||
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(sessionDate) ||
        Number.isNaN(Date.parse(sessionDate + "T12:00:00Z")) ||
        new Date(sessionDate + "T12:00:00Z").toISOString().slice(0, 10) !== sessionDate) {
      throw new UlcRegistrationPolicyDataError();
    }
    const rows = await this.sql.unsafe(
      `SELECT 1 AS approved
       FROM ulc_linz_registration_extra_day
       WHERE organization_id = $1 AND group_id = $2 AND session_date = $3::date`,
      [org, group, sessionDate],
    );
    if (rows.length > 1) throw new UlcRegistrationPolicyDataError();
    return rows.length === 1 && rows[0]?.approved === 1;
  }
}

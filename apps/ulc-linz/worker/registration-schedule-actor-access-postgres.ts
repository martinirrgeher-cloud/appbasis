import type { UlcRegistrationPolicySqlClient } from "./registration-policy-postgres";

/**
 * Unpublished A02.4 subject-access candidate. The existing M5-E export
 * intentionally excludes audit/configuration tables and is NOT modified.
 * This narrow reader has no route and no authorization decisions. Call only
 * from the authenticated, audited application coordinator.
 */
export class UlcRegistrationScheduleAccessDataBlockedError extends Error {
  constructor() {
    super("Registration-schedule subject access data is unavailable.");
    this.name = "UlcRegistrationScheduleAccessDataBlockedError";
  }
}

export type UlcRegistrationScheduleActorReferenceKind =
  | "group-policy-updated"
  | "extra-day-approved"
  | "extra-day-updated"
  | "extra-day-change";

export interface UlcRegistrationScheduleActorAccessRow {
  readonly referenceKind: UlcRegistrationScheduleActorReferenceKind;
  readonly groupId: string;
  readonly sessionDate: string | null;
  readonly revision: number;
  readonly approved: boolean | null;
  readonly occurredAt: string;
}

export const ULC_REGISTRATION_ACTOR_ACCESS_MAX_ROWS = 500;

function blocked(): never {
  throw new UlcRegistrationScheduleAccessDataBlockedError();
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value !== value.trim()) blocked();
  return value;
}

function requiredInstant(value: unknown): string {
  const date = value instanceof Date ? value : (
    typeof value === "string" ? new Date(value) : null
  );
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) blocked();
  return date.toISOString();
}

function decode(row: Record<string, unknown>): UlcRegistrationScheduleActorAccessRow {
  const kind = row.reference_kind;
  if (kind !== "group-policy-updated" &&
      kind !== "extra-day-approved" &&
      kind !== "extra-day-updated" &&
      kind !== "extra-day-change") blocked();
  const date = row.session_date;
  if (date !== null && (typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date)) {
    blocked();
  }
  if (typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) ||
      row.revision < 1) blocked();
  const approved = row.approved;
  if (kind === "group-policy-updated" ? approved !== null :
      typeof approved !== "boolean") blocked();
  if (kind === "group-policy-updated" ? date !== null : date === null) blocked();
  return Object.freeze({
    referenceKind: kind,
    groupId: identifier(row.group_id),
    sessionDate: date,
    revision: row.revision,
    approved,
    occurredAt: requiredInstant(row.occurred_at),
  });
}

export class PostgresUlcRegistrationScheduleActorAccessReader {
  constructor(private readonly sql: UlcRegistrationPolicySqlClient) {}

  async readActorReferences(
    organizationId: string,
    actorIdentityId: string,
  ): Promise<readonly UlcRegistrationScheduleActorAccessRow[]> {
    const org = identifier(organizationId);
    const actor = identifier(actorIdentityId);
    // One PostgreSQL statement/snapshot: no mixed-time read across tables,
    // no cross-organization lookup and no raw identity IDs in result rows.
    // Each of the four actor-reference columns becomes a separate record.
    const rows = await this.sql.unsafe(
      `SELECT reference_kind, group_id, session_date, revision, approved, occurred_at
       FROM (
         SELECT 'group-policy-updated'::text AS reference_kind,
           group_id, NULL::text AS session_date, revision,
           NULL::boolean AS approved, updated_at AS occurred_at
         FROM ulc_linz_registration_group_policy
         WHERE organization_id = $1 AND updated_by_identity_id = $2
         UNION ALL
         SELECT 'extra-day-approved'::text, group_id,
           session_date::text, revision, is_approved, approved_at
         FROM ulc_linz_registration_extra_day
         WHERE organization_id = $1 AND approved_by_identity_id = $2
         UNION ALL
         SELECT 'extra-day-updated'::text, group_id,
           session_date::text, revision, is_approved, updated_at
         FROM ulc_linz_registration_extra_day
         WHERE organization_id = $1 AND updated_by_identity_id = $2
         UNION ALL
         SELECT 'extra-day-change'::text, group_id,
           session_date::text, revision, is_approved, changed_at
         FROM ulc_linz_registration_extra_day_change
         WHERE organization_id = $1 AND actor_identity_id = $2
       ) AS references
       ORDER BY occurred_at ASC, reference_kind ASC, group_id ASC,
                session_date ASC NULLS FIRST, revision ASC
       LIMIT 501`,
      [org, actor],
    );
    if (rows.length > ULC_REGISTRATION_ACTOR_ACCESS_MAX_ROWS) blocked();
    return Object.freeze(rows.map(decode));
  }
}

import type { UlcRegistrationPolicySqlClient } from "./registration-policy-postgres";

/**
 * Privileged, NOT runtime-injected A02.4 privacy exception.
 *
 * Only a verified, completed, still-valid ULC member deletion marker authorizes
 * erasure of that identity's four actor references. The entire action is one
 * PostgreSQL statement, so no partial actor erasure can be committed. Original
 * revision, event type, approval decision and timestamps are preserved.
 *
 * This deliberately does not invent a retention duration, activate a cleanup
 * scheduler, grant HTTP access or claim that the canonical identity lifecycle
 * invokes this repository. Those remain separate release gates.
 */
export class UlcRegistrationScheduleActorErasureBlockedError extends Error {
  constructor() {
    super("Registration schedule actor erasure is not authorized.");
    this.name = "UlcRegistrationScheduleActorErasureBlockedError";
  }
}

export interface UlcRegistrationScheduleActorErasureResult {
  readonly groupPolicies: number;
  readonly extraDays: number;
  readonly auditEvents: number;
  readonly totalRows: number;
}

function requiredIdentifier(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 ||
      value.trim() !== value) {
    throw new UlcRegistrationScheduleActorErasureBlockedError();
  }
  return value;
}

function nonNegativeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new UlcRegistrationScheduleActorErasureBlockedError();
  }
  return value;
}

export class PostgresUlcRegistrationScheduleActorErasure {
  constructor(private readonly sql: UlcRegistrationPolicySqlClient) {}

  /**
   * Offline app-owned operation: callers must separately prove privileged
   * lifecycle authorization and capture a suitable retention/restore gate.
   * A completed marker and absence of ANY live membership are independently
   * enforced in the same SQL statement, not trusted from caller claims.
   */
  async redactAfterCompletedIdentityDeletion(input: {
    organizationId: string;
    identityId: string;
    now: Date;
  }): Promise<UlcRegistrationScheduleActorErasureResult> {
    const organizationId = requiredIdentifier(input.organizationId);
    const identityId = requiredIdentifier(input.identityId);
    if (!(input.now instanceof Date) ||
        !Number.isFinite(input.now.getTime())) {
      throw new UlcRegistrationScheduleActorErasureBlockedError();
    }

    const rows = await this.sql.unsafe(
      `WITH completed AS MATERIALIZED (
         SELECT marker.organization_id, marker.identity_id
         FROM ulc_linz_lifecycle_deletion AS marker
         WHERE marker.organization_id = $1
           AND marker.identity_id = $2
           AND marker.completed_at <= $3::timestamptz
           AND marker.purge_after >= $3::timestamptz
           AND NOT EXISTS (
             SELECT 1 FROM ulc_linz_membership AS membership
             WHERE membership.identity_id = marker.identity_id
           )
         FOR SHARE OF marker
       ),
       erased_policy AS (
         UPDATE ulc_linz_registration_group_policy AS policy
         SET updated_by_identity_id = NULL
         FROM completed AS marker
         WHERE policy.organization_id = marker.organization_id
           AND policy.updated_by_identity_id = marker.identity_id
         RETURNING 1
       ),
       erased_extra AS (
         UPDATE ulc_linz_registration_extra_day AS extra
         SET approved_by_identity_id =
               CASE WHEN extra.approved_by_identity_id = marker.identity_id
                 THEN NULL ELSE extra.approved_by_identity_id END,
             updated_by_identity_id =
               CASE WHEN extra.updated_by_identity_id = marker.identity_id
                 THEN NULL ELSE extra.updated_by_identity_id END
         FROM completed AS marker
         WHERE extra.organization_id = marker.organization_id
           AND (
             extra.approved_by_identity_id = marker.identity_id OR
             extra.updated_by_identity_id = marker.identity_id
           )
         RETURNING 1
       ),
       erased_history AS (
         UPDATE ulc_linz_registration_extra_day_change AS history
         SET actor_identity_id = NULL
         FROM completed AS marker
         WHERE history.organization_id = marker.organization_id
           AND history.actor_identity_id = marker.identity_id
         RETURNING 1
       )
       SELECT
         (SELECT count(*)::int FROM completed) AS marker_count,
         (SELECT count(*)::int FROM erased_policy) AS policy_count,
         (SELECT count(*)::int FROM erased_extra) AS extra_count,
         (SELECT count(*)::int FROM erased_history) AS history_count`,
      [organizationId, identityId, input.now.toISOString()],
    );
    if (rows.length !== 1 || nonNegativeCount(rows[0]?.marker_count) !== 1) {
      throw new UlcRegistrationScheduleActorErasureBlockedError();
    }
    const groupPolicies = nonNegativeCount(rows[0]?.policy_count);
    const extraDays = nonNegativeCount(rows[0]?.extra_count);
    const auditEvents = nonNegativeCount(rows[0]?.history_count);
    const totalRows = groupPolicies + extraDays + auditEvents;
    if (!Number.isSafeInteger(totalRows)) {
      throw new UlcRegistrationScheduleActorErasureBlockedError();
    }
    return Object.freeze({ groupPolicies, extraDays, auditEvents, totalRows });
  }
}

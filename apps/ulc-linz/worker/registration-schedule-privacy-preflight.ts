import type { UlcRegistrationPolicySqlClient } from "./registration-policy-postgres";

/**
 * Read-only A02.4 subject-lifecycle preflight. It never returns names,
 * identity IDs or row data, only aggregate counts of still-identifiable
 * actor references in the not-yet-published scheduling tables.
 *
 * This is intentionally NOT a deletion, erasure, retention scheduler,
 * data-export route or runtime permission grant. A privileged, authorized
 * offline caller must supply the exact organization and identity.
 */
export class UlcRegistrationSchedulePrivacyPreflightBlockedError extends Error {
  constructor() {
    super("Registration schedule privacy preflight blocked.");
    this.name = "UlcRegistrationSchedulePrivacyPreflightBlockedError";
  }
}

export interface UlcRegistrationScheduleActorReferenceCounts {
  readonly policyUpdatedBy: number;
  readonly exceptionApprovedBy: number;
  readonly exceptionUpdatedBy: number;
  readonly changeActor: number;
  readonly total: number;
  readonly hasOutstandingReferences: boolean;
}

function identifier(value: string): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value.trim() !== value) {
    throw new UlcRegistrationSchedulePrivacyPreflightBlockedError();
  }
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < 0) {
    throw new UlcRegistrationSchedulePrivacyPreflightBlockedError();
  }
  return value;
}

export class PostgresUlcRegistrationSchedulePrivacyPreflight {
  constructor(private readonly sql: UlcRegistrationPolicySqlClient) {}

  async inspectCompletedDeletedActor(input: {
    organizationId: string;
    identityId: string;
    now: Date;
  }): Promise<UlcRegistrationScheduleActorReferenceCounts> {
    const org = identifier(input.organizationId);
    const identity = identifier(input.identityId);
    const now = input.now;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new UlcRegistrationSchedulePrivacyPreflightBlockedError();
    }

    // The 35-day completed-deletion marker is the canonical proof of which
    // organization owned the identity. Never infer ownership from residual
    // audit values: if the marker is absent or expired, fail closed.
    const rows = await this.sql.unsafe(
      `SELECT
         (SELECT count(*)::int FROM ulc_linz_lifecycle_deletion AS marker
           WHERE marker.organization_id = $1 AND marker.identity_id = $2
             AND marker.completed_at <= $3::timestamptz
             AND marker.purge_after >= $3::timestamptz) AS marker_count,
         (SELECT count(*)::int FROM ulc_linz_registration_group_policy AS policy
           WHERE policy.organization_id = $1
             AND policy.updated_by_identity_id = $2) AS policy_updated_by,
         (SELECT count(*)::int FROM ulc_linz_registration_extra_day AS extra
           WHERE extra.organization_id = $1
             AND extra.approved_by_identity_id = $2) AS exception_approved_by,
         (SELECT count(*)::int FROM ulc_linz_registration_extra_day AS extra
           WHERE extra.organization_id = $1
             AND extra.updated_by_identity_id = $2) AS exception_updated_by,
         (SELECT count(*)::int FROM ulc_linz_registration_extra_day_change AS change
           WHERE change.organization_id = $1
             AND change.actor_identity_id = $2) AS change_actor`,
      [org, identity, now.toISOString()],
    );
    if (rows.length !== 1 || count(rows[0]?.marker_count) !== 1) {
      throw new UlcRegistrationSchedulePrivacyPreflightBlockedError();
    }
    const policyUpdatedBy = count(rows[0]?.policy_updated_by);
    const exceptionApprovedBy = count(rows[0]?.exception_approved_by);
    const exceptionUpdatedBy = count(rows[0]?.exception_updated_by);
    const changeActor = count(rows[0]?.change_actor);
    const total = policyUpdatedBy + exceptionApprovedBy +
      exceptionUpdatedBy + changeActor;
    if (!Number.isSafeInteger(total)) {
      throw new UlcRegistrationSchedulePrivacyPreflightBlockedError();
    }
    return Object.freeze({
      policyUpdatedBy,
      exceptionApprovedBy,
      exceptionUpdatedBy,
      changeActor,
      total,
      hasOutstandingReferences: total > 0,
    });
  }
}

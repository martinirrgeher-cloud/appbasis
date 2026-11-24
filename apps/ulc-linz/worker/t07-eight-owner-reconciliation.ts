import {
  ULC_P3_PERSISTENT_OWNERS,
  type UlcP3OwnerId,
} from "./p3-cross-owner-restore-admission";

/**
 * Physical read-only reconciliation across all eight ULC persistent owners.
 *
 * Counts are scoped by the real source subject and, where possible, the
 * independently persisted identity-deletion link. The SQL NEVER guesses a
 * historical identity from the subject string or from free text.
 *
 * An absent identity link is UNKNOWN rather than zero. This is not an
 * eight-owner erasure executor, an audit-retention exception, or permission
 * to restore a historical snapshot.
 */
export const ULC_T07_EIGHT_OWNER_SQL = `
WITH linked_identity AS (
  SELECT DISTINCT identity_id
  FROM ulc_linz_lifecycle_deletion
  WHERE organization_id = $1 AND subject_id = $2
    AND source_role = 'athlete' AND purge_after > now()
)
SELECT
  (SELECT count(*)::int FROM linked_identity) AS linked_identities,
  (
    (SELECT count(*) FROM "user" WHERE id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM account WHERE user_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM session WHERE user_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM appbasis_identity_security_state
      WHERE identity_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM appbasis_person
      WHERE id IN (
        SELECT person_id FROM appbasis_identity_security_state
        WHERE identity_id IN (SELECT identity_id FROM linked_identity)
      )) +
    (SELECT count(*) FROM ulc_linz_membership WHERE organization_id=$1 AND subject_id=$2)
  )::int AS identity_remaining,
  (
    (SELECT count(*) FROM appbasis_permission_principal WHERE
      principal_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM appbasis_permission_principal_role WHERE
      principal_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM appbasis_permission_principal_grant WHERE
      principal_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM appbasis_permission_principal_revoke WHERE
      principal_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM ulc_linz_subject_scope WHERE organization_id=$1 AND subject_id=$2)
  )::int AS permissions_remaining,
  (
    (SELECT count(*) FROM appbasis_athlete WHERE organization_id=$1 AND id=$2) +
    (SELECT count(*) FROM appbasis_athlete_contact WHERE organization_id=$1 AND athlete_id=$2) +
    (SELECT count(*) FROM appbasis_athlete_group_membership WHERE organization_id=$1 AND athlete_id=$2)
  )::int AS athletes_remaining,
  (
    (SELECT count(*) FROM appbasis_exercise_catalog_favorite WHERE organization_id=$1 AND
      principal_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM appbasis_exercise_catalog_usage_subject WHERE organization_id=$1 AND
      principal_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM ulc_linz_exercise_favorite WHERE organization_id=$1 AND
      identity_id IN (SELECT identity_id FROM linked_identity))
  )::int AS catalog_remaining,
  (SELECT count(*)::int FROM appbasis_exercise_catalog_favorite_deletion WHERE
    organization_id=$1 AND principal_id IN (SELECT identity_id FROM linked_identity)
    AND purge_after > now()) AS catalog_markers,
  (
    (SELECT count(*) FROM appbasis_training_block_usage_subject WHERE organization_id=$1
      AND subject_id=$2) +
    (SELECT count(*) FROM appbasis_training_block_favorite WHERE organization_id=$1 AND
      principal_id IN (SELECT identity_id FROM linked_identity))
  )::int AS blocks_remaining,
  (SELECT count(*)::int FROM appbasis_training_block_usage_subject_deletion WHERE
    organization_id=$1 AND subject_id=$2 AND completed_at=$3::timestamptz
    AND purge_after > now()) AS block_markers,
  (
    (SELECT count(*) FROM appbasis_training_documentation WHERE
      organization_id=$1 AND subject_id=$2) +
    (SELECT count(*) FROM appbasis_training_documentation_revision AS rev
      JOIN appbasis_training_documentation AS doc
        ON doc.organization_id=rev.organization_id AND doc.id=rev.documentation_id
      WHERE rev.organization_id=$1 AND
        rev.attendance_json @> jsonb_build_array(jsonb_build_object('participantId',$2::text)))
  )::int AS documents_remaining,
  (SELECT count(*)::int FROM appbasis_training_documentation_subject_deletion WHERE
    organization_id=$1 AND subject_id=$2 AND completed_at=$3::timestamptz
    AND purge_after > now()) AS document_markers,
  (SELECT count(*)::int FROM appbasis_training_plan WHERE
    organization_id=$1 AND subject_id=$2) AS plans_remaining,
  (SELECT count(*)::int FROM appbasis_training_plan_subject_deletion WHERE
    organization_id=$1 AND subject_id=$2 AND completed_at=$3::timestamptz
    AND purge_after > now()) AS plan_markers,
  (
    (SELECT count(*) FROM ulc_linz_training_attendance WHERE organization_id=$1 AND athlete_id=$2) +
    (SELECT count(*) FROM ulc_linz_training_registration WHERE organization_id=$1 AND athlete_id=$2) +
    (SELECT count(*) FROM ulc_linz_training_registration_change WHERE organization_id=$1 AND athlete_id=$2) +
    (SELECT count(*) FROM ulc_linz_training_trainer_attendance WHERE organization_id=$1 AND trainer_id=$2) +
    (SELECT count(*) FROM ulc_linz_trainer_identity_audit WHERE organization_id=$1
      AND (previous_subject_id=$2 OR new_subject_id=$2))
  )::int AS ulc_remaining,
  (SELECT count(*)::int FROM ulc_linz_training_subject_deletion WHERE
    organization_id=$1 AND athlete_id=$2 AND completed_at=$3::timestamptz
    AND purge_after > now()) AS ulc_markers,
  (
    (SELECT count(*) FROM ulc_linz_training_registration WHERE organization_id=$1
      AND updated_by_identity_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM ulc_linz_training_registration_change WHERE organization_id=$1
      AND actor_identity_id IN (SELECT identity_id FROM linked_identity)) +
    (SELECT count(*) FROM ulc_linz_lifecycle_audit WHERE organization_id=$1
      AND (target_identity_id IN (SELECT identity_id FROM linked_identity)
        OR actor_principal_id IN (SELECT identity_id FROM linked_identity))) +
    (SELECT count(*) FROM ulc_linz_trainer_identity_audit WHERE organization_id=$1
      AND (actor_principal_id IN (SELECT identity_id FROM linked_identity) OR
        target_identity_id IN (SELECT identity_id FROM linked_identity))) +
    (SELECT count(*) FROM ulc_linz_security_event_log WHERE organization_id=$1
      AND (target_id=$2 OR actor_principal_id IN (SELECT identity_id FROM linked_identity)))
  )::int AS actor_audit_remaining,
  (SELECT count(*)::int FROM appbasis_exercise_catalog_private_media
    WHERE organization_id=$1) AS org_media_candidates
`;

const COLUMNS = Object.freeze({
  identity: { count: "identity_remaining", marker: null },
  permissions: { count: "permissions_remaining", marker: null },
  athletes: { count: "athletes_remaining", marker: null },
  "exercise-catalog": { count: "catalog_remaining", marker: "catalog_markers" },
  "training-blocks": { count: "blocks_remaining", marker: "block_markers" },
  "training-documentation": { count: "documents_remaining", marker: "document_markers" },
  "training-plans": { count: "plans_remaining", marker: "plan_markers" },
  "ulc-linz-lifecycle": { count: "ulc_remaining", marker: "ulc_markers" },
} as const satisfies Record<UlcP3OwnerId, { count: string; marker: string | null }>);

export type UlcT07OwnerReviewState =
  | "identity-link-unverified"
  | "owner-marker-missing"
  | "explicit-references-remain"
  | "scoped-evidence-clear-manual-review-required";

export interface UlcT07OwnerReview {
  readonly owner: UlcP3OwnerId;
  /** Null when the original identity link cannot be independently verified. */
  readonly remainingReferences: number | null;
  readonly markerPresent: boolean | null;
  readonly status: UlcT07OwnerReviewState;
}

export interface UlcT07EightOwnerReview {
  readonly owners: readonly UlcT07OwnerReview[];
  readonly linkedIdentityCount: number;
  readonly actorAuditReferences: number | null;
  readonly organizationWidePrivateMediaCandidates: number;
  readonly humanFreeTextReviewRequired: true;
  readonly auditRetentionDecisionRequired: true;
  readonly providerMediaAbsenceRequired: true;
  readonly allEightOwnersProvenComplete: false;
  readonly olderRestorePromotionAllowed: false;
  readonly privacyReady: false;
}

export interface UlcT07EightOwnerSqlClient {
  unsafe(query: string, parameters?: (string | number | boolean | null)[]):
    PromiseLike<readonly Record<string, unknown>[]>;
}

export class PostgresUlcT07EightOwnerInspector {
  constructor(private readonly sql: UlcT07EightOwnerSqlClient) {}

  async inspect(organizationId: string, subjectId: string, completedAt: Date):
    Promise<UlcT07EightOwnerReview> {
    if (
      !validId(organizationId) || !validId(subjectId) ||
      !(completedAt instanceof Date) || !Number.isFinite(completedAt.getTime())
    ) throw new Error("ULC T07 eight-owner inspection authority invalid.");
    const rows = await this.sql.unsafe(ULC_T07_EIGHT_OWNER_SQL,
      [organizationId, subjectId, completedAt.toISOString()]);
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error("ULC T07 eight-owner SQL did not return one verified row.");
    }
    const row = rows[0];
    const linked = count(row.linked_identities);
    if (linked > 1) {
      // Multiple accounts may have been linked historically. Their ownership,
      // purpose and allowed erasure cannot be inferred from this one marker.
      throw new Error("ULC T07 multiple identity links need individual legal review.");
    }
    const owners = ULC_P3_PERSISTENT_OWNERS.map(owner => {
      const fields = COLUMNS[owner];
      const remaining = count(row[fields.count]);
      const marker = fields.marker === null ? null : count(row[fields.marker]) === 1;
      // Blocks have identity-keyed favourites in addition to subject usage.
      // ULC owns actor/registration audit references beyond subject history.
      // If the identity source is missing, neither may claim an all-clear.
      const identityDependent =
        owner === "identity" || owner === "permissions" ||
        owner === "exercise-catalog" || owner === "training-blocks" ||
        owner === "ulc-linz-lifecycle";
      const unverified = linked === 0 && identityDependent;
      const status: UlcT07OwnerReviewState = unverified
        ? "identity-link-unverified"
        : marker === false
          ? "owner-marker-missing"
          : remaining > 0
            ? "explicit-references-remain"
            : "scoped-evidence-clear-manual-review-required";
      return Object.freeze({
        owner,
        remainingReferences: unverified ? null : remaining,
        markerPresent: unverified ? null : marker,
        status,
      });
    });
    return Object.freeze({
      owners: Object.freeze(owners),
      linkedIdentityCount: linked,
      actorAuditReferences: linked === 0 ? null : count(row.actor_audit_remaining),
      organizationWidePrivateMediaCandidates: count(row.org_media_candidates),
      humanFreeTextReviewRequired: true as const,
      auditRetentionDecisionRequired: true as const,
      providerMediaAbsenceRequired: true as const,
      allEightOwnersProvenComplete: false as const,
      olderRestorePromotionAllowed: false as const,
      privacyReady: false as const,
    });
  }
}

function validId(input: unknown): input is string {
  return typeof input === "string" && input.length > 0 && input.length <= 200 &&
    input === input.trim() && !input.includes("\0");
}
function count(input: unknown): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
    throw new Error("ULC T07 eight-owner count is invalid.");
  }
  return input;
}

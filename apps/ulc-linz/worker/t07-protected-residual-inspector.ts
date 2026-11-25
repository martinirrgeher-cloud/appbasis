/**
 * Operator-only read-only residual inventory after a CANONICAL athlete
 * deletion marker. Every value is a count; no names, session IDs, notes or
 * individual actor IDs leave this port.
 *
 * This is NOT proof of absence: identifying free text can occur in unrelated
 * fields, provider objects, exports and older backups. Historic audit/actor
 * records can also remain under a separately lawful retention period.
 * NEVER decide deletion automatically from these coarse counts.
 */

export interface UlcT07ResidualSqlClient {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcT07ResidualReview {
  readonly sourceIdentityLinks: number;
  readonly subjectScopedReferenceRows: number;
  /** Null means there was no independently established identity mapping. */
  readonly identityScopedReferenceRows: number | null;
  readonly actorAndAuditReferenceRows: number | null;
  /** Review candidates across the whole organization, not proven subject links. */
  readonly organizationWideFreeTextCandidates: number;
  readonly organizationWideAmbiguousUsageCandidates: number;
  readonly organizationWidePrivateMediaMetadata: number;
  readonly identityMappingReviewRequired: boolean;
  readonly freeTextReviewed: false;
  readonly actorAuditReviewed: false;
  readonly mediaProviderAbsenceVerified: false;
  readonly fullPrivacyComplete: false;
}

export const ULC_T07_RESIDUAL_INVENTORY_SQL = `
WITH identity_links AS (
  SELECT DISTINCT identity_id
  FROM ulc_linz_lifecycle_deletion
  WHERE organization_id = $1 AND subject_id = $2
    AND source_role = 'athlete'
    AND purge_after > now()
)
SELECT
  (SELECT count(*)::int FROM identity_links) AS identity_links,
  (
    (SELECT count(*) FROM appbasis_athlete WHERE organization_id=$1 AND id=$2) +
    (SELECT count(*) FROM appbasis_athlete_group_membership WHERE organization_id=$1 AND athlete_id=$2) +
    (SELECT count(*) FROM ulc_linz_membership WHERE organization_id=$1 AND subject_id=$2) +
    (SELECT count(*) FROM ulc_linz_subject_scope WHERE organization_id=$1 AND subject_id=$2) +
    (SELECT count(*) FROM ulc_linz_training_trainer_attendance WHERE organization_id=$1 AND trainer_id=$2)
  )::int AS subject_rows,
  (
    (SELECT count(*) FROM "user" WHERE id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM appbasis_permission_principal
      WHERE principal_id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM ulc_linz_exercise_favorite WHERE organization_id=$1
      AND identity_id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM appbasis_exercise_catalog_favorite WHERE organization_id=$1
      AND principal_id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM appbasis_training_block_favorite WHERE organization_id=$1
      AND principal_id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM appbasis_exercise_catalog_usage_subject WHERE organization_id=$1
      AND principal_id IN (SELECT identity_id FROM identity_links))
  )::int AS identity_rows,
  (
    (SELECT count(*) FROM ulc_linz_training_registration WHERE organization_id=$1
      AND updated_by_identity_id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM ulc_linz_training_registration_change WHERE organization_id=$1
      AND actor_identity_id IN (SELECT identity_id FROM identity_links)) +
    (SELECT count(*) FROM ulc_linz_lifecycle_audit WHERE organization_id=$1 AND
      (target_identity_id IN (SELECT identity_id FROM identity_links)
       OR actor_principal_id IN (SELECT identity_id FROM identity_links))) +
    (SELECT count(*) FROM ulc_linz_trainer_identity_audit WHERE organization_id=$1 AND
      (previous_subject_id=$2 OR new_subject_id=$2 OR
       target_identity_id IN (SELECT identity_id FROM identity_links) OR
       actor_principal_id IN (SELECT identity_id FROM identity_links))) +
    (SELECT count(*) FROM ulc_linz_security_event_log WHERE organization_id=$1 AND
      (target_id=$2 OR actor_principal_id IN (SELECT identity_id FROM identity_links))) +
    (SELECT count(*) FROM appbasis_permission_administration_audit WHERE
      (actor_principal_id IN (SELECT identity_id FROM identity_links) OR
       (target_type='principal' AND target_id IN (SELECT identity_id FROM identity_links))))
  )::int AS actor_audit_rows,
  (
    (SELECT count(*) FROM ulc_linz_training_session WHERE organization_id=$1 AND
      (nullif(btrim(note),'') IS NOT NULL OR cardinality(training_content_titles)>0 OR
       (training_content_items IS NOT NULL AND training_content_items <> '[]'::jsonb AND
        training_content_items <> '{}'::jsonb AND training_content_items <> 'null'::jsonb))) +
    (SELECT count(*) FROM ulc_linz_training_registration WHERE organization_id=$1 AND
      nullif(btrim(note),'') IS NOT NULL) +
    (SELECT count(*) FROM ulc_linz_training_registration_change WHERE organization_id=$1 AND
      nullif(btrim(note),'') IS NOT NULL) +
    (SELECT count(*) FROM appbasis_training_documentation_revision WHERE organization_id=$1
      AND (nullif(btrim(note),'') IS NOT NULL OR
       (items_json IS NOT NULL AND items_json <> '[]'::jsonb AND
        items_json <> '{}'::jsonb AND items_json <> 'null'::jsonb) OR
       (attendance_json IS NOT NULL AND attendance_json <> '[]'::jsonb AND
        attendance_json <> '{}'::jsonb AND attendance_json <> 'null'::jsonb))) +
    (SELECT count(*) FROM appbasis_training_plan_revision WHERE organization_id=$1 AND
      nullif(btrim(note),'') IS NOT NULL) +
    (SELECT count(*) FROM appbasis_training_plan_revision_item WHERE organization_id=$1 AND
      (nullif(btrim(note),'') IS NOT NULL OR nullif(btrim(comment),'') IS NOT NULL)) +
    (SELECT count(*) FROM appbasis_training_block_revision WHERE organization_id=$1 AND
      nullif(btrim(note),'') IS NOT NULL) +
    (SELECT count(*) FROM appbasis_training_block_revision_item WHERE organization_id=$1 AND
      nullif(btrim(note),'') IS NOT NULL)
  )::int AS free_text_candidates,
  (
    (SELECT count(*) FROM appbasis_training_block_usage WHERE organization_id=$1 AND
      (nullif(btrim(source_ref),'') IS NOT NULL OR nullif(btrim(note),'') IS NOT NULL)) +
    (SELECT count(*) FROM appbasis_exercise_catalog_usage WHERE organization_id=$1 AND
      (nullif(btrim(source_ref),'') IS NOT NULL OR nullif(btrim(note),'') IS NOT NULL))
  )::int AS ambiguous_usage_candidates,
  (SELECT count(*)::int FROM appbasis_exercise_catalog_private_media
    WHERE organization_id=$1) AS private_media_metadata`;

export class PostgresUlcT07ResidualInspector {
  constructor(private readonly sql: UlcT07ResidualSqlClient) {}

  async inspect(organizationId: string, subjectId: string): Promise<UlcT07ResidualReview> {
    if (!validId(organizationId) || !validId(subjectId)) {
      throw new Error("T07 residual review scope is invalid.");
    }
    const rows = await this.sql.unsafe(ULC_T07_RESIDUAL_INVENTORY_SQL, [
      organizationId, subjectId,
    ]);
    if (rows.length !== 1 || !rows[0]) {
      throw new Error("T07 residual inventory returned an invalid result.");
    }
    const row = rows[0];
    const links = count(row.identity_links);
    const identityRows = count(row.identity_rows);
    const actorRows = count(row.actor_audit_rows);
    return Object.freeze({
      sourceIdentityLinks: links,
      subjectScopedReferenceRows: count(row.subject_rows),
      identityScopedReferenceRows: links > 0 ? identityRows : null,
      actorAndAuditReferenceRows: links > 0 ? actorRows : null,
      organizationWideFreeTextCandidates: count(row.free_text_candidates),
      organizationWideAmbiguousUsageCandidates: count(row.ambiguous_usage_candidates),
      organizationWidePrivateMediaMetadata: count(row.private_media_metadata),
      identityMappingReviewRequired: links === 0,
      freeTextReviewed: false as const,
      actorAuditReviewed: false as const,
      mediaProviderAbsenceVerified: false as const,
      fullPrivacyComplete: false as const,
    });
  }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 200 &&
    value === value.trim() && !value.includes("\0");
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("T07 residual count is invalid.");
  }
  return value;
}

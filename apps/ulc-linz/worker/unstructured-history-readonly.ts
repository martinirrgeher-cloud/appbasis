/**
 * P4 PRIVACY EVIDENCE ONLY: counts potentially identifying content in all
 * historic revision/note locations of the current 69-table ULC schema.
 *
 * Never returns note text, actor/subject IDs, or unstructured JSON.
 * It cannot prove that a text refers to any particular deleted subject,
 * that a provider object is absent, or that a restore may be promoted.
 * It is deliberately NOT installed as an HTTP, cron, retention or delete
 * handler. Caller must independently authorize the organization scope.
 */
export const ULC_UNSTRUCTURED_REVIEW_AREAS = Object.freeze([
  "session_notes",
  "session_content",
  "registration_notes",
  "registration_history_notes",
  "documentation_revision_notes",
  "documentation_revision_json",
  "plan_revision_notes",
  "plan_revision_item_text",
  "block_revision_text",
  "block_revision_item_notes",
  "block_revision_parameter_values",
  "catalog_usage_legacy_refs",
  "block_usage_legacy_refs",
] as const);
export type UlcUnstructuredReviewArea = typeof ULC_UNSTRUCTURED_REVIEW_AREAS[number];

export interface UlcUnstructuredReviewSqlClient {
  begin<T>(callback: (transaction: {
    unsafe(
      query: string,
      params?: Array<string | number | boolean | null>,
    ): PromiseLike<readonly Record<string, unknown>[]>;
  }) => Promise<T>): Promise<T>;
}

export interface UlcUnstructuredReviewInventory {
  readonly aggregateOnly: true;
  readonly counts: Readonly<Record<UlcUnstructuredReviewArea, number>>;
  readonly hasPotentiallyPersonalContent: boolean;
  /** Even an empty inventory is not a full owner/restore/privacy review. */
  readonly permitsLifecycleRelease: false;
  readonly permitsDeletion: false;
  readonly permitsRestorePromotion: false;
}

/**
 * An organizational inventory, intentionally NOT a subject-name search:
 * inferring attribution from arbitrary free text would miss misspellings
 * and third-party names and could improperly clear historic revisions.
 * All nonempty notes/opaque source_refs are therefore review candidates.
 */
export async function inspectUlcUnstructuredHistoryReadOnly(
  sql: UlcUnstructuredReviewSqlClient,
  organizationId: string,
): Promise<UlcUnstructuredReviewInventory> {
  if (
    !sql || typeof sql.begin !== "function" ||
    typeof organizationId !== "string" ||
    organizationId.length < 1 || organizationId.length > 200 ||
    organizationId !== organizationId.trim() ||
    organizationId.includes("\u0000")
  ) {
    throw new Error("ULC unstructured review scope is invalid.");
  }

  return sql.begin(async transaction => {
    await transaction.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const rows = await transaction.unsafe(`
      SELECT
        (SELECT count(*)::int FROM ulc_linz_training_session
          WHERE organization_id = $1 AND nullif(btrim(note), '') IS NOT NULL)
          AS session_notes,
        (SELECT count(*)::int FROM ulc_linz_training_session
          WHERE organization_id = $1 AND (
            coalesce(cardinality(training_content_titles),0) > 0 OR
            (training_content_items IS NOT NULL AND
             training_content_items <> '[]'::jsonb AND
             training_content_items <> '{}'::jsonb)))
          AS session_content,
        (SELECT count(*)::int FROM ulc_linz_training_registration
          WHERE organization_id = $1 AND nullif(btrim(note), '') IS NOT NULL)
          AS registration_notes,
        (SELECT count(*)::int FROM ulc_linz_training_registration_change
          WHERE organization_id = $1 AND nullif(btrim(note), '') IS NOT NULL)
          AS registration_history_notes,
        (SELECT count(*)::int FROM appbasis_training_documentation_revision
          WHERE organization_id = $1 AND nullif(btrim(note), '') IS NOT NULL)
          AS documentation_revision_notes,
        (SELECT count(*)::int FROM appbasis_training_documentation_revision
          WHERE organization_id = $1 AND (
            (items_json IS NOT NULL AND
             items_json <> '[]'::jsonb AND items_json <> '{}'::jsonb) OR
            (attendance_json IS NOT NULL AND
             attendance_json <> '[]'::jsonb AND attendance_json <> '{}'::jsonb)))
          AS documentation_revision_json,
        (SELECT count(*)::int FROM appbasis_training_plan_revision
          WHERE organization_id = $1 AND nullif(btrim(note), '') IS NOT NULL)
          AS plan_revision_notes,
        (SELECT count(*)::int FROM appbasis_training_plan_revision_item
          WHERE organization_id = $1 AND (
            nullif(btrim(note), '') IS NOT NULL OR
            nullif(btrim(comment), '') IS NOT NULL OR
            nullif(btrim(name), '') IS NOT NULL OR
            nullif(btrim(sets_value), '') IS NOT NULL OR
            nullif(btrim(repetitions_value), '') IS NOT NULL OR
            nullif(btrim(amount_value), '') IS NOT NULL OR
            nullif(btrim(unit_value), '') IS NOT NULL))
          AS plan_revision_item_text,
        (SELECT count(*)::int FROM appbasis_training_block_revision
          WHERE organization_id = $1 AND (
            nullif(btrim(note), '') IS NOT NULL OR
            nullif(btrim(name), '') IS NOT NULL))
          AS block_revision_text,
        (SELECT count(*)::int FROM appbasis_training_block_revision_item
          WHERE organization_id = $1 AND nullif(btrim(note), '') IS NOT NULL)
          AS block_revision_item_notes,
        (SELECT count(*)::int FROM appbasis_training_block_revision_item_parameter
          WHERE organization_id = $1 AND
            nullif(btrim(parameter_value), '') IS NOT NULL)
          AS block_revision_parameter_values,
        (SELECT count(*)::int FROM appbasis_exercise_catalog_usage
          WHERE organization_id = $1 AND (
            nullif(btrim(note),'') IS NOT NULL OR
            nullif(btrim(source_ref),'') IS NOT NULL))
          AS catalog_usage_legacy_refs,
        (SELECT count(*)::int FROM appbasis_training_block_usage
          WHERE organization_id = $1 AND (
            nullif(btrim(note),'') IS NOT NULL OR
            nullif(btrim(source_ref),'') IS NOT NULL))
          AS block_usage_legacy_refs
    `, [organizationId]);

    if (rows?.length !== 1 || !rows[0]) {
      throw new Error("ULC unstructured history inventory is incomplete.");
    }
    const row = rows[0];
    const counts = {} as Record<UlcUnstructuredReviewArea, number>;
    for (const area of ULC_UNSTRUCTURED_REVIEW_AREAS) {
      const value = row[area];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("ULC unstructured history inventory is incomplete.");
      }
      counts[area] = value;
    }
    return Object.freeze({
      aggregateOnly: true as const,
      counts: Object.freeze(counts),
      hasPotentiallyPersonalContent:
        ULC_UNSTRUCTURED_REVIEW_AREAS.some(area => counts[area] > 0),
      permitsLifecycleRelease: false as const,
      permitsDeletion: false as const,
      permitsRestorePromotion: false as const,
    });
  });
}

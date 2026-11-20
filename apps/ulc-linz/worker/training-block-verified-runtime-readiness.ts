/**
 * P02-C: fail-closed preflight for the optional, authenticated training
 * plan -> training block subject writer. Only the explicit 69-table Preview
 * transition accepts app-owned training fences; no marker privileges.
 * Preview-only until application
 * lifecycle, actual owner GRANTs and full restore evidence are approved.
 *
 * This checks ONLY catalog metadata and effective SQL privileges, never
 * reads a personal row or grants missing rights.
 */
export interface UlcVerifiedBlockUsagePreviewReadinessClient {
  begin<T>(
    callback: (transaction: {
      unsafe(
        query: string,
        parameters?: Array<string | number | boolean | null>,
      ): PromiseLike<readonly Record<string, unknown>[]>;
    }) => Promise<T>,
  ): Promise<T>;
}

export class UlcVerifiedBlockUsageUnavailableError extends Error {
  readonly code = "ULC_BLOCK_VERIFIED_USAGE_UNAVAILABLE";

  constructor() {
    super("ULC verified training block usage is not authorized in this Preview database.");
    this.name = "UlcVerifiedBlockUsageUnavailableError";
  }
}

/**
 * Fail closed for a missing table, absent privileges, wrong Preview database,
 * wrong application role or any partial/non-boolean metadata response.
 *
 * Use the same application SQL connection as the runtime writer; checking
 * permissions with a privileged migration role would be misleading.
 */
export async function assertUlcVerifiedBlockUsagePreviewReadiness(
  applicationSql: UlcVerifiedBlockUsagePreviewReadinessClient,
): Promise<void> {
  if (!applicationSql || typeof applicationSql.begin !== "function") {
    throw new UlcVerifiedBlockUsageUnavailableError();
  }
  try {
    await applicationSql.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const rows = await transaction.unsafe(`
        SELECT
          current_database() AS database_name,
          current_user AS principal_name,
          (SELECT count(*)::int FROM pg_catalog.pg_tables
            WHERE schemaname = 'public') AS public_tables,
          -- 66 legacy tables are valid for the independent protected block
          -- writer; a future 68-table schema is valid ONLY with both separately
          -- reviewed protected catalog relations present.
          to_regclass('public.appbasis_exercise_catalog_favorite_deletion') IS NOT NULL
            AS catalog_favorite_guard_exists,
          to_regclass('public.appbasis_exercise_catalog_usage_subject') IS NOT NULL
            AS catalog_subject_guard_exists,
          to_regclass('public.ulc_linz_training_subject_deletion') IS NOT NULL
            AS training_subject_marker_exists,
          (SELECT count(*)::int
             FROM pg_catalog.pg_trigger AS trigger
             JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
             JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal
              AND trigger.tgenabled IN ('O', 'A')
              AND (trigger.tgtype::integer & 23) = 23
              AND trigger.tgfoid = to_regprocedure('public.ulc_linz_training_subject_write_fence()')
              AND (relation.relname, trigger.tgname) IN (
                ('ulc_linz_training_attendance','ulc_linz_training_attendance_subject_fence'),
                ('ulc_linz_training_registration','ulc_linz_training_registration_subject_fence'),
                ('ulc_linz_training_registration_change','ulc_linz_training_registration_change_subject_fence')
              )
          ) AS training_subject_fence_triggers,
          CASE WHEN to_regclass('public.ulc_linz_training_subject_deletion') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.ulc_linz_training_subject_deletion',
                'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
            END AS may_access_training_subject_marker,
          to_regclass('public.appbasis_training_plan') IS NOT NULL
            AS plan_table_exists,
          to_regclass('public.appbasis_training_plan_revision') IS NOT NULL
            AS plan_revision_exists,
          to_regclass('public.appbasis_training_plan_revision_item') IS NOT NULL
            AS plan_item_exists,
          to_regclass('public.appbasis_training_block_usage') IS NOT NULL
            AS usage_table_exists,
          to_regclass('public.appbasis_training_block_usage_subject') IS NOT NULL
            AS subject_table_exists,
          to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NOT NULL
            AS deletion_table_exists,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_block_usage_subject', 'INSERT')
            END AS may_insert_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_block_usage_subject', 'SELECT')
            END AS may_read_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_block_usage_subject_deletion', 'SELECT')
            END AS may_read_deletion,
          CASE WHEN to_regclass('public.appbasis_training_block_usage') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_block_usage', 'INSERT')
            END AS may_insert_usage,
          CASE WHEN to_regclass('public.appbasis_training_plan') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_plan', 'SELECT')
            END AS may_read_plan,
          CASE WHEN to_regclass('public.appbasis_training_plan_revision') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_plan_revision', 'SELECT')
            END AS may_read_plan_revision,
          CASE WHEN to_regclass('public.appbasis_training_plan_revision_item') IS NULL
            THEN false ELSE
              has_table_privilege(current_user,
                'public.appbasis_training_plan_revision_item', 'SELECT')
            END AS may_read_plan_item
      `);
      const row = rows?.[0];
      if (
        rows.length !== 1 ||
        row?.database_name !== "appbasis_ulc_linz_preview" ||
        row?.principal_name !== "appbasis_ulc_linz_preview_application" ||
        !(
          (row?.public_tables === 66 &&
            row?.training_subject_marker_exists === false &&
            row?.training_subject_fence_triggers === 0 &&
            row?.may_access_training_subject_marker === false) ||
          (row?.public_tables === 68 &&
            row?.catalog_favorite_guard_exists === true &&
            row?.catalog_subject_guard_exists === true &&
            row?.training_subject_marker_exists === false &&
            row?.training_subject_fence_triggers === 0 &&
            row?.may_access_training_subject_marker === false) ||
          (row?.public_tables === 69 &&
            row?.catalog_favorite_guard_exists === true &&
            row?.catalog_subject_guard_exists === true &&
            row?.training_subject_marker_exists === true &&
            row?.training_subject_fence_triggers === 3 &&
            row?.may_access_training_subject_marker === false)
        ) ||
        row.plan_table_exists !== true ||
        row.plan_revision_exists !== true ||
        row.plan_item_exists !== true ||
        row.usage_table_exists !== true ||
        row.subject_table_exists !== true ||
        row.deletion_table_exists !== true ||
        row.may_insert_subject !== true ||
        row.may_read_subject !== true ||
        row.may_read_deletion !== true ||
        row.may_insert_usage !== true ||
        row.may_read_plan !== true ||
        row.may_read_plan_revision !== true ||
        row.may_read_plan_item !== true
      ) {
        throw new UlcVerifiedBlockUsageUnavailableError();
      }
    });
  } catch {
    // Never include a SQL/provider/role detail in a public application error.
    throw new UlcVerifiedBlockUsageUnavailableError();
  }
}

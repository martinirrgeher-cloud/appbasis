/**
 * P02 cutover postcondition. Read-only verification of the *effective* SQL
 * privileges of the ordinary ULC application role, not the migration owner.
 *
 * The existing protected runtime still admits the pre-cutover legacy grants.
 * Do NOT wire this gate into startup until the separately reviewed SQL-owner
 * erasure workflow and role cutover have both been executed successfully.
 *
 * This check never returns personal data and never issues GRANT/REVOKE.
 */
export class UlcLegacyBlockUsageCutoverNotReadyError extends Error {
  readonly code = "ULC_BLOCK_LEGACY_RIGHTS_CUTOVER_NOT_READY";
  constructor() {
    super("Verified legacy block usage SQL privilege separation is not ready.");
    this.name = "UlcLegacyBlockUsageCutoverNotReadyError";
  }
}

export interface UlcLegacyBlockUsageCutoverSqlClient {
  begin<T>(
    callback: (transaction: {
      unsafe(
        query: string,
        parameters?: Array<string | number | boolean | null>,
      ): PromiseLike<readonly Record<string, unknown>[]>;
    }) => Promise<T>,
  ): Promise<T>;
}

export async function assertUlcLegacyBlockUsageRoleCutoverReady(
  applicationSql: UlcLegacyBlockUsageCutoverSqlClient,
  environment: "production" | "preview",
): Promise<void> {
  if (applicationSql === null || typeof applicationSql !== "object" ||
      typeof applicationSql.begin !== "function" ||
      (environment !== "production" && environment !== "preview")) {
    throw new UlcLegacyBlockUsageCutoverNotReadyError();
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
          to_regclass('public.appbasis_training_block_usage') IS NOT NULL
            AS usage_table_exists,
          to_regclass('public.appbasis_training_block_usage_subject') IS NOT NULL
            AS subject_table_exists,
          to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NOT NULL
            AS deletion_marker_exists,
          CASE WHEN to_regclass('public.appbasis_training_block_usage') IS NULL
            THEN false ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage', 'SELECT')
          END AS can_read_usage,
          CASE WHEN to_regclass('public.appbasis_training_block_usage') IS NULL
            THEN false ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage', 'INSERT')
          END AS can_insert_usage,
          CASE WHEN to_regclass('public.appbasis_training_block_usage') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage', 'UPDATE')
          END AS can_update_usage,
          CASE WHEN to_regclass('public.appbasis_training_block_usage') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage', 'DELETE')
          END AS can_delete_usage,
          CASE WHEN to_regclass('public.appbasis_training_block_usage') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage', 'TRUNCATE')
          END AS can_truncate_usage,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN false ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject', 'SELECT')
          END AS can_read_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN false ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject', 'INSERT')
          END AS can_insert_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject', 'UPDATE')
          END AS can_update_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject', 'DELETE')
          END AS can_delete_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject', 'TRUNCATE')
          END AS can_truncate_subject,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NULL
            THEN false ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject_deletion', 'SELECT')
          END AS can_read_marker,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject_deletion', 'INSERT')
          END AS can_insert_marker,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject_deletion', 'UPDATE')
          END AS can_update_marker,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject_deletion', 'DELETE')
          END AS can_delete_marker,
          CASE WHEN to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NULL
            THEN true ELSE
            has_table_privilege(current_user, 'public.appbasis_training_block_usage_subject_deletion', 'TRUNCATE')
          END AS can_truncate_marker
      `);
      const row = rows[0];
      if (
        rows.length !== 1 ||
        row === undefined ||
        row.database_name !==
          (environment === "production" ? "neondb" : "appbasis_ulc_linz_preview") ||
        row.principal_name !==
          (environment === "production"
            ? "ulc_linz_application"
            : "appbasis_ulc_linz_preview_application") ||
        row.usage_table_exists !== true ||
        row.subject_table_exists !== true ||
        row.deletion_marker_exists !== true ||
        row.can_read_usage !== true ||
        row.can_insert_usage !== true ||
        row.can_update_usage !== false ||
        row.can_delete_usage !== false ||
        row.can_truncate_usage !== false ||
        row.can_read_subject !== true ||
        row.can_insert_subject !== true ||
        row.can_update_subject !== false ||
        row.can_delete_subject !== false ||
        row.can_truncate_subject !== false ||
        row.can_read_marker !== true ||
        row.can_insert_marker !== false ||
        row.can_update_marker !== false ||
        row.can_delete_marker !== false ||
        row.can_truncate_marker !== false
      ) {
        throw new UlcLegacyBlockUsageCutoverNotReadyError();
      }
    });
  } catch {
    throw new UlcLegacyBlockUsageCutoverNotReadyError();
  }
}

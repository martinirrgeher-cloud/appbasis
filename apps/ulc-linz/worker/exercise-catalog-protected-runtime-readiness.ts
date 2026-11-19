/**
 * P2-A: exclusively read-only readiness check for the isolated Preview
 * exercise-catalog protected writer. Does not grant SQL rights, read personal
 * values, or activate a deployed Worker. In particular, deletion markers must
 * not be writable by the ordinary application role.
 */
export interface UlcProtectedCatalogPreviewReadinessClient {
  begin<T>(
    callback: (transaction: {
      unsafe(
        query: string,
        parameters?: Array<string | number | boolean | null>,
      ): PromiseLike<readonly Record<string, unknown>[]>;
    }) => Promise<T>,
  ): Promise<T>;
}

export class UlcProtectedCatalogUnavailableError extends Error {
  readonly code = "ULC_PROTECTED_CATALOG_UNAVAILABLE";

  constructor() {
    super("ULC protected catalog writes are unavailable in this Preview database.");
    this.name = "UlcProtectedCatalogUnavailableError";
  }
}

export async function assertUlcProtectedCatalogPreviewReadiness(
  applicationSql: UlcProtectedCatalogPreviewReadinessClient,
): Promise<void> {
  if (!applicationSql || typeof applicationSql.begin !== "function") {
    throw new UlcProtectedCatalogUnavailableError();
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
          to_regclass('public.appbasis_exercise_catalog_item') IS NOT NULL AS item_exists,
          to_regclass('public.appbasis_exercise_catalog_favorite') IS NOT NULL AS favorite_exists,
          to_regclass('public.appbasis_exercise_catalog_favorite_deletion') IS NOT NULL AS marker_exists,
          to_regclass('public.appbasis_exercise_catalog_usage_subject') IS NOT NULL AS usage_subject_exists,
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_item') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_item', 'SELECT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_item', 'INSERT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_item', 'UPDATE')
            END AS may_write_item,
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_favorite') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_favorite', 'SELECT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_favorite', 'INSERT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_favorite', 'DELETE')
            END AS may_write_favorite,
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_favorite_deletion') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_favorite_deletion', 'SELECT')
            END AS may_read_marker,
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_favorite_deletion') IS NULL
            THEN true ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_favorite_deletion', 'INSERT,UPDATE,DELETE,TRUNCATE')
            END AS may_mutate_marker
      `);
      const row = rows?.[0];
      if (
        rows?.length !== 1 ||
        row?.database_name !== "appbasis_ulc_linz_preview" ||
        row?.principal_name !== "appbasis_ulc_linz_preview_application" ||
        row?.public_tables !== 66 ||
        row?.item_exists !== true ||
        row?.favorite_exists !== true ||
        row?.marker_exists !== true ||
        row?.usage_subject_exists !== true ||
        row?.may_write_item !== true ||
        row?.may_write_favorite !== true ||
        row?.may_read_marker !== true ||
        row?.may_mutate_marker !== false
      ) {
        throw new UlcProtectedCatalogUnavailableError();
      }
    });
  } catch {
    throw new UlcProtectedCatalogUnavailableError();
  }
}

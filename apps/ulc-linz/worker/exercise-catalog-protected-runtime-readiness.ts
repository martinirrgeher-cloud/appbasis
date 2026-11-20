/**
 * P2-A: exclusively read-only readiness check for the isolated Preview
 * exercise-catalog protected writer. The 69-table Preview case additionally
 * demands all three app-owned training write fences and no access to its
 * deletion marker. Does not grant SQL rights, read personal
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
  return assertProtectedCatalogReadiness(applicationSql, "preview");
}

/**
 * P3-B CANDIDATE ONLY: a production-role metadata check for the optional
 * protected catalog writer. Does not make the module production-ready, grant
 * any SQL privileges, or activate a Worker.
 */
export async function assertUlcProtectedCatalogProductionReadiness(
  applicationSql: UlcProtectedCatalogPreviewReadinessClient,
): Promise<void> {
  return assertProtectedCatalogReadiness(applicationSql, "production");
}

async function assertProtectedCatalogReadiness(
  applicationSql: UlcProtectedCatalogPreviewReadinessClient,
  environment: "preview" | "production",
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
          -- Creation/update also replace these module-owned child rows.
          -- Treat a missing child table/privilege as a hard startup blocker.
          (          CASE WHEN to_regclass('public.appbasis_exercise_catalog_parameter') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_parameter', 'SELECT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_parameter', 'INSERT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_parameter', 'DELETE')
            END AND
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_audience') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_audience', 'SELECT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_audience', 'INSERT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_audience', 'DELETE')
            END AND
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_video') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_video', 'SELECT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_video', 'INSERT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_video', 'DELETE')
            END AND
          CASE WHEN to_regclass('public.appbasis_exercise_catalog_similarity') IS NULL
            THEN false ELSE
              has_table_privilege(current_user, 'public.appbasis_exercise_catalog_similarity', 'SELECT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_similarity', 'INSERT')
              AND has_table_privilege(current_user, 'public.appbasis_exercise_catalog_similarity', 'DELETE')
            END) AS may_write_children,
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
        row?.database_name !== (environment === "production" ? "neondb" : "appbasis_ulc_linz_preview") ||
        row?.principal_name !== (environment === "production" ? "ulc_linz_application" : "appbasis_ulc_linz_preview_application") ||
        !(
          // Production is 69-table only. Preview keeps its existing 68/69
          // acceptance with no change to the previously tested behavior.
          (environment === "preview" &&
            row?.public_tables === 68 &&
            row?.training_subject_marker_exists === false &&
            row?.training_subject_fence_triggers === 0 &&
            row?.may_access_training_subject_marker === false) ||
          (row?.public_tables === 69 &&
            row?.training_subject_marker_exists === true &&
            row?.training_subject_fence_triggers === 3 &&
            row?.may_access_training_subject_marker === false)
        ) ||
        row?.item_exists !== true ||
        row?.favorite_exists !== true ||
        row?.marker_exists !== true ||
        row?.usage_subject_exists !== true ||
        row?.may_write_item !== true ||
        row?.may_write_favorite !== true ||
        row?.may_write_children !== true ||
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

/**
 * P3-B candidate: read-only, exact production-role admission for the existing
 * training-documentation writer. Not a privacy or cross-owner deletion approval.
 */
export interface UlcTrainingDocumentationProductionReadinessClient {
  begin<T>(callback: (transaction: {
    unsafe(query: string, parameters?: Array<string | number | boolean | null>):
      PromiseLike<readonly Record<string, unknown>[]>;
  }) => Promise<T>): Promise<T>;
}
export class UlcTrainingDocumentationProductionUnavailableError extends Error {
  readonly code = "ULC_TRAINING_DOCUMENTATION_PRODUCTION_UNAVAILABLE";
  constructor() {
    super("ULC production documentation writer is not authorized on this database.");
    this.name = "UlcTrainingDocumentationProductionUnavailableError";
  }
}

/** Only PostgreSQL metadata, under the ordinary application SQL role. */
export async function assertUlcTrainingDocumentationProductionReadiness(
  applicationSql: UlcTrainingDocumentationProductionReadinessClient,
): Promise<void> {
  if (!applicationSql || typeof applicationSql.begin !== "function") {
    throw new UlcTrainingDocumentationProductionUnavailableError();
  }
  try {
    await applicationSql.begin(async transaction => {
      await transaction.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const rows = await transaction.unsafe([
        "SELECT current_database() AS database_name, current_user AS principal_name,",
        "(SELECT count(*)::int FROM pg_catalog.pg_tables WHERE schemaname='public') AS public_tables,",
        "to_regclass('public.appbasis_training_documentation') IS NOT NULL AS documentation_exists,",
        "to_regclass('public.appbasis_training_documentation_revision') IS NOT NULL AS revision_exists,",
        "to_regclass('public.appbasis_training_documentation_subject_deletion') IS NOT NULL AS marker_exists,",
        "(SELECT count(*)::int FROM pg_catalog.pg_trigger t",
        " JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid",
        " JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
        " JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid",
        " WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')",
        " AND (c.relname,t.tgname,f.proname) IN (",
        " ('appbasis_training_documentation','appbasis_training_documentation_guard_root','appbasis_training_documentation_guard_root_insert'),",
        " ('appbasis_training_documentation_revision','appbasis_training_documentation_guard_revision','appbasis_training_documentation_guard_revision_write')",
        " )) AS enabled_documentation_guards,",
        "(SELECT count(*)::int FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace",
        " WHERE n.nspname='public' AND f.proname IN (",
        " 'appbasis_training_documentation_guard_root_insert','appbasis_training_documentation_guard_revision_write'))",
        " AS documentation_guard_function_count,",
        "(SELECT count(*)::int FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace",
        " WHERE n.nspname='public' AND f.proname IN (",
        " 'appbasis_training_documentation_guard_root_insert','appbasis_training_documentation_guard_revision_write')",
        " AND (has_function_privilege('public',f.oid,'EXECUTE') OR",
        " has_function_privilege(current_user,f.oid,'EXECUTE'))) AS exposed_guard_functions,",
        "CASE WHEN to_regclass('public.appbasis_training_documentation') IS NULL THEN false ELSE",
        " has_table_privilege(current_user,'public.appbasis_training_documentation','SELECT')",
        " AND has_table_privilege(current_user,'public.appbasis_training_documentation','INSERT')",
        " AND has_table_privilege(current_user,'public.appbasis_training_documentation','UPDATE')",
        " AND NOT has_table_privilege(current_user,'public.appbasis_training_documentation','DELETE,TRUNCATE')",
        " END AS application_documentation_permissions,",
        "CASE WHEN to_regclass('public.appbasis_training_documentation_revision') IS NULL THEN false ELSE",
        " has_table_privilege(current_user,'public.appbasis_training_documentation_revision','SELECT')",
        " AND has_table_privilege(current_user,'public.appbasis_training_documentation_revision','INSERT')",
        " AND NOT has_table_privilege(current_user,'public.appbasis_training_documentation_revision','UPDATE,DELETE,TRUNCATE')",
        " END AS application_revision_permissions,",
        "CASE WHEN to_regclass('public.appbasis_training_documentation_subject_deletion') IS NULL THEN false ELSE",
        " has_table_privilege(current_user,'public.appbasis_training_documentation_subject_deletion','SELECT')",
        " AND NOT has_table_privilege(current_user,'public.appbasis_training_documentation_subject_deletion','INSERT,UPDATE,DELETE,TRUNCATE')",
        " END AS deletion_marker_permissions,",
        "CASE WHEN to_regclass('public.ulc_linz_training_subject_deletion') IS NULL THEN true ELSE",
        " has_table_privilege(current_user,'public.ulc_linz_training_subject_deletion','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",
        " END AS app_can_access_training_subject_deletion",
      ].join("\n"));
      const row=rows?.[0];
      if (
        rows?.length !== 1 ||
        row?.database_name !== "neondb" ||
        row?.principal_name !== "ulc_linz_application" ||
        row?.public_tables !== 69 ||
        row?.documentation_exists !== true ||
        row?.revision_exists !== true ||
        row?.marker_exists !== true ||
        row?.enabled_documentation_guards !== 2 ||
        row?.documentation_guard_function_count !== 2 ||
        row?.exposed_guard_functions !== 0 ||
        row?.application_documentation_permissions !== true ||
        row?.application_revision_permissions !== true ||
        row?.deletion_marker_permissions !== true ||
        row?.app_can_access_training_subject_deletion !== false
      ) throw new UlcTrainingDocumentationProductionUnavailableError();
    });
  } catch {
    throw new UlcTrainingDocumentationProductionUnavailableError();
  }
}

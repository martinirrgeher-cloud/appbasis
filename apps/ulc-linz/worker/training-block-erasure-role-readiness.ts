/**
 * P02 operator-only control-plane proof for a MINIMALLY PRIVILEGED erasure
 * identity. This module does not provision a role, modify PostgreSQL, or
 * connect the public/HTTP Worker to a privileged SQL connection.
 *
 * Invoke only on the dedicated erasure SQL connection, never on the generic
 * database owner. A successful check alone is not deletion authorization,
 * backup approval or a go-live decision.
 */
export class UlcBlockErasureRoleNotReadyError extends Error {
  readonly code = "ULC_BLOCK_ERASURE_ROLE_NOT_READY";
  constructor() {
    super("Dedicated training block erasure role is not ready.");
    this.name = "UlcBlockErasureRoleNotReadyError";
  }
}

export interface UlcBlockErasureRoleSqlClient {
  begin<T>(callback: (transaction: {
    unsafe(
      query: string,
      parameters?: Array<string | number | boolean | null>,
    ): PromiseLike<readonly Record<string, unknown>[]>;
  }) => Promise<T>): Promise<T>;
}

/**
 * Admission to a future separately approved erasure/restore control plane.
 * Both the connection's database AND login role must match the environment.
 *
 * Usage rows can only be SELECTed and DELETEd; subject attribution is
 * SELECT-only; markers allow SELECT/INSERT/UPDATE but not DELETE. FOR UPDATE
 * on a marker requires UPDATE authority. No role-wide permission to write
 * other application tables may be present.
 */
export async function assertUlcDedicatedBlockErasureRoleReady(
  connection: UlcBlockErasureRoleSqlClient,
  environment: "production" | "preview",
): Promise<void> {
  if (!connection || typeof connection.begin !== "function" ||
      (environment !== "production" && environment !== "preview")) {
    throw new UlcBlockErasureRoleNotReadyError();
  }
  try {
    await connection.begin(async transaction => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const rows = await transaction.unsafe(`
        SELECT current_database() AS database_name,
               current_user AS principal_name,
               role.rolcanlogin AS can_login,
               role.rolsuper AS is_superuser,
               role.rolcreaterole AS can_create_roles,
               role.rolcreatedb AS can_create_databases,
               role.rolbypassrls AS can_bypass_rls,
               role.rolinherit AS inherits_roles,
               pg_has_role(current_user,
                 (SELECT pg_get_userbyid(database.datdba)
                    FROM pg_catalog.pg_database AS database
                   WHERE database.datname = current_database()),'MEMBER')
                 AS is_database_owner_member,
               pg_has_role(current_user,
                 CASE WHEN current_database() = 'neondb'
                      THEN 'ulc_linz_application'
                      ELSE 'appbasis_ulc_linz_preview_application'
                 END,'MEMBER') AS is_application_member,
               to_regclass('public.appbasis_training_block_usage') IS NOT NULL
                 AS usage_exists,
               to_regclass('public.appbasis_training_block_usage_subject') IS NOT NULL
                 AS attribution_exists,
               to_regclass('public.appbasis_training_block_usage_subject_deletion') IS NOT NULL
                 AS marker_exists,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage','SELECT')
                 AS can_select_usage,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage','DELETE')
                 AS can_delete_usage,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage','INSERT')
                 AS can_insert_usage,
               (has_table_privilege(current_user,
                 'public.appbasis_training_block_usage','UPDATE')
                 OR has_any_column_privilege(current_user,
                   'public.appbasis_training_block_usage','UPDATE'))
                 AS can_update_usage,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage','TRUNCATE')
                 AS can_truncate_usage,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject','SELECT')
                 AS can_select_attribution,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject','INSERT')
                 AS can_insert_attribution,
               (has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject','UPDATE')
                 OR has_any_column_privilege(current_user,
                   'public.appbasis_training_block_usage_subject','UPDATE'))
                 AS can_update_attribution,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject','DELETE')
                 AS can_delete_attribution,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject','TRUNCATE')
                 AS can_truncate_attribution,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject_deletion','SELECT')
                 AS can_select_marker,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject_deletion','INSERT')
                 AS can_insert_marker,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject_deletion','UPDATE')
                 AS can_update_marker,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject_deletion','DELETE')
                 AS can_delete_marker,
               has_table_privilege(current_user,
                 'public.appbasis_training_block_usage_subject_deletion','TRUNCATE')
                 AS can_truncate_marker,
               (SELECT count(*)::int
                  FROM pg_catalog.pg_class AS relation
                  JOIN pg_catalog.pg_namespace AS namespace
                    ON namespace.oid = relation.relnamespace
                  WHERE namespace.nspname = 'public'
                    AND relation.relkind IN ('r','p')
                    AND relation.relname NOT IN (
                      'appbasis_training_block_usage',
                      'appbasis_training_block_usage_subject_deletion'
                    )
                    AND (
                      has_table_privilege(current_user, relation.oid,
                        'INSERT,UPDATE,DELETE,TRUNCATE')
                      OR has_any_column_privilege(current_user, relation.oid,
                        'INSERT')
                      OR has_any_column_privilege(current_user, relation.oid,
                        'UPDATE')
                    )
               ) AS other_writable_tables
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = current_user
      `);
      const row = rows[0];
      if (rows.length !== 1 || row === undefined ||
          row.database_name !== (environment === "production"
            ? "neondb" : "appbasis_ulc_linz_preview") ||
          row.principal_name !== (environment === "production"
            ? "ulc_linz_erasure" : "appbasis_ulc_linz_preview_erasure") ||
          row.can_login !== true ||
          row.is_superuser !== false ||
          row.can_create_roles !== false ||
          row.can_create_databases !== false ||
          row.can_bypass_rls !== false ||
          row.inherits_roles !== false ||
          row.is_database_owner_member !== false ||
          row.is_application_member !== false ||
          row.usage_exists !== true ||
          row.attribution_exists !== true ||
          row.marker_exists !== true ||
          row.can_select_usage !== true ||
          row.can_delete_usage !== true ||
          row.can_insert_usage !== false ||
          row.can_update_usage !== false ||
          row.can_truncate_usage !== false ||
          row.can_select_attribution !== true ||
          row.can_insert_attribution !== false ||
          row.can_update_attribution !== false ||
          row.can_delete_attribution !== false ||
          row.can_truncate_attribution !== false ||
          row.can_select_marker !== true ||
          row.can_insert_marker !== true ||
          row.can_update_marker !== true ||
          row.can_delete_marker !== false ||
          row.can_truncate_marker !== false ||
          row.other_writable_tables !== 0) {
        throw new UlcBlockErasureRoleNotReadyError();
      }
    });
  } catch {
    // Do not return role, provider, grant or SQL details to HTTP consumers.
    throw new UlcBlockErasureRoleNotReadyError();
  }
}

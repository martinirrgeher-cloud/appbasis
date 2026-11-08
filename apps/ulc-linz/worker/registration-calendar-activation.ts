import type { UlcRegistrationCalendarSqlClient } from "./registration-calendar-postgres";

/**
 * No implicit schema upgrade. This is an extra guard when a separately
 * approved Preview release explicitly selects isolated-preview-v17.
 * The application is never allowed to activate the feature on Production,
 * on v16, or on a database role without scoped DML privileges.
 */
export class UlcRegistrationCalendarActivationError extends Error {
  constructor() {
    super("G-04 calendar activation preflight failed.");
    this.name = "UlcRegistrationCalendarActivationError";
  }
}

export interface UlcCalendarReadiness {
  readonly database_name: string;
  readonly principal_name: string;
  readonly rule_table: boolean;
  readonly exception_table: boolean;
  readonly guard_function: boolean;
  readonly guard_trigger: boolean;
  readonly rule_read: boolean;
  readonly rule_insert: boolean;
  readonly rule_update: boolean;
  readonly exception_read: boolean;
  readonly exception_insert: boolean;
  readonly exception_update: boolean;
}

export function assertUlcG04PreviewCalendarReadiness(value: unknown): asserts value is UlcCalendarReadiness {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new UlcRegistrationCalendarActivationError();
  }
  const row = value as Record<string, unknown>;
  const ready =
    row.database_name === "appbasis_ulc_linz_preview" &&
    typeof row.principal_name === "string" &&
    row.principal_name.length > 0 &&
    row.principal_name !== "appbasis_ulc_linz_preview_migration" &&
    row.rule_table === true &&
    row.exception_table === true &&
    [
      "guard_function", "guard_trigger", "rule_read", "rule_insert",
      "rule_update", "exception_read", "exception_insert", "exception_update",
    ].every((field) => row[field] === true);
  if (!ready) throw new UlcRegistrationCalendarActivationError();
}

export async function verifyUlcG04PreviewCalendarReadiness(
  sql: UlcRegistrationCalendarSqlClient,
): Promise<void> {
  const rows = await sql.unsafe(`
    SELECT
      current_database() AS database_name,
      current_user AS principal_name,
      to_regclass('public.ulc_linz_registration_calendar_rule') IS NOT NULL AS rule_table,
      to_regclass('public.ulc_linz_registration_calendar_exception') IS NOT NULL AS exception_table,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'ulc_linz_registration_calendar_guard'
          AND p.prorettype = 'pg_catalog.trigger'::regtype
      ) AS guard_function,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON t.tgrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND c.relname = 'ulc_linz_training_registration'
          AND t.tgname = 'ulc_linz_registration_calendar_guard_trg'
          AND t.tgenabled = 'O' AND NOT t.tgisinternal
      ) AS guard_trigger,
      has_table_privilege(current_user,
        to_regclass('public.ulc_linz_registration_calendar_rule'), 'SELECT') AS rule_read,
      has_table_privilege(current_user,
        to_regclass('public.ulc_linz_registration_calendar_rule'), 'INSERT') AS rule_insert,
      has_table_privilege(current_user,
        to_regclass('public.ulc_linz_registration_calendar_rule'), 'UPDATE') AS rule_update,
      has_table_privilege(current_user,
        to_regclass('public.ulc_linz_registration_calendar_exception'), 'SELECT') AS exception_read,
      has_table_privilege(current_user,
        to_regclass('public.ulc_linz_registration_calendar_exception'), 'INSERT') AS exception_insert,
      has_table_privilege(current_user,
        to_regclass('public.ulc_linz_registration_calendar_exception'), 'UPDATE') AS exception_update
  `);
  if (rows.length !== 1) throw new UlcRegistrationCalendarActivationError();
  assertUlcG04PreviewCalendarReadiness(rows[0]);
}

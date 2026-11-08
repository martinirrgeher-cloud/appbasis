import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

/** Operator-approved test only. This is not a Production release or Privacy approval. */
export const DIRECT_G04_PREVIEW = Object.freeze({
  database: "appbasis_ulc_linz_preview",
  host: "ep-green-resonance-b19c78rm.c-5.eu-central-1.aws.neon.tech",
  migrationRole: "appbasis_ulc_linz_preview_migration",
  applicationRole: "appbasis_ulc_linz_preview_application",
  securityRole: "appbasis_ulc_linz_preview_security_log",
});

function deny() {
  throw new Error("G-04 direct Preview preflight blocked: source, permissions or calendar runtime is not ready.");
}

export function validateG04ExistingPreviewCredentials({
  migrationDatabaseUrl, applicationDatabaseUrl, securityLogDatabaseUrl,
} = {}) {
  let roles;
  try {
    roles = validateUlcLinzD4PreviewDatabaseCredentials({
      migrationDatabaseUrl, applicationDatabaseUrl, securityLogDatabaseUrl,
    });
  } catch { deny(); }
  const expected = [
    [roles.migration, DIRECT_G04_PREVIEW.migrationRole, migrationDatabaseUrl],
    [roles.application, DIRECT_G04_PREVIEW.applicationRole, applicationDatabaseUrl],
    [roles.securityLog, DIRECT_G04_PREVIEW.securityRole, securityLogDatabaseUrl],
  ];
  for (const [role, name, raw] of expected) {
    let uri;
    try { uri = new URL(raw); } catch { deny(); }
    if (role.host !== DIRECT_G04_PREVIEW.host ||
        role.database !== DIRECT_G04_PREVIEW.database ||
        role.user !== name || role.port !== 5432 ||
        uri.searchParams.size !== 1 ||
        !["require", "verify-ca", "verify-full"].includes(uri.searchParams.get("sslmode")) ||
        uri.hash.length > 0) deny();
  }
  return Object.freeze({
    target: "existing-ulc-preview",
    sourceHostVerified: true,
    targetSchemaVersion: 17,
    productionApproved: false,
  });
}

export function assertG04ExistingPreviewRuntimeRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.database_name !== DIRECT_G04_PREVIEW.database ||
      value.principal_name !== DIRECT_G04_PREVIEW.applicationRole ||
      value.runtime_least_privilege !== true ||
      value.rule_table !== true || value.exception_table !== true ||
      value.guard_trigger !== true || value.guard_function !== true ||
      value.guard_public_execute !== false ||
      value.app_security_log_read !== false ||
      value.app_security_log_write !== false ||
      !["rule_read","rule_insert","rule_update",
         "exception_read","exception_insert","exception_update"].every(k=>value[k]===true)) deny();
  return Object.freeze({status:"ready-for-existing-preview-deploy",schemaVersion:17,productionApproved:false});
}

export async function verifyG04ExistingPreviewRuntime(input, {
  databaseFactory=createPostgresDatabase,
}={}) {
  validateG04ExistingPreviewCredentials(input);
  const db=databaseFactory(input.applicationDatabaseUrl);
  try {
    const query=[
      "SELECT current_database() AS database_name,current_user AS principal_name,",
      "EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=current_user",
      "AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb",
      "AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls)",
      "AS runtime_least_privilege,",
      "to_regclass('public.ulc_linz_registration_calendar_rule') IS NOT NULL AS rule_table,",
      "to_regclass('public.ulc_linz_registration_calendar_exception') IS NOT NULL AS exception_table,",
      "EXISTS(SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace",
      "WHERE n.nspname='public' AND f.proname='ulc_linz_registration_calendar_guard'",
      "AND f.prorettype='pg_catalog.trigger'::regtype) AS guard_function,",
      "EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid",
      "WHERE c.relname='ulc_linz_training_registration'",
      "AND t.tgname='ulc_linz_registration_calendar_guard_trg'",
      "AND t.tgenabled='O' AND NOT t.tgisinternal) AS guard_trigger,",
      "EXISTS(SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace",
      "CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) a",
      "WHERE n.nspname='public' AND f.proname='ulc_linz_registration_calendar_guard'",
      "AND a.grantee=0 AND a.privilege_type='EXECUTE') AS guard_public_execute,",
      "has_table_privilege(current_user,'public.ulc_linz_registration_calendar_rule','SELECT') AS rule_read,",
      "has_table_privilege(current_user,'public.ulc_linz_registration_calendar_rule','INSERT') AS rule_insert,",
      "has_table_privilege(current_user,'public.ulc_linz_registration_calendar_rule','UPDATE') AS rule_update,",
      "has_table_privilege(current_user,'public.ulc_linz_registration_calendar_exception','SELECT') AS exception_read,",
      "has_table_privilege(current_user,'public.ulc_linz_registration_calendar_exception','INSERT') AS exception_insert,",
      "has_table_privilege(current_user,'public.ulc_linz_registration_calendar_exception','UPDATE') AS exception_update,",
      "has_table_privilege(current_user,'public.ulc_linz_security_event_log','SELECT') AS app_security_log_read,",
      "has_table_privilege(current_user,'public.ulc_linz_security_event_log','INSERT') AS app_security_log_write",
    ].join(" ");
    const rows=await db.client.unsafe(query);
    if(rows.length!==1) deny();
    return assertG04ExistingPreviewRuntimeRow(rows[0]);
  } finally {
    await db.client.end().catch(()=>{});
  }
}

if (typeof process.argv[1]==="string" &&
    import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  verifyG04ExistingPreviewRuntime({
    migrationDatabaseUrl:process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl:process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl:process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  }).then(r=>process.stdout.write(JSON.stringify(r)+"\n"))
    .catch(()=>{console.error("G-04 existing Preview v17 readiness blocked.");process.exitCode=1;});
}

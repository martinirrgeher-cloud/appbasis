import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";
import {
  inspectUlcLifecycleSchema,
  loadUlcLifecycleRepairPlan,
} from "./ulc-linz-lifecycle-schema-reconcile.mjs";

const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const APP_ROLE = "appbasis_ulc_linz_preview_application";
const SECURITY_ROLE = "appbasis_ulc_linz_preview_security_log";
const APPROVAL = "ULC-P04-LIFECYCLE-PREVIEW";

export class UlcLifecyclePreviewError extends Error {
  constructor(message) {
    super("ULC lifecycle Preview refused: " + message);
    this.name = "UlcLifecyclePreviewError";
  }
}

function refuse(message) {
  throw new UlcLifecyclePreviewError(message);
}

export function assertUlcLifecyclePreviewScope(input) {
  const scope = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (scope.migration.database !== DATABASE ||
      scope.migration.user !== MIGRATION_ROLE ||
      scope.application.user !== APP_ROLE ||
      scope.securityLog.user !== SECURITY_ROLE) {
    refuse("expected isolated Preview database and three distinct canonical roles");
  }
  return Object.freeze({ database: DATABASE, principal: MIGRATION_ROLE });
}

async function checkActualDatabaseIdentity(sql) {
  const rows = await sql.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (rows.length !== 1 ||
      rows[0]?.database_name !== DATABASE ||
      rows[0]?.principal_name !== MIGRATION_ROLE) {
    refuse("actual SQL connection does not match the Preview migration principal");
  }
}

/**
 * Shared migration transaction: re-read the real schema AFTER acquiring the
 * release lock, and either apply all original SQL or nothing. Deliberately
 * no new retention/cleanup policy, Worker flag, or production path.
 */
export async function executeUlcLifecycleRepairTransaction(sql, plan, { assertIdentity } = {}) {
  if (!sql || typeof sql.unsafe !== "function" || typeof sql.begin !== "function") {
    refuse("PostgreSQL transaction client unavailable");
  }
  if (!Array.isArray(plan) || plan.length !== 3) {
    refuse("canonical migration plan must contain exactly three entries");
  }
  return sql.begin(async tx => {
    if (assertIdentity) await assertIdentity(tx);
    await tx.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 404)");
    const before = await inspectUlcLifecycleSchema(tx);
    if (before.state === "current") return "already-current";
    if (before.state !== "migration-required") {
      refuse("unexpected lifecycle schema state");
    }
    for (const migration of plan) {
      for (const statement of migration.statements) {
        await tx.unsafe(statement);
      }
    }
    if ((await inspectUlcLifecycleSchema(tx)).state !== "current") {
      refuse("post-migration schema check failed; rolling back");
    }
    return "applied";
  });
}

async function withPreviewConnection(input, options, task) {
  assertUlcLifecyclePreviewScope(input);
  const plan = await loadUlcLifecycleRepairPlan();
  const factory = options.databaseFactory ?? createPostgresDatabase;
  if (typeof factory !== "function") refuse("database factory unavailable");
  const database = factory(input.migrationDatabaseUrl);
  try {
    await checkActualDatabaseIdentity(database.client);
    return await task(database.client, plan);
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function inspectUlcLifecyclePreview(input, options = {}) {
  return withPreviewConnection(input, options, async sql => {
    const state = await inspectUlcLifecycleSchema(sql);
    return Object.freeze({
      state: state.state,
      database: DATABASE,
      requiredMigrations: state.requiredMigrations,
      productionChanged: false,
    });
  });
}

export async function migrateUlcLifecyclePreview(input, options = {}) {
  if (input?.apply !== true ||
      input?.backupConfirmed !== true ||
      input?.restoreConfirmed !== true ||
      input?.approvalRef !== APPROVAL) {
    refuse("apply + backup + restore evidence + exact operator approval required");
  }
  return withPreviewConnection(input, options, async (sql, plan) => {
    const outcome = await executeUlcLifecycleRepairTransaction(sql, plan, {
      assertIdentity: checkActualDatabaseIdentity,
    });
    return Object.freeze({
      state: outcome,
      database: DATABASE,
      productionChanged: false,
    });
  });
}

/**
 * No new deletion-marker table is writable by either Preview runtime login.
 * Read-only verification; actual owner grants require a separate security PR.
 */
export async function verifyUlcLifecyclePreviewMarkerPrivileges(input, options = {}) {
  return withPreviewConnection(input, options, async sql => {
    const schema = await inspectUlcLifecycleSchema(sql);
    if (schema.state !== "current") {
      refuse("cannot inspect marker privileges before complete lifecycle schema");
    }
    const rows = await sql.unsafe(`
      SELECT roles.name AS principal_name, markers.name AS table_name,
        has_table_privilege(roles.name, 'public.' || markers.name, 'INSERT') AS can_insert,
        has_table_privilege(roles.name, 'public.' || markers.name, 'UPDATE') AS can_update,
        has_table_privilege(roles.name, 'public.' || markers.name, 'DELETE') AS can_delete
      FROM (VALUES
         ('appbasis_ulc_linz_preview_application'),
         ('appbasis_ulc_linz_preview_security_log')
      ) AS roles(name)
      CROSS JOIN (VALUES
         ('appbasis_training_block_favorite_deletion'),
         ('appbasis_training_block_usage_subject'),
         ('appbasis_training_block_usage_subject_deletion'),
         ('appbasis_training_documentation_subject_deletion')
      ) AS markers(name)
    `);
    if (rows.length !== 8 ||
        rows.some(row => row.can_insert !== false ||
          row.can_update !== false || row.can_delete !== false)) {
      refuse("new lifecycle/marker tables expose unauthorized Preview runtime DML");
    }
    return Object.freeze({
      state: "verified",
      runtimeMutationRightsDenied: true,
      productionChanged: false,
    });
  });
}

function isMainModule() {
  return typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const cmd = process.argv[2];
    const env = process.env;
    const input = {
      migrationDatabaseUrl: env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: env.APPBASIS_SECURITY_LOG_DATABASE_URL,
      apply: env.APPBASIS_APPLY_P04_LIFECYCLE_PREVIEW === "1",
      backupConfirmed: env.APPBASIS_P04_BACKUP_CONFIRMED === "1",
      restoreConfirmed: env.APPBASIS_P04_RESTORE_CONFIRMED === "1",
      approvalRef: env.APPBASIS_P04_APPROVAL_REF,
    };
    const result = cmd === "inspect"
      ? await inspectUlcLifecyclePreview(input)
      : cmd === "migrate"
        ? await migrateUlcLifecyclePreview(input)
        : cmd === "verify-privileges"
          ? await verifyUlcLifecyclePreviewMarkerPrivileges(input)
          : null;
    if (result === null) refuse("expected inspect, migrate or verify-privileges");
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(error instanceof Error
      ? error.message : "Preview lifecycle operation failed");
    process.exitCode = 1;
  }
}

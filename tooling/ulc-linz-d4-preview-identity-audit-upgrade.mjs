import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  validatePostgresConnectionString,
} from "./database-migration-executor.mjs";
import { loadGeneratedAppPreviewMigrationPlan } from "./generated-app-preview-migrate.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import { ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const TARGET_DATABASE = "appbasis_ulc_linz_preview";
const TARGET_ROLE = "appbasis_ulc_linz_preview_migration";
const TARGET_MIGRATION =
  "packages/identity/drizzle/0002_appbasis_identity_provisioning_audit.sql";
const TARGET_COLUMNS = Object.freeze([
  "provisioning_owner",
  "actor_principal_id",
  "reason",
]);
const TARGET_CONSTRAINT =
  "appbasis_identity_operation_provisioning_audit_shape_check";

export class UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError";
  }
}

export class UlcLinzD4PreviewIdentityAuditUpgradeExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzD4PreviewIdentityAuditUpgradeExecutionError";
  }
}

export async function loadUlcLinzD4PreviewIdentityAuditUpgradePlan(
  { repositoryRoot = process.cwd() } = {},
  { loadPlan = loadGeneratedAppPreviewMigrationPlan } = {},
) {
  const { contract, plan } = await loadPlan({
    appId: "ulc-linz",
    repositoryRoot: resolve(repositoryRoot),
  });
  const identityOwner = contract?.databaseManifest?.owners?.find(
    (owner) => owner.id === "identity",
  );
  const identityMigrations = plan?.filter((migration) => migration.ownerId === "identity");
  if (
    identityOwner?.schemaVersion !== 3 ||
    identityOwner.root !== "packages/identity" ||
    identityOwner.migrations?.length !== 3 ||
    identityOwner.migrations.at(-1) !== TARGET_MIGRATION ||
    identityMigrations?.length !== 3 ||
    identityMigrations.at(-1)?.relativePath !== TARGET_MIGRATION ||
    identityMigrations.at(-1)?.statements?.length !== 2
  ) {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview identity audit delta does not match canonical schema v3.",
    );
  }
  const migration = identityMigrations.at(-1);
  const sql = migration.statements.join("\n");
  if (
    !sql.includes(TARGET_CONSTRAINT) ||
    !TARGET_COLUMNS.every((column) => sql.includes(column))
  ) {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview identity audit migration shape is invalid.",
    );
  }
  return Object.freeze({
    ownerId: "identity",
    migration: Object.freeze({
      relativePath: TARGET_MIGRATION,
      statements: Object.freeze([...migration.statements]),
    }),
  });
}

export async function applyUlcLinzD4PreviewIdentityAuditUpgrade(
  { connectionString } = {},
  {
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcLinzD4PreviewIdentityAuditUpgradePlan,
  } = {},
) {
  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 identity audit migration requires the dedicated preview URL.",
    );
  }
  if (origin.user !== TARGET_ROLE) {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 identity audit migration requires the isolated migration principal.",
    );
  }
  const normalizedConnectionString = validatePostgresConnectionString(
    connectionString,
    {
      expectedDatabase: TARGET_DATABASE,
      ConfigurationError:
        UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError,
    },
  );
  const plan = await loadPlan();
  if (
    plan?.ownerId !== "identity" ||
    plan?.migration?.relativePath !== TARGET_MIGRATION ||
    !Array.isArray(plan.migration.statements) ||
    plan.migration.statements.length !== 2
  ) {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 identity audit upgrade plan is incomplete or drifted.",
    );
  }
  const database = databaseFactory(normalizedConnectionString);
  let primaryError;
  try {
    await database.client.begin(async (transaction) => {
      const identity = await transaction.unsafe(
        "SELECT current_database() AS database_name, current_user AS principal_name",
      );
      if (
        identity?.length !== 1 ||
        identity[0]?.database_name !== TARGET_DATABASE ||
        identity[0]?.principal_name !== TARGET_ROLE
      ) {
        throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
          "ULC D4 identity audit migration connected to an unexpected database or role.",
        );
      }
      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:preview-identity-audit-v3', 0))",
      );
      const baseline = await transaction.unsafe(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
      );
      const tables = new Set(baseline.map((row) => row.tablename));
      for (const required of [
        "appbasis_identity_operation",
        "appbasis_identity_security_state",
        "ulc_linz_trainer_identity_audit",
      ]) {
        if (!tables.has(required)) {
          throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
            "ULC D4 identity audit migration requires the established trainer-audit baseline.",
          );
        }
      }
      const before = await identityAuditShape(transaction);
      if (before.columns.length !== 0 || before.constraints.length !== 0) {
        throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
          "ULC D4 identity audit migration target is already or partially present.",
        );
      }
      for (const statement of plan.migration.statements) {
        await transaction.unsafe(statement);
      }
      const after = await identityAuditShape(transaction);
      if (
        after.columns.length !== TARGET_COLUMNS.length ||
        !TARGET_COLUMNS.every((column) => after.columns.includes(column)) ||
        after.constraints.length !== 1 ||
        !validConstraint(after.constraints[0]?.definition)
      ) {
        throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
          "ULC D4 identity audit migration did not reach the expected v3 schema.",
        );
      }
    });
    return Object.freeze({
      state: "applied",
      application: "ulc-linz",
      ownerId: "identity",
      migrationPath: TARGET_MIGRATION,
      migrationCount: 1,
      statementCount: plan.migration.statements.length,
    });
  } catch (error) {
    primaryError = error;
    if (error instanceof UlcLinzD4PreviewIdentityAuditUpgradeExecutionError) {
      throw error;
    }
    throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
      "ULC D4 identity audit migration failed and was rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
          "ULC D4 identity audit database connection could not be closed.",
        );
      }
    }
  }
}

async function identityAuditShape(client) {
  const columns = await client.unsafe(
    `SELECT attribute.attname AS column_name
       FROM pg_catalog.pg_attribute AS attribute
       JOIN pg_catalog.pg_class AS relation
         ON relation.oid = attribute.attrelid
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'appbasis_identity_operation'
        AND attribute.attname IN ('provisioning_owner', 'actor_principal_id', 'reason')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped`,
  );
  const constraints = await client.unsafe(
    `SELECT pg_catalog.pg_get_constraintdef(guard.oid) AS definition
       FROM pg_catalog.pg_constraint AS guard
       JOIN pg_catalog.pg_class AS relation
         ON relation.oid = guard.conrelid
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'appbasis_identity_operation'
        AND guard.conname = '${TARGET_CONSTRAINT}'
        AND guard.contype = 'c'`,
  );
  if (!Array.isArray(columns) || !Array.isArray(constraints)) {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeExecutionError(
      "ULC D4 identity audit migration inventory is unavailable.",
    );
  }
  return {
    columns: columns.map((row) => row.column_name),
    constraints,
  };
}

function validConstraint(definition) {
  return typeof definition === "string" &&
    definition.includes("CHECK") &&
    definition.includes("kind") &&
    TARGET_COLUMNS.every((column) => definition.includes(column));
}

export function assertUlcLinzD4PreviewIdentityAuditUpgradeEnvironment(
  environment = process.env,
) {
  if (
    environment.APPBASIS_GENERATED_APP_ID !== "ulc-linz" ||
    environment.APPBASIS_MIGRATION_TARGET !== TARGET_DATABASE
  ) {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 identity audit migration requires the exact isolated preview target.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new UlcLinzD4PreviewIdentityAuditUpgradeConfigurationError(
      "ULC D4 identity audit migration requires explicit apply authorization.",
    );
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assertUlcLinzD4PreviewIdentityAuditUpgradeEnvironment();
    const result = await applyUlcLinzD4PreviewIdentityAuditUpgrade({
      connectionString: process.env.APPBASIS_DATABASE_URL,
    });
    console.log(
      `ULC D4 identity audit v3 migration PASS: ${result.statementCount} statements applied.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "ULC D4 identity audit migration failed.",
    );
    process.exitCode = 1;
  }
}

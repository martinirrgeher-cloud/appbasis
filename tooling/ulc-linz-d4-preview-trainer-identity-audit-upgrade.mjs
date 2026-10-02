import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  loadRepositoryOwnerMigrationPlan,
  validatePostgresConnectionString,
} from "./database-migration-executor.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import {
  ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
} from "./ulc-linz-d4-preview-hyperdrive.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";

const EXPECTED_DATABASE = ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.database;
const TARGET_MIGRATION =
  "apps/ulc-linz/migrations/0005_ulc_linz_trainer_identity_audit.sql";
const REQUIRED_BASELINE_TABLES = Object.freeze([
  "appbasis_person",
  "appbasis_permission_principal",
  "ulc_linz_membership",
  "ulc_linz_security_event_log",
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_trainer",
  "appbasis_athlete_group_membership",
  "appbasis_trainer_group_membership",
  "appbasis_athletes_deletion",
  "ulc_linz_training_session",
  "ulc_linz_training_attendance",
]);
const TARGET_TABLES = Object.freeze([
  "ulc_linz_trainer_identity_audit",
]);

export class UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError";
  }
}

export class UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError";
  }
}

export async function loadUlcLinzD4PreviewTrainerIdentityAuditUpgradePlan(
  { repositoryRoot = process.cwd() } = {},
  { loadOwnerMigrationPlan = loadRepositoryOwnerMigrationPlan } = {},
) {
  if (typeof loadOwnerMigrationPlan !== "function") {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade plan loader is unavailable.",
    );
  }
  const targetIndex =
    ULC_LINZ_LIFECYCLE_DATABASE_OWNER.migrations.indexOf(TARGET_MIGRATION);
  if (
    ULC_LINZ_LIFECYCLE_DATABASE_OWNER.schemaVersion < 6 ||
    targetIndex < 0
  ) {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade owner contract is not the expected E4E-A2 target.",
    );
  }

  const ownerPlan = await loadOwnerMigrationPlan({
    repositoryRoot: resolve(repositoryRoot),
    owner: ULC_LINZ_LIFECYCLE_DATABASE_OWNER,
    ConfigurationError: UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError,
  });
  const matches = ownerPlan.filter(
    (migration) => migration.relativePath === TARGET_MIGRATION,
  );
  if (
    matches.length !== 1 ||
    ownerPlan[targetIndex]?.relativePath !== TARGET_MIGRATION ||
    !Array.isArray(matches[0]?.statements) ||
    matches[0].statements.length === 0
  ) {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade migration delta is unavailable or ambiguous.",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    ownerId: ULC_LINZ_LIFECYCLE_DATABASE_OWNER.id,
    migration: Object.freeze({
      relativePath: matches[0].relativePath,
      statements: Object.freeze([...matches[0].statements]),
    }),
  });
}

export async function applyUlcLinzD4PreviewTrainerIdentityAuditUpgrade(
  { connectionString } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcLinzD4PreviewTrainerIdentityAuditUpgradePlan,
  } = {},
) {
  if (typeof loadPlan !== "function") {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade plan resolver is unavailable.",
    );
  }
  if (typeof databaseFactory !== "function") {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade database factory is unavailable.",
    );
  }

  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade requires the dedicated direct preview database credential.",
    );
  }
  const normalizedConnectionString = validatePostgresConnectionString(
    connectionString,
    {
      expectedDatabase: EXPECTED_DATABASE,
      ConfigurationError:
        UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError,
    },
  );
  const plan = await loadPlan({ repositoryRoot });

  let database;
  try {
    database = databaseFactory(normalizedConnectionString);
  } catch {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
      "ULC D4 preview trainer identity audit upgrade database connection could not be created.",
    );
  }

  let primaryError;
  let statementCount = 0;
  try {
    await database.client.begin(async (transaction) => {
      const identity = await transaction.unsafe(
        "SELECT current_database() AS database_name, current_user AS principal_name",
      );
      if (
        !Array.isArray(identity) ||
        identity.length !== 1 ||
        identity[0]?.database_name !== EXPECTED_DATABASE ||
        identity[0]?.principal_name !== origin.user
      ) {
        throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
          "ULC D4 preview trainer identity audit upgrade database identity does not match the validated migration credential.",
        );
      }

      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:preview-trainer-identity-audit-upgrade', 0))",
      );

      const before = await publicTableInventory(transaction);
      if (!REQUIRED_BASELINE_TABLES.every((table) => before.has(table))) {
        throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
          "ULC D4 preview trainer identity audit upgrade requires the complete established Stammdaten baseline.",
        );
      }
      if (TARGET_TABLES.some((table) => before.has(table))) {
        throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
          "ULC D4 preview trainer identity audit schema appears already or partially applied.",
        );
      }

      for (const statement of plan.migration.statements) {
        await transaction.unsafe(statement);
        statementCount += 1;
      }

      const after = await publicTableInventory(transaction);
      if (!TARGET_TABLES.every((table) => after.has(table))) {
        throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
          "ULC D4 preview trainer identity audit upgrade did not reach the expected audit schema.",
        );
      }
    });

    return Object.freeze({
      state: "applied",
      application: "ulc-linz",
      ownerId: plan.ownerId,
      migrationPath: plan.migration.relativePath,
      migrationCount: 1,
      statementCount,
    });
  } catch (error) {
    primaryError = error;
    if (error instanceof UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError) {
      throw error;
    }
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
      "ULC D4 preview trainer identity audit upgrade transaction failed and was rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
          "ULC D4 preview trainer identity audit upgrade database connection could not be closed cleanly.",
        );
      }
    }
  }
}

export function assertUlcLinzD4PreviewTrainerIdentityAuditUpgradeEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade requires appId ulc-linz.",
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== EXPECTED_DATABASE) {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade targets the wrong database.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeConfigurationError(
      "ULC D4 preview trainer identity audit upgrade requires explicit migration approval.",
    );
  }
}

async function publicTableInventory(transaction) {
  const rows = await transaction.unsafe(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  if (!Array.isArray(rows)) {
    throw new UlcLinzD4PreviewTrainerIdentityAuditUpgradeExecutionError(
      "ULC D4 preview trainer identity audit table inventory is unavailable.",
    );
  }
  return new Set(rows.map((row) => row?.tablename).filter(Boolean));
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    assertUlcLinzD4PreviewTrainerIdentityAuditUpgradeEnvironment();
    const result = await applyUlcLinzD4PreviewTrainerIdentityAuditUpgrade({
      connectionString: process.env.APPBASIS_DATABASE_URL,
    });
    console.log(
      `ULC D4 preview trainer identity audit upgrade PASS: ${result.statementCount} statements applied.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC D4 preview trainer identity audit upgrade failed.",
    );
    process.exitCode = 1;
  }
}

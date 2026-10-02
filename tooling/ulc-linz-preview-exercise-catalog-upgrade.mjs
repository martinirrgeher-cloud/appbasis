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
import {
  isCanonicalUlcPreviewIdentityAuditShape,
  readUlcPreviewIdentityAuditShape,
} from "./ulc-linz-d4-preview-identity-audit-shape.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";

const EXPECTED_DATABASE = ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.database;
const TARGET_MIGRATION =
  "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql";
const TARGET_TABLES = Object.freeze([
  "ulc_linz_exercise_catalog_item",
  "ulc_linz_exercise_parameter",
  "ulc_linz_exercise_group",
  "ulc_linz_exercise_favorite",
]);
const REQUIRED_BASELINE_TABLES = Object.freeze([
  "appbasis_person",
  "appbasis_identity_operation",
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
  "ulc_linz_trainer_identity_audit",
  "ulc_linz_training_module_group",
]);

export class UlcLinzPreviewExerciseCatalogUpgradeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzPreviewExerciseCatalogUpgradeConfigurationError";
  }
}

export class UlcLinzPreviewExerciseCatalogUpgradeExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzPreviewExerciseCatalogUpgradeExecutionError";
  }
}

export async function loadUlcLinzPreviewExerciseCatalogUpgradePlan(
  { repositoryRoot = process.cwd() } = {},
  { loadOwnerMigrationPlan = loadRepositoryOwnerMigrationPlan } = {},
) {
  if (typeof loadOwnerMigrationPlan !== "function") {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog upgrade plan loader is unavailable.",
    );
  }
  if (
    ULC_LINZ_LIFECYCLE_DATABASE_OWNER.schemaVersion !== 8 ||
    ULC_LINZ_LIFECYCLE_DATABASE_OWNER.migrations.at(-1) !== TARGET_MIGRATION
  ) {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog owner contract is not the expected schema-v8 target.",
    );
  }

  const ownerPlan = await loadOwnerMigrationPlan({
    repositoryRoot: resolve(repositoryRoot),
    owner: ULC_LINZ_LIFECYCLE_DATABASE_OWNER,
    ConfigurationError:
      UlcLinzPreviewExerciseCatalogUpgradeConfigurationError,
  });
  const matches = ownerPlan.filter(
    (migration) => migration.relativePath === TARGET_MIGRATION,
  );
  if (
    matches.length !== 1 ||
    ownerPlan.at(-1)?.relativePath !== TARGET_MIGRATION ||
    !Array.isArray(matches[0]?.statements) ||
    matches[0].statements.length === 0
  ) {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog migration delta is unavailable or ambiguous.",
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

export async function applyUlcLinzPreviewExerciseCatalogUpgrade(
  { connectionString } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcLinzPreviewExerciseCatalogUpgradePlan,
  } = {},
) {
  if (typeof loadPlan !== "function" || typeof databaseFactory !== "function") {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog upgrade dependencies are unavailable.",
    );
  }

  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog upgrade requires the dedicated direct preview migration credential.",
    );
  }
  const normalizedConnectionString = validatePostgresConnectionString(
    connectionString,
    {
      expectedDatabase: EXPECTED_DATABASE,
      ConfigurationError:
        UlcLinzPreviewExerciseCatalogUpgradeConfigurationError,
    },
  );
  const plan = await loadPlan({ repositoryRoot });

  let database;
  try {
    database = databaseFactory(normalizedConnectionString);
  } catch {
    throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
      "ULC preview exercise catalog database connection could not be created.",
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
        throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
          "ULC preview exercise catalog database identity does not match the validated migration credential.",
        );
      }

      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:preview-exercise-catalog-upgrade', 0))",
      );

      const before = await publicTableInventory(transaction);
      if (!REQUIRED_BASELINE_TABLES.every((table) => before.has(table))) {
        throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
          "ULC preview exercise catalog requires the complete established E4E-D baseline.",
        );
      }
      if (TARGET_TABLES.some((table) => before.has(table))) {
        throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
          "ULC preview exercise catalog schema appears already or partially applied.",
        );
      }
      const identityAuditShape =
        await readUlcPreviewIdentityAuditShape(transaction);
      if (!isCanonicalUlcPreviewIdentityAuditShape(identityAuditShape)) {
        throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
          "ULC preview exercise catalog requires canonical identity schema v3.",
        );
      }

      for (const statement of plan.migration.statements) {
        await transaction.unsafe(statement);
        statementCount += 1;
      }

      const after = await publicTableInventory(transaction);
      if (!TARGET_TABLES.every((table) => after.has(table))) {
        throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
          "ULC preview exercise catalog upgrade did not reach schema v8.",
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
    if (
      error instanceof
      UlcLinzPreviewExerciseCatalogUpgradeExecutionError
    ) {
      throw error;
    }
    throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
      "ULC preview exercise catalog transaction failed and was rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
          "ULC preview exercise catalog database connection could not be closed cleanly.",
        );
      }
    }
  }
}

export function assertUlcLinzPreviewExerciseCatalogUpgradeEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog upgrade requires appId ulc-linz.",
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== EXPECTED_DATABASE) {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog upgrade targets the wrong database.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new UlcLinzPreviewExerciseCatalogUpgradeConfigurationError(
      "ULC preview exercise catalog upgrade requires explicit migration approval.",
    );
  }
}

async function publicTableInventory(transaction) {
  const rows = await transaction.unsafe(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  if (!Array.isArray(rows)) {
    throw new UlcLinzPreviewExerciseCatalogUpgradeExecutionError(
      "ULC preview exercise catalog table inventory is unavailable.",
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
    assertUlcLinzPreviewExerciseCatalogUpgradeEnvironment();
    const result = await applyUlcLinzPreviewExerciseCatalogUpgrade({
      connectionString: process.env.APPBASIS_DATABASE_URL,
    });
    console.log(
      `ULC preview exercise catalog upgrade PASS: ${result.statementCount} statements applied.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC preview exercise catalog upgrade failed.",
    );
    process.exitCode = 1;
  }
}

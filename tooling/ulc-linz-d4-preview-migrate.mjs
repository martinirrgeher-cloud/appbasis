import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  GeneratedAppPreviewMigrationConfigurationError,
  GeneratedAppPreviewMigrationExecutionError,
  loadGeneratedAppPreviewMigrationPlan,
} from "./generated-app-preview-migrate.mjs";
import {
  applyRepositoryMigrationPlan,
  migrationStatements,
} from "./database-migration-executor.mjs";
import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const OVERLAY_RELATIVE_PATH =
  "apps/ulc-linz/preview-migrations/0000_d4_security_role_isolation.sql";
const OVERLAY_OWNER_ID = "ulc-linz-d4-preview-security-isolation";

export async function loadUlcLinzD4PreviewMigrationPlan() {
  const { contract, plan } = await loadGeneratedAppPreviewMigrationPlan({
    appId: "ulc-linz",
  });
  if (contract.definition.appId !== "ulc-linz") {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "ULC D4 preview migration resolved an unexpected application.",
    );
  }

  const overlayPath = path.resolve(
    repositoryRoot,
    ...OVERLAY_RELATIVE_PATH.split("/"),
  );
  let sql;
  try {
    sql = await readFile(overlayPath, "utf8");
  } catch {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "ULC D4 preview security isolation migration could not be read.",
    );
  }
  const statements = migrationStatements(sql);
  if (statements.length === 0) {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "ULC D4 preview security isolation migration is empty.",
    );
  }

  return Object.freeze({
    contract,
    plan: Object.freeze([
      ...plan,
      Object.freeze({
        ownerId: OVERLAY_OWNER_ID,
        relativePath: OVERLAY_RELATIVE_PATH,
        statements: Object.freeze([...statements]),
      }),
    ]),
  });
}

export async function applyUlcLinzD4PreviewMigrations(
  { connectionString } = {},
  { createDatabase = createPostgresDatabase } = {},
) {
  const { contract, plan } = await loadUlcLinzD4PreviewMigrationPlan();
  const result = await applyRepositoryMigrationPlan({
    connectionString,
    expectedDatabase: contract.target.database,
    plan,
    createDatabase,
    ConfigurationError: GeneratedAppPreviewMigrationConfigurationError,
    ExecutionError: GeneratedAppPreviewMigrationExecutionError,
    emptySchemaMessage:
      "ULC D4 preview migrations require an empty public schema.",
    transactionFailedMessage:
      "ULC D4 preview migration transaction failed and was rolled back.",
  });
  return Object.freeze({ contract, ...result });
}

export async function assertUlcLinzD4PreviewMigrationEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "ULC D4 preview migration requires appId ulc-linz.",
    );
  }
  const contract = await loadGeneratedAppPreviewContract(
    repositoryRoot,
    "ulc-linz",
  );
  if (environment.APPBASIS_MIGRATION_TARGET !== contract.target.database) {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "APPBASIS_MIGRATION_TARGET does not match the dedicated ULC preview database.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "APPBASIS_APPLY_MIGRATIONS must explicitly confirm migration execution.",
    );
  }
  return contract;
}

async function main() {
  await assertUlcLinzD4PreviewMigrationEnvironment();
  const result = await applyUlcLinzD4PreviewMigrations({
    connectionString: process.env.APPBASIS_DATABASE_URL,
  });
  console.log(
    `ULC D4 preview migrations PASS: ${result.migrationCount} migrations applied atomically.`,
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    if (
      error instanceof GeneratedAppPreviewMigrationConfigurationError ||
      error instanceof GeneratedAppPreviewMigrationExecutionError
    ) {
      console.error(error.message);
    } else {
      console.error("ULC D4 preview migration execution failed.");
    }
    process.exitCode = 1;
  }
}

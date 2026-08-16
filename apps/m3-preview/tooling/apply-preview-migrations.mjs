import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
} from "../../../tooling/database-migration-executor.mjs";

export const M3_PREVIEW_APP_ID = "m3-preview";
export const M3_PREVIEW_MIGRATION_TARGET = "m3-preview";
export const M3_PREVIEW_DATABASE_NAME = "appbasis_m3_preview";

const repositoryRoot = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const manifestPath = path.join(
  repositoryRoot,
  "apps",
  M3_PREVIEW_APP_ID,
  "appbasis.database.json",
);
const expectedOwners = Object.freeze({
  identity: "packages/identity",
  permissions: "packages/permissions",
  tasks: "modules/tasks",
});

export class M3PreviewMigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "M3PreviewMigrationConfigurationError";
  }
}

export class M3PreviewMigrationExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "M3PreviewMigrationExecutionError";
  }
}

export function loadM3PreviewMigrationPlan() {
  return loadRepositoryMigrationPlan({
    repositoryRoot,
    manifestPath,
    expectedApplication: M3_PREVIEW_APP_ID,
    expectedOwners,
    ConfigurationError: M3PreviewMigrationConfigurationError,
  });
}

export async function applyM3PreviewMigrations({ connectionString }) {
  const plan = await loadM3PreviewMigrationPlan();
  return applyRepositoryMigrationPlan({
    connectionString,
    expectedDatabase: M3_PREVIEW_DATABASE_NAME,
    plan,
    createDatabase: createPostgresDatabase,
    ConfigurationError: M3PreviewMigrationConfigurationError,
    ExecutionError: M3PreviewMigrationExecutionError,
    emptySchemaMessage: "m3-preview migrations require an empty public schema.",
    transactionFailedMessage:
      "m3-preview migration transaction failed and was rolled back.",
  });
}

export function assertM3PreviewMigrationEnvironment(environment = process.env) {
  if (environment.APPBASIS_GENERATED_APP_ID !== M3_PREVIEW_APP_ID) {
    throw new M3PreviewMigrationConfigurationError(
      "APPBASIS_GENERATED_APP_ID must explicitly select m3-preview.",
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== M3_PREVIEW_MIGRATION_TARGET) {
    throw new M3PreviewMigrationConfigurationError(
      "APPBASIS_MIGRATION_TARGET must explicitly select m3-preview.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new M3PreviewMigrationConfigurationError(
      "APPBASIS_APPLY_MIGRATIONS must explicitly confirm migration execution.",
    );
  }
}

async function main() {
  assertM3PreviewMigrationEnvironment();
  const result = await applyM3PreviewMigrations({
    connectionString: process.env.APPBASIS_DATABASE_URL,
  });
  console.log(
    `m3-preview migrations PASS: ${result.migrationCount} manifest migrations applied atomically.`,
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
      error instanceof M3PreviewMigrationConfigurationError ||
      error instanceof M3PreviewMigrationExecutionError
    ) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.error("m3-preview migration execution failed.");
      process.exitCode = 1;
    }
  }
}

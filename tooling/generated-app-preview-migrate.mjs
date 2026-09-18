import { fileURLToPath } from "node:url";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";

import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";
import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";
import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
} from "./database-migration-executor.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

export class GeneratedAppPreviewMigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeneratedAppPreviewMigrationConfigurationError";
  }
}

export class GeneratedAppPreviewMigrationExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeneratedAppPreviewMigrationExecutionError";
  }
}

export async function loadGeneratedAppPreviewMigrationPlan({ appId } = {}) {
  const contract = await loadGeneratedAppPreviewContract(repositoryRoot, appId);
  const canonicalManifest = createGeneratedDatabaseManifest(contract.definition);
  if (canonicalManifest === null) {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "Generated preview app does not declare a database contract.",
    );
  }
  if (!isDeepStrictEqual(contract.databaseManifest, canonicalManifest)) {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "Generated preview database manifest drifted from the canonical app composition.",
    );
  }

  const expectedOwners = Object.fromEntries(
    canonicalManifest.owners.map((owner) => [owner.id, owner.root]),
  );
  const manifestPath = path.join(
    repositoryRoot,
    "apps",
    contract.definition.appId,
    "appbasis.database.json",
  );
  const plan = await loadRepositoryMigrationPlan({
    repositoryRoot,
    manifestPath,
    expectedApplication: contract.definition.appId,
    expectedOwners,
    ConfigurationError: GeneratedAppPreviewMigrationConfigurationError,
  });
  return Object.freeze({ contract, plan });
}

export async function applyGeneratedAppPreviewMigrations({
  appId,
  connectionString,
} = {}) {
  const { contract, plan } = await loadGeneratedAppPreviewMigrationPlan({ appId });
  const result = await applyRepositoryMigrationPlan({
    connectionString,
    expectedDatabase: contract.target.database,
    plan,
    createDatabase: createPostgresDatabase,
    ConfigurationError: GeneratedAppPreviewMigrationConfigurationError,
    ExecutionError: GeneratedAppPreviewMigrationExecutionError,
    emptySchemaMessage: "Generated app preview migrations require an empty public schema.",
    transactionFailedMessage:
      "Generated app preview migration transaction failed and was rolled back.",
  });
  return Object.freeze({ contract, ...result });
}

export async function assertGeneratedAppPreviewMigrationEnvironment(
  environment = process.env,
) {
  const contract = await loadGeneratedAppPreviewContract(
    repositoryRoot,
    environment.APPBASIS_GENERATED_APP_ID,
  );
  if (environment.APPBASIS_MIGRATION_TARGET !== contract.target.migrationTarget) {
    throw new GeneratedAppPreviewMigrationConfigurationError(
      "APPBASIS_MIGRATION_TARGET does not match the selected generated app preview.",
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
  const contract = await assertGeneratedAppPreviewMigrationEnvironment();
  const result = await applyGeneratedAppPreviewMigrations({
    appId: contract.definition.appId,
    connectionString: process.env.APPBASIS_DATABASE_URL,
  });
  console.log(
    `Generated app preview migrations PASS: ${result.migrationCount} manifest migrations applied atomically for ${contract.definition.appId}.`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (
      error instanceof GeneratedAppPreviewMigrationConfigurationError ||
      error instanceof GeneratedAppPreviewMigrationExecutionError
    ) {
      console.error(error.message);
    } else {
      console.error("Generated app preview migration execution failed.");
    }
    process.exitCode = 1;
  }
}

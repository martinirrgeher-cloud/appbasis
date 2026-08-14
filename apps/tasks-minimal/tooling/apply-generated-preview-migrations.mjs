import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/node-runtime';
import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
} from '../../../tooling/database-migration-executor.mjs';

export const GENERATED_PREVIEW_APP_ID = 'tasks-minimal';
export const GENERATED_PREVIEW_MIGRATION_TARGET = 'generated-tasks-preview';
export const GENERATED_PREVIEW_DATABASE_NAME = 'appbasis_tasks_preview';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(
  repositoryRoot,
  'apps',
  GENERATED_PREVIEW_APP_ID,
  'appbasis.database.json',
);
const expectedOwners = Object.freeze({
  identity: 'packages/identity',
  permissions: 'packages/permissions',
  tasks: 'modules/tasks',
});

export class GeneratedPreviewMigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeneratedPreviewMigrationConfigurationError';
  }
}

export class GeneratedPreviewMigrationExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeneratedPreviewMigrationExecutionError';
  }
}

export function loadGeneratedPreviewMigrationPlan() {
  return loadRepositoryMigrationPlan({
    repositoryRoot,
    manifestPath,
    expectedApplication: GENERATED_PREVIEW_APP_ID,
    expectedOwners,
    ConfigurationError: GeneratedPreviewMigrationConfigurationError,
  });
}

export async function applyGeneratedPreviewMigrations({ connectionString }) {
  const plan = await loadGeneratedPreviewMigrationPlan();
  return applyRepositoryMigrationPlan({
    connectionString,
    expectedDatabase: GENERATED_PREVIEW_DATABASE_NAME,
    plan,
    createDatabase: createPostgresDatabase,
    ConfigurationError: GeneratedPreviewMigrationConfigurationError,
    ExecutionError: GeneratedPreviewMigrationExecutionError,
    emptySchemaMessage: 'Generated preview migrations require an empty public schema.',
    transactionFailedMessage:
      'Generated preview migration transaction failed and was rolled back.',
  });
}

export function assertGeneratedPreviewMigrationEnvironment(environment = process.env) {
  if (environment.APPBASIS_GENERATED_APP_ID !== GENERATED_PREVIEW_APP_ID) {
    throw new GeneratedPreviewMigrationConfigurationError(
      'APPBASIS_GENERATED_APP_ID must explicitly select tasks-minimal.',
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== GENERATED_PREVIEW_MIGRATION_TARGET) {
    throw new GeneratedPreviewMigrationConfigurationError(
      'APPBASIS_MIGRATION_TARGET must explicitly select generated-tasks-preview.',
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== '1') {
    throw new GeneratedPreviewMigrationConfigurationError(
      'APPBASIS_APPLY_MIGRATIONS must explicitly confirm migration execution.',
    );
  }
}

async function main() {
  assertGeneratedPreviewMigrationEnvironment();
  const result = await applyGeneratedPreviewMigrations({
    connectionString: process.env.APPBASIS_DATABASE_URL,
  });
  console.log(
    `Generated tasks preview migrations PASS: ${result.migrationCount} manifest migrations applied atomically.`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (
      error instanceof GeneratedPreviewMigrationConfigurationError ||
      error instanceof GeneratedPreviewMigrationExecutionError
    ) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.error('Generated preview migration execution failed.');
      process.exitCode = 1;
    }
  }
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/node-runtime';
import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
  migrationStatements as splitMigrationStatements,
  validatePostgresConnectionString as validateRepositoryPostgresConnectionString,
} from '../../../tooling/database-migration-executor.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
const expectedOwners = Object.freeze({
  identity: 'packages/identity',
  permissions: 'packages/permissions',
  tasks: 'modules/tasks',
});

export class ReferenceMigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReferenceMigrationConfigurationError';
  }
}

export class ReferenceMigrationExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReferenceMigrationExecutionError';
  }
}

export function loadReferenceMigrationPlan() {
  return loadRepositoryMigrationPlan({
    repositoryRoot,
    manifestPath,
    expectedApplication: 'reference',
    expectedOwners,
    ConfigurationError: ReferenceMigrationConfigurationError,
  });
}

export async function applyReferenceMigrations({ connectionString }) {
  const plan = await loadReferenceMigrationPlan();
  return applyRepositoryMigrationPlan({
    connectionString,
    plan,
    createDatabase: createPostgresDatabase,
    ConfigurationError: ReferenceMigrationConfigurationError,
    ExecutionError: ReferenceMigrationExecutionError,
    emptySchemaMessage: 'Reference migrations require an empty public schema.',
    transactionFailedMessage: 'Reference migration transaction failed and was rolled back.',
  });
}

export function migrationStatements(sql) {
  return splitMigrationStatements(sql);
}

export function validatePostgresConnectionString(value) {
  return validateRepositoryPostgresConnectionString(value, {
    ConfigurationError: ReferenceMigrationConfigurationError,
  });
}

async function main() {
  if (process.env.APPBASIS_MIGRATION_TARGET !== 'reference-preview') {
    throw new ReferenceMigrationConfigurationError(
      'APPBASIS_MIGRATION_TARGET must explicitly select reference-preview.',
    );
  }
  if (process.env.APPBASIS_APPLY_MIGRATIONS !== '1') {
    throw new ReferenceMigrationConfigurationError(
      'APPBASIS_APPLY_MIGRATIONS must explicitly confirm migration execution.',
    );
  }

  const result = await applyReferenceMigrations({
    connectionString: process.env.APPBASIS_DATABASE_URL,
  });
  console.log(
    `Reference preview migrations PASS: ${result.migrationCount} manifest migrations applied atomically.`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (
      error instanceof ReferenceMigrationConfigurationError ||
      error instanceof ReferenceMigrationExecutionError
    ) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.error('Reference migration execution failed.');
      process.exitCode = 1;
    }
  }
}

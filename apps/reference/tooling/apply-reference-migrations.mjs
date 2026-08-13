import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'apps', 'reference', 'appbasis.database.json');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

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

export async function loadReferenceMigrationPlan() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new ReferenceMigrationConfigurationError(
      'Reference migration manifest could not be read.',
    );
  }

  if (
    parsed?.manifestVersion !== 1 ||
    parsed?.application !== 'reference' ||
    parsed?.dialect !== 'postgresql' ||
    !Array.isArray(parsed?.owners) ||
    parsed.owners.length === 0
  ) {
    throw new ReferenceMigrationConfigurationError(
      'Reference migration manifest has an unsupported shape.',
    );
  }

  const migrations = [];
  for (const owner of parsed.owners) {
    if (
      owner === null ||
      typeof owner !== 'object' ||
      typeof owner.id !== 'string' ||
      owner.id.trim().length === 0 ||
      !Array.isArray(owner.migrations) ||
      owner.migrations.length === 0
    ) {
      throw new ReferenceMigrationConfigurationError(
        'Reference migration manifest contains an invalid owner.',
      );
    }

    for (const migration of owner.migrations) {
      if (typeof migration !== 'string' || migration.trim().length === 0) {
        throw new ReferenceMigrationConfigurationError(
          'Reference migration manifest contains an invalid migration path.',
        );
      }
      const relativePath = migration.trim();
      const absolutePath = path.resolve(repositoryRoot, ...relativePath.split('/'));
      if (!isWithinRepository(absolutePath)) {
        throw new ReferenceMigrationConfigurationError(
          'Reference migration path escapes the repository root.',
        );
      }

      let sql;
      try {
        sql = await readFile(absolutePath, 'utf8');
      } catch {
        throw new ReferenceMigrationConfigurationError(
          'Reference migration file could not be read.',
        );
      }
      const statements = migrationStatements(sql);
      if (statements.length === 0) {
        throw new ReferenceMigrationConfigurationError(
          'Reference migration file contains no executable statements.',
        );
      }
      migrations.push({ ownerId: owner.id, relativePath, statements });
    }
  }

  return migrations;
}

export async function applyReferenceMigrations({ connectionString }) {
  const normalizedConnectionString = validatePostgresConnectionString(connectionString);
  const plan = await loadReferenceMigrationPlan();
  const connection = createPostgresDatabase(normalizedConnectionString);

  try {
    let statementCount = 0;
    await connection.client.begin(async (transaction) => {
      const existing = await transaction`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        LIMIT 1
      `;
      if (existing.length !== 0) {
        throw new ReferenceMigrationExecutionError(
          'Reference migrations require an empty public schema.',
        );
      }

      for (const migration of plan) {
        for (const statement of migration.statements) {
          await transaction.unsafe(statement);
          statementCount += 1;
        }
      }
    });

    return { migrationCount: plan.length, statementCount };
  } catch (error) {
    if (error instanceof ReferenceMigrationExecutionError) throw error;
    throw new ReferenceMigrationExecutionError(
      'Reference migration transaction failed and was rolled back.',
    );
  } finally {
    await connection.client.end();
  }
}

export function migrationStatements(sql) {
  if (typeof sql !== 'string') return [];
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function validatePostgresConnectionString(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReferenceMigrationConfigurationError(
      'APPBASIS_DATABASE_URL is required.',
    );
  }
  const normalized = value.trim();
  try {
    if (!/^postgres(?:ql)?:\/\//i.test(normalized)) throw new Error('invalid');
    const url = new URL(normalized);
    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      url.hostname.length === 0
    ) {
      throw new Error('invalid');
    }
  } catch {
    throw new ReferenceMigrationConfigurationError(
      'APPBASIS_DATABASE_URL must be an absolute PostgreSQL URL with a hostname.',
    );
  }
  return normalized;
}

function isWithinRepository(absolutePath) {
  const relative = path.relative(repositoryRoot, absolutePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
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

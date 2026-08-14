import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';

const TARGET = 'reference-preview';
const FOUNDATION_MIGRATION_PATH =
  'packages/permissions/migrations/0000_appbasis_permissions_foundation.sql';
const FOUNDATION_RELATIONS = [
  'appbasis_permission_capability',
  'appbasis_permission_role',
  'appbasis_permission_role_capability',
  'appbasis_permission_principal',
  'appbasis_permission_principal_role',
  'appbasis_permission_principal_grant',
  'appbasis_permission_principal_revoke',
] as const;

type PermissionFoundationClient = ReturnType<
  typeof createPostgresDatabase
>['client'];

export class ReferencePermissionFoundationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePermissionFoundationConfigurationError';
  }
}

export class ReferencePermissionFoundationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePermissionFoundationStateError';
  }
}

export async function detectReferencePermissionFoundationState(
  client: PermissionFoundationClient,
): Promise<0 | 1> {
  const present = await client.unsafe(
    `SELECT relation_name
     FROM (VALUES
       ('appbasis_permission_capability'),
       ('appbasis_permission_role'),
       ('appbasis_permission_role_capability'),
       ('appbasis_permission_principal'),
       ('appbasis_permission_principal_role'),
       ('appbasis_permission_principal_grant'),
       ('appbasis_permission_principal_revoke')
     ) AS expected(relation_name)
     WHERE to_regclass('public.' || relation_name) IS NOT NULL
     ORDER BY relation_name`,
  );

  if (present.length === 0) return 0;
  if (present.length !== FOUNDATION_RELATIONS.length) {
    throw new ReferencePermissionFoundationStateError(
      'Reference permission foundation schema is partial.',
    );
  }
  return 1;
}

export async function ensureReferencePermissionFoundation(
  connectionString: string,
): Promise<{ readonly schemaVersion: 1; readonly applied: boolean }> {
  const normalizedConnectionString = requiredEnvironmentValue(
    connectionString,
    'database connection',
  );
  const connection = createPostgresDatabase(normalizedConnectionString);
  try {
    const initialState = await detectReferencePermissionFoundationState(
      connection.client,
    );
    if (initialState === 0) {
      await applyFoundationMigration(connection);
    }

    const finalState = await detectReferencePermissionFoundationState(
      connection.client,
    );
    if (finalState !== 1) {
      throw new ReferencePermissionFoundationStateError(
        'Permission foundation migration did not produce schema version 1.',
      );
    }

    return Object.freeze({ schemaVersion: 1, applied: initialState === 0 });
  } finally {
    await connection.client.end();
  }
}

export async function resolveReferencePermissionFoundationMigrationPath(
  startDirectory = process.cwd(),
): Promise<string> {
  let current = resolve(startDirectory);
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      await access(join(current, 'pnpm-workspace.yaml'));
      const candidate = join(
        current,
        ...FOUNDATION_MIGRATION_PATH.split('/'),
      );
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new ReferencePermissionFoundationStateError(
    'Reference permission foundation migration source could not be located.',
  );
}

export function safeReferencePermissionFoundationDiagnostic(
  error: unknown,
): string {
  if (!(error instanceof Error)) return 'unknown';
  switch (error.name) {
    case 'ReferencePermissionFoundationConfigurationError':
      return 'foundation-configuration';
    case 'ReferencePermissionFoundationStateError':
      return 'foundation-state';
    case 'TypeError':
      return 'input-validation';
    default:
      return 'unknown';
  }
}

async function applyFoundationMigration(
  connection: ReturnType<typeof createPostgresDatabase>,
): Promise<void> {
  const migrationPath =
    await resolveReferencePermissionFoundationMigrationPath();
  const sql = await readFile(migrationPath, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    throw new ReferencePermissionFoundationStateError(
      'Versioned permission foundation migration contains no executable statements.',
    );
  }

  try {
    await connection.client.begin(async (transaction) => {
      for (const statement of statements) {
        await transaction.unsafe(statement);
      }
    });
  } catch (error) {
    if (error instanceof ReferencePermissionFoundationStateError) throw error;
    throw new ReferencePermissionFoundationStateError(
      'Versioned permission foundation migration failed and was rolled back.',
    );
  }
}

async function runFromEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const target = env.APPBASIS_PERMISSION_FOUNDATION_TARGET?.trim();
  if (target !== TARGET) {
    throw new ReferencePermissionFoundationConfigurationError(
      'Invalid Reference permission foundation target.',
    );
  }
  const connectionString = requiredEnvironmentValue(
    env.APPBASIS_DATABASE_URL,
    'database connection',
  );
  return ensureReferencePermissionFoundation(connectionString);
}

function requiredEnvironmentValue(
  value: string | undefined,
  label: string,
): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) {
    throw new ReferencePermissionFoundationConfigurationError(
      `${label} is required.`,
    );
  }
  return normalized;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runFromEnvironment();
    console.log(
      `Reference permission foundation ready: schema v${result.schemaVersion}, ${result.applied ? 'applied' : 'already present'}.`,
    );
  } catch (error) {
    console.error(
      `Reference permission foundation failed: ${safeReferencePermissionFoundationDiagnostic(error)}.`,
    );
    process.exitCode = 1;
  }
}

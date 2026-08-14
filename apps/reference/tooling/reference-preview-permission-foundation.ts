import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';

const TARGET = 'reference-preview';
const FOUNDATION_MIGRATION_PATH =
  'packages/permissions/migrations/0000_appbasis_permissions_foundation.sql';

interface FoundationForeignKeySpec {
  readonly column: string;
  readonly referencedTable: string;
  readonly referencedColumn: string;
}

interface FoundationTableSpec {
  readonly name: string;
  readonly columns: readonly string[];
  readonly primaryKey: readonly string[];
  readonly foreignKeys: readonly FoundationForeignKeySpec[];
}

const FOUNDATION_TABLES = [
  {
    name: 'appbasis_permission_capability',
    columns: ['capability_id'],
    primaryKey: ['capability_id'],
    foreignKeys: [],
  },
  {
    name: 'appbasis_permission_role',
    columns: ['role_id'],
    primaryKey: ['role_id'],
    foreignKeys: [],
  },
  {
    name: 'appbasis_permission_role_capability',
    columns: ['role_id', 'capability_id'],
    primaryKey: ['role_id', 'capability_id'],
    foreignKeys: [
      {
        column: 'capability_id',
        referencedTable: 'appbasis_permission_capability',
        referencedColumn: 'capability_id',
      },
      {
        column: 'role_id',
        referencedTable: 'appbasis_permission_role',
        referencedColumn: 'role_id',
      },
    ],
  },
  {
    name: 'appbasis_permission_principal',
    columns: ['principal_id'],
    primaryKey: ['principal_id'],
    foreignKeys: [],
  },
  {
    name: 'appbasis_permission_principal_role',
    columns: ['principal_id', 'role_id'],
    primaryKey: ['principal_id', 'role_id'],
    foreignKeys: [
      {
        column: 'principal_id',
        referencedTable: 'appbasis_permission_principal',
        referencedColumn: 'principal_id',
      },
      {
        column: 'role_id',
        referencedTable: 'appbasis_permission_role',
        referencedColumn: 'role_id',
      },
    ],
  },
  {
    name: 'appbasis_permission_principal_grant',
    columns: ['principal_id', 'capability_id'],
    primaryKey: ['principal_id', 'capability_id'],
    foreignKeys: [
      {
        column: 'capability_id',
        referencedTable: 'appbasis_permission_capability',
        referencedColumn: 'capability_id',
      },
      {
        column: 'principal_id',
        referencedTable: 'appbasis_permission_principal',
        referencedColumn: 'principal_id',
      },
    ],
  },
  {
    name: 'appbasis_permission_principal_revoke',
    columns: ['principal_id', 'capability_id'],
    primaryKey: ['principal_id', 'capability_id'],
    foreignKeys: [
      {
        column: 'capability_id',
        referencedTable: 'appbasis_permission_capability',
        referencedColumn: 'capability_id',
      },
      {
        column: 'principal_id',
        referencedTable: 'appbasis_permission_principal',
        referencedColumn: 'principal_id',
      },
    ],
  },
] as const satisfies readonly FoundationTableSpec[];

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
  if (present.length !== FOUNDATION_TABLES.length) {
    throw new ReferencePermissionFoundationStateError(
      'Reference permission foundation schema is partial.',
    );
  }

  for (const table of FOUNDATION_TABLES) {
    await assertFoundationTableShape(client, table);
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

async function assertFoundationTableShape(
  client: PermissionFoundationClient,
  table: FoundationTableSpec,
): Promise<void> {
  const relationRows = await client.unsafe(
    `SELECT table_type
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [table.name],
  );
  if (
    relationRows.length !== 1 ||
    relationRows[0]?.table_type !== 'BASE TABLE'
  ) {
    throwMalformedFoundation();
  }

  const columnRows = await client.unsafe(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
     ORDER BY ordinal_position`,
    [table.name],
  );
  if (columnRows.length !== table.columns.length) {
    throwMalformedFoundation();
  }
  for (let index = 0; index < table.columns.length; index += 1) {
    const row = columnRows[index];
    if (
      row?.column_name !== table.columns[index] ||
      row?.data_type !== 'text' ||
      row?.is_nullable !== 'NO' ||
      row?.column_default !== null
    ) {
      throwMalformedFoundation();
    }
  }

  const primaryKeyRows = await client.unsafe(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_catalog = tc.constraint_catalog
      AND kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table.name],
  );
  if (
    !sameStrings(
      primaryKeyRows.map((row) => row.column_name),
      table.primaryKey,
    )
  ) {
    throwMalformedFoundation();
  }

  const foreignKeyRows = await client.unsafe(
    `SELECT
       kcu.column_name,
       ccu.table_name AS referenced_table,
       ccu.column_name AS referenced_column,
       rc.update_rule,
       rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_catalog = tc.constraint_catalog
      AND kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_catalog = tc.constraint_catalog
      AND rc.constraint_schema = tc.constraint_schema
      AND rc.constraint_name = tc.constraint_name
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_catalog = rc.unique_constraint_catalog
      AND ccu.constraint_schema = rc.unique_constraint_schema
      AND ccu.constraint_name = rc.unique_constraint_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'FOREIGN KEY'
     ORDER BY kcu.column_name`,
    [table.name],
  );
  const expectedForeignKeys = [...table.foreignKeys].sort((left, right) =>
    left.column.localeCompare(right.column),
  );
  if (foreignKeyRows.length !== expectedForeignKeys.length) {
    throwMalformedFoundation();
  }
  for (let index = 0; index < expectedForeignKeys.length; index += 1) {
    const row = foreignKeyRows[index];
    const expected = expectedForeignKeys[index];
    if (
      row?.column_name !== expected?.column ||
      row?.referenced_table !== expected?.referencedTable ||
      row?.referenced_column !== expected?.referencedColumn ||
      row?.update_rule !== 'NO ACTION' ||
      row?.delete_rule !== 'CASCADE'
    ) {
      throwMalformedFoundation();
    }
  }
}

function sameStrings(
  actual: readonly unknown[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function throwMalformedFoundation(): never {
  throw new ReferencePermissionFoundationStateError(
    'Reference permission foundation schema is malformed.',
  );
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

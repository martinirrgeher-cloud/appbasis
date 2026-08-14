import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';

const TARGET = 'reference-preview';
const FOUNDATION_MIGRATION_PATH =
  'packages/permissions/migrations/0000_appbasis_permissions_foundation.sql';

interface FoundationTableSpec {
  readonly name: string;
  readonly requiredColumns: readonly string[];
  readonly primaryKey: string;
  readonly foreignKeys: readonly string[];
}

const FOUNDATION_TABLES = [
  {
    name: 'appbasis_permission_capability',
    requiredColumns: ['capability_id'],
    primaryKey: 'PRIMARY KEY (capability_id)',
    foreignKeys: [],
  },
  {
    name: 'appbasis_permission_role',
    requiredColumns: ['role_id'],
    primaryKey: 'PRIMARY KEY (role_id)',
    foreignKeys: [],
  },
  {
    name: 'appbasis_permission_role_capability',
    requiredColumns: ['role_id', 'capability_id'],
    primaryKey: 'PRIMARY KEY (role_id, capability_id)',
    foreignKeys: [
      'FOREIGN KEY (capability_id) REFERENCES appbasis_permission_capability(capability_id) ON DELETE CASCADE',
      'FOREIGN KEY (role_id) REFERENCES appbasis_permission_role(role_id) ON DELETE CASCADE',
    ],
  },
  {
    name: 'appbasis_permission_principal',
    requiredColumns: ['principal_id'],
    primaryKey: 'PRIMARY KEY (principal_id)',
    foreignKeys: [],
  },
  {
    name: 'appbasis_permission_principal_role',
    requiredColumns: ['principal_id', 'role_id'],
    primaryKey: 'PRIMARY KEY (principal_id, role_id)',
    foreignKeys: [
      'FOREIGN KEY (principal_id) REFERENCES appbasis_permission_principal(principal_id) ON DELETE CASCADE',
      'FOREIGN KEY (role_id) REFERENCES appbasis_permission_role(role_id) ON DELETE CASCADE',
    ],
  },
  {
    name: 'appbasis_permission_principal_grant',
    requiredColumns: ['principal_id', 'capability_id'],
    primaryKey: 'PRIMARY KEY (principal_id, capability_id)',
    foreignKeys: [
      'FOREIGN KEY (capability_id) REFERENCES appbasis_permission_capability(capability_id) ON DELETE CASCADE',
      'FOREIGN KEY (principal_id) REFERENCES appbasis_permission_principal(principal_id) ON DELETE CASCADE',
    ],
  },
  {
    name: 'appbasis_permission_principal_revoke',
    requiredColumns: ['principal_id', 'capability_id'],
    primaryKey: 'PRIMARY KEY (principal_id, capability_id)',
    foreignKeys: [
      'FOREIGN KEY (capability_id) REFERENCES appbasis_permission_capability(capability_id) ON DELETE CASCADE',
      'FOREIGN KEY (principal_id) REFERENCES appbasis_permission_principal(principal_id) ON DELETE CASCADE',
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
    `SELECT relation.relkind
     FROM pg_catalog.pg_class relation
     JOIN pg_catalog.pg_namespace namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relname = $1`,
    [table.name],
  );
  if (relationRows.length !== 1 || relationRows[0]?.relkind !== 'r') {
    throwMalformedFoundation();
  }

  const columnRows = await client.unsafe(
    `SELECT
       attribute.attname AS column_name,
       pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
       attribute.attnotnull AS is_not_null,
       pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression
     FROM pg_catalog.pg_attribute attribute
     JOIN pg_catalog.pg_class relation
       ON relation.oid = attribute.attrelid
     JOIN pg_catalog.pg_namespace namespace
       ON namespace.oid = relation.relnamespace
     LEFT JOIN pg_catalog.pg_attrdef default_value
       ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
     WHERE namespace.nspname = 'public'
       AND relation.relname = $1
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
       AND attribute.attname = ANY($2::text[])
     ORDER BY attribute.attnum`,
    [table.name, postgresArray(table.requiredColumns)],
  );
  if (columnRows.length !== table.requiredColumns.length) {
    throwMalformedFoundation();
  }
  for (const columnName of table.requiredColumns) {
    const row = columnRows.find((candidate) => candidate.column_name === columnName);
    if (
      row?.data_type !== 'text' ||
      row?.is_not_null !== true ||
      row?.default_expression !== null
    ) {
      throwMalformedFoundation();
    }
  }

  const constraintRows = await client.unsafe(
    `SELECT
       schema_constraint.contype,
       schema_constraint.convalidated,
       pg_catalog.pg_get_constraintdef(schema_constraint.oid, true) AS definition
     FROM pg_catalog.pg_constraint schema_constraint
     JOIN pg_catalog.pg_class relation
       ON relation.oid = schema_constraint.conrelid
     JOIN pg_catalog.pg_namespace namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relname = $1
       AND schema_constraint.contype IN ('p', 'f')
     ORDER BY schema_constraint.contype, definition`,
    [table.name],
  );
  const primaryKeys = constraintRows.filter((row) => row.contype === 'p');
  if (
    primaryKeys.length !== 1 ||
    primaryKeys[0]?.convalidated !== true ||
    primaryKeys[0]?.definition !== table.primaryKey
  ) {
    throwMalformedFoundation();
  }

  const foreignKeys = constraintRows
    .filter((row) => row.contype === 'f')
    .map((row) => {
      if (row.convalidated !== true || typeof row.definition !== 'string') {
        throwMalformedFoundation();
      }
      return row.definition;
    })
    .sort();
  if (!sameStrings(foreignKeys, [...table.foreignKeys].sort())) {
    throwMalformedFoundation();
  }
}

function postgresArray(values: readonly string[]): string {
  return `{${values.map(escapePostgresArrayValue).join(',')}}`;
}

function escapePostgresArrayValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function sameStrings(
  actual: readonly string[],
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

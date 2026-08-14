import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';
const DIRECT_TRANSACTION_COMMANDS = new Set([
  'ABORT',
  'BEGIN',
  'COMMIT',
  'END',
  'RELEASE',
  'ROLLBACK',
  'SAVEPOINT',
]);

export class MigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationConfigurationError';
  }
}

export class MigrationExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationExecutionError';
  }
}

export async function loadRepositoryMigrationPlan({
  repositoryRoot,
  manifestPath,
  expectedApplication,
  expectedOwners,
  ConfigurationError = MigrationConfigurationError,
}) {
  const root = path.resolve(repositoryRoot);
  const manifest = path.resolve(manifestPath);
  const fail = (message) => {
    throw new ConfigurationError(message);
  };

  if (!isPlainObject(expectedOwners) || Object.keys(expectedOwners).length === 0) {
    fail('Migration owner contract is empty or invalid.');
  }
  if (!isWithin(root, manifest)) {
    fail('Migration manifest path escapes the repository root.');
  }
  await assertRegularCanonicalPath(root, manifest, 'Migration manifest', fail);

  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifest, 'utf8'));
  } catch {
    fail('Migration manifest could not be read.');
  }

  if (
    parsed?.manifestVersion !== 1 ||
    parsed?.application !== expectedApplication ||
    parsed?.dialect !== 'postgresql' ||
    !Array.isArray(parsed?.owners) ||
    parsed.owners.length === 0
  ) {
    fail('Migration manifest has an unsupported shape or application target.');
  }

  const expectedOwnerIds = Object.keys(expectedOwners);
  const seenOwnerIds = new Set();
  const seenMigrationPaths = new Set();
  const migrations = [];

  for (const owner of parsed.owners) {
    if (
      !isPlainObject(owner) ||
      typeof owner.id !== 'string' ||
      typeof owner.root !== 'string' ||
      !Number.isInteger(owner.schemaVersion) ||
      owner.schemaVersion < 1 ||
      !Array.isArray(owner.migrations) ||
      owner.migrations.length === 0
    ) {
      fail('Migration manifest contains an invalid owner.');
    }
    if (!Object.hasOwn(expectedOwners, owner.id)) {
      fail('Migration manifest contains an unknown owner.');
    }
    if (seenOwnerIds.has(owner.id)) {
      fail('Migration manifest contains a duplicate owner.');
    }
    seenOwnerIds.add(owner.id);

    const expectedRoot = expectedOwners[owner.id];
    if (typeof expectedRoot !== 'string' || owner.root !== expectedRoot) {
      fail('Migration manifest owner root does not match the target contract.');
    }
    validateRepositoryRelativePath(owner.root, 'Migration owner root', fail);

    const absoluteOwnerRoot = path.resolve(root, ...owner.root.split('/'));
    if (!isWithin(root, absoluteOwnerRoot)) {
      fail('Migration owner root escapes the repository root.');
    }
    await assertDirectoryCanonicalPath(root, absoluteOwnerRoot, 'Migration owner root', fail);

    for (const migration of owner.migrations) {
      validateRepositoryRelativePath(migration, 'Migration path', fail);
      if (!migration.endsWith('.sql')) {
        fail('Migration path must point to a SQL file.');
      }
      if (!isWithinOwnerRoot(owner.root, migration)) {
        fail('Migration path is outside its declared owner root.');
      }
      if (seenMigrationPaths.has(migration)) {
        fail('Migration manifest contains a duplicate migration path.');
      }
      seenMigrationPaths.add(migration);

      const absolutePath = path.resolve(root, ...migration.split('/'));
      if (!isWithin(root, absolutePath) || !isWithin(absoluteOwnerRoot, absolutePath)) {
        fail('Migration path escapes its allowed repository tree.');
      }
      await assertRegularCanonicalPath(root, absolutePath, 'Migration file', fail);

      let sql;
      try {
        sql = await readFile(absolutePath, 'utf8');
      } catch {
        fail('Migration file could not be read.');
      }
      const statements = migrationStatements(sql);
      if (statements.length === 0) {
        fail('Migration file contains no executable statements.');
      }
      migrations.push({ ownerId: owner.id, relativePath: migration, statements });
    }
  }

  if (
    seenOwnerIds.size !== expectedOwnerIds.length ||
    expectedOwnerIds.some((ownerId) => !seenOwnerIds.has(ownerId))
  ) {
    fail('Migration manifest does not contain the complete target owner set.');
  }

  assertMigrationPlanSafety(migrations, fail);
  return migrations;
}

export async function applyRepositoryMigrationPlan({
  connectionString,
  expectedDatabase,
  plan,
  createDatabase,
  ConfigurationError = MigrationConfigurationError,
  ExecutionError = MigrationExecutionError,
  emptySchemaMessage = 'Migrations require an empty public schema.',
  transactionFailedMessage = 'Migration transaction failed and was rolled back.',
}) {
  const normalizedConnectionString = validatePostgresConnectionString(connectionString, {
    expectedDatabase,
    ConfigurationError,
  });
  const fail = (message) => {
    throw new ConfigurationError(message);
  };
  assertMigrationPlanSafety(plan, fail);
  if (typeof createDatabase !== 'function') {
    throw new ConfigurationError('Migration database factory is unavailable.');
  }

  let connection;
  try {
    connection = createDatabase(normalizedConnectionString);
  } catch {
    throw new ExecutionError(transactionFailedMessage);
  }

  let primaryError;
  try {
    let statementCount = 0;
    await connection.client.begin(async (transaction) => {
      if (expectedDatabase !== undefined) {
        const selectedDatabase = await currentDatabase(transaction);
        if (selectedDatabase !== expectedDatabase) {
          throw new ExecutionError(
            'Migration database connection did not select the required target database.',
          );
        }
      }
      if (await publicSchemaHasUserObjects(transaction)) {
        throw new ExecutionError(emptySchemaMessage);
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
    primaryError = error;
    if (error instanceof ExecutionError) throw error;
    throw new ExecutionError(transactionFailedMessage);
  } finally {
    try {
      await connection.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new ExecutionError('Migration database connection could not be closed cleanly.');
      }
    }
  }
}

export function migrationStatements(sql) {
  if (typeof sql !== 'string') return [];
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function validatePostgresConnectionString(
  value,
  { expectedDatabase, ConfigurationError = MigrationConfigurationError } = {},
) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigurationError('APPBASIS_DATABASE_URL is required.');
  }
  const normalized = value.trim();
  let url;
  try {
    if (!/^postgres(?:ql)?:\/\//i.test(normalized)) throw new Error('invalid');
    url = new URL(normalized);
    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      url.hostname.length === 0
    ) {
      throw new Error('invalid');
    }
  } catch {
    throw new ConfigurationError(
      'APPBASIS_DATABASE_URL must be an absolute PostgreSQL URL with a hostname.',
    );
  }

  if (expectedDatabase !== undefined) {
    let databaseName;
    try {
      databaseName = decodeURIComponent(url.pathname.slice(1));
    } catch {
      throw new ConfigurationError('APPBASIS_DATABASE_URL database name is invalid.');
    }
    if (databaseName !== expectedDatabase) {
      throw new ConfigurationError(
        'APPBASIS_DATABASE_URL does not select the required migration target database.',
      );
    }
  }

  return normalized;
}

function assertMigrationPlanSafety(plan, fail) {
  if (!Array.isArray(plan) || plan.length === 0) {
    fail('Migration plan is empty or invalid.');
  }

  for (const migration of plan) {
    if (
      !isPlainObject(migration) ||
      !Array.isArray(migration.statements) ||
      migration.statements.length === 0
    ) {
      fail('Migration plan contains an invalid migration entry.');
    }
    for (const statement of migration.statements) {
      if (typeof statement !== 'string' || statement.trim().length === 0) {
        fail('Migration plan contains an invalid SQL statement.');
      }
      if (containsTransactionControlStatement(statement)) {
        fail('Migration SQL must not contain transaction-control statements.');
      }
    }
  }
}

function containsTransactionControlStatement(sql) {
  return sqlCommandKeywords(sql).some((tokens) => {
    const [first, second, third, fourth, fifth] = tokens;
    if (DIRECT_TRANSACTION_COMMANDS.has(first)) return true;
    if (first === 'START' && second === 'TRANSACTION') return true;
    if (first === 'PREPARE' && second === 'TRANSACTION') return true;
    if (first === 'SET' && second === 'TRANSACTION') return true;
    return (
      first === 'SET' &&
      second === 'SESSION' &&
      third === 'CHARACTERISTICS' &&
      fourth === 'AS' &&
      fifth === 'TRANSACTION'
    );
  });
}

function sqlCommandKeywords(sql) {
  const commands = [];
  let command = [];
  let index = 0;

  const finishCommand = () => {
    if (command.length > 0) commands.push(command);
    command = [];
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      index = skipBlockComment(sql, index);
      continue;
    }

    if (char === "'") {
      index = skipSingleQuotedString(sql, index);
      continue;
    }

    if (char === '"') {
      index = skipDoubleQuotedIdentifier(sql, index);
      continue;
    }

    if (char === '$') {
      const marker = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (marker !== undefined) {
        const closingIndex = sql.indexOf(marker, index + marker.length);
        index = closingIndex === -1 ? sql.length : closingIndex + marker.length;
        continue;
      }
    }

    if (char === ';') {
      finishCommand();
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < sql.length && /[A-Za-z0-9_$]/.test(sql[end])) end += 1;
      if (command.length < 5) command.push(sql.slice(index, end).toUpperCase());
      index = end;
      continue;
    }

    index += 1;
  }

  finishCommand();
  return commands;
}

function skipSingleQuotedString(sql, start) {
  const escapeBackslash =
    start > 0 &&
    (sql[start - 1] === 'E' || sql[start - 1] === 'e') &&
    (start < 2 || !/[A-Za-z0-9_$]/.test(sql[start - 2]));
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === "'" && sql[index + 1] === "'") {
      index += 2;
      continue;
    }
    if (escapeBackslash && sql[index] === '\\' && index + 1 < sql.length) {
      index += 2;
      continue;
    }
    if (sql[index] === "'") return index + 1;
    index += 1;
  }
  return sql.length;
}

function skipDoubleQuotedIdentifier(sql, start) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === '"' && sql[index + 1] === '"') {
      index += 2;
      continue;
    }
    if (sql[index] === '"') return index + 1;
    index += 1;
  }
  return sql.length;
}

function skipBlockComment(sql, start) {
  let depth = 1;
  let index = start + 2;
  while (index < sql.length && depth > 0) {
    if (sql[index] === '/' && sql[index + 1] === '*') {
      depth += 1;
      index += 2;
      continue;
    }
    if (sql[index] === '*' && sql[index + 1] === '/') {
      depth -= 1;
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
}

async function currentDatabase(sql) {
  const rows = await sql`SELECT current_database() AS database_name`;
  if (rows.length !== 1 || typeof rows[0]?.database_name !== 'string') {
    throw new MigrationExecutionError('Migration database target could not be verified.');
  }
  return rows[0].database_name;
}

async function publicSchemaHasUserObjects(sql) {
  const rows = await sql`
    SELECT object_oid
    FROM (
      SELECT c.oid AS object_oid
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT t.oid FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT c.oid FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT c.oid FROM pg_catalog.pg_conversion c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT o.oid FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid = o.oprnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT o.oid FROM pg_catalog.pg_opclass o JOIN pg_catalog.pg_namespace n ON n.oid = o.opcnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT o.oid FROM pg_catalog.pg_opfamily o JOIN pg_catalog.pg_namespace n ON n.oid = o.opfnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT s.oid FROM pg_catalog.pg_statistic_ext s JOIN pg_catalog.pg_namespace n ON n.oid = s.stxnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT c.oid FROM pg_catalog.pg_ts_config c JOIN pg_catalog.pg_namespace n ON n.oid = c.cfgnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT d.oid FROM pg_catalog.pg_ts_dict d JOIN pg_catalog.pg_namespace n ON n.oid = d.dictnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT p.oid FROM pg_catalog.pg_ts_parser p JOIN pg_catalog.pg_namespace n ON n.oid = p.prsnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT t.oid FROM pg_catalog.pg_ts_template t JOIN pg_catalog.pg_namespace n ON n.oid = t.tmplnamespace WHERE n.nspname = 'public'
    ) public_objects
    LIMIT 1
  `;
  return rows.length !== 0;
}

async function assertRegularCanonicalPath(root, absolutePath, label, fail) {
  try {
    const stats = await lstat(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) fail(`${label} is not a regular file.`);
    const canonical = await realpath(absolutePath);
    if (canonical !== absolutePath || !isWithin(root, canonical)) {
      fail(`${label} resolves through an untrusted path.`);
    }
  } catch {
    fail(`${label} could not be resolved safely.`);
  }
}

async function assertDirectoryCanonicalPath(root, absolutePath, label, fail) {
  try {
    const stats = await lstat(absolutePath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) fail(`${label} is not a directory.`);
    const canonical = await realpath(absolutePath);
    if (canonical !== absolutePath || !isWithin(root, canonical)) {
      fail(`${label} resolves through an untrusted path.`);
    }
  } catch {
    fail(`${label} could not be resolved safely.`);
  }
}

function validateRepositoryRelativePath(value, label, fail) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === '.' ||
    value === '..' ||
    value.startsWith('../') ||
    value.startsWith('./')
  ) {
    fail(`${label} is not a canonical repository-relative path.`);
  }
}

function isWithinOwnerRoot(ownerRoot, migrationPath) {
  return migrationPath.startsWith(`${ownerRoot}/`);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

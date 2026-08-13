import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestRelativePath = 'apps/reference/appbasis.database.json';
const manifestPath = path.join(repositoryRoot, manifestRelativePath);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const errors = [];

if (manifest.manifestVersion !== 1) {
  errors.push('manifestVersion must be 1.');
}
if (manifest.application !== 'reference') {
  errors.push('application must be "reference".');
}
if (manifest.dialect !== 'postgresql') {
  errors.push('dialect must be "postgresql".');
}
if (!Array.isArray(manifest.owners) || manifest.owners.length === 0) {
  errors.push('owners must be a non-empty array.');
}

const ownerIds = new Set();
const ownerRoots = new Set();
const migrationPaths = new Set();

for (const [ownerIndex, owner] of (manifest.owners ?? []).entries()) {
  const label = `owners[${ownerIndex}]`;
  if (owner === null || typeof owner !== 'object' || Array.isArray(owner)) {
    errors.push(`${label} must be an object.`);
    continue;
  }

  if (typeof owner.id !== 'string' || !/^[a-z0-9-]+$/.test(owner.id)) {
    errors.push(`${label}.id must be a stable lowercase identifier.`);
  } else if (ownerIds.has(owner.id)) {
    errors.push(`${label}.id duplicates owner "${owner.id}".`);
  } else {
    ownerIds.add(owner.id);
  }

  if (typeof owner.root !== 'string' || !isSafeRepositoryPath(owner.root)) {
    errors.push(`${label}.root must be a safe repository-relative path.`);
    continue;
  }
  if (ownerRoots.has(owner.root)) {
    errors.push(`${label}.root duplicates "${owner.root}".`);
  } else {
    ownerRoots.add(owner.root);
  }

  if (!Number.isInteger(owner.schemaVersion) || owner.schemaVersion < 1) {
    errors.push(`${label}.schemaVersion must be a positive integer.`);
  }

  if (!Array.isArray(owner.migrations) || owner.migrations.length === 0) {
    errors.push(`${label}.migrations must be a non-empty array.`);
    continue;
  }

  const sortedMigrations = [...owner.migrations].sort((left, right) => left.localeCompare(right));
  if (!owner.migrations.every((migration, index) => migration === sortedMigrations[index])) {
    errors.push(`${label}.migrations must be lexicographically sorted.`);
  }

  const directories = new Set();
  const expectedByDirectory = new Map();

  for (const [migrationIndex, migration] of owner.migrations.entries()) {
    const migrationLabel = `${label}.migrations[${migrationIndex}]`;
    if (typeof migration !== 'string' || !isSafeRepositoryPath(migration)) {
      errors.push(`${migrationLabel} must be a safe repository-relative path.`);
      continue;
    }
    if (!migration.endsWith('.sql')) {
      errors.push(`${migrationLabel} must reference a .sql file.`);
    }
    if (!isWithin(owner.root, migration)) {
      errors.push(`${migrationLabel} must stay within owner root "${owner.root}".`);
    }
    if (migrationPaths.has(migration)) {
      errors.push(`${migrationLabel} duplicates migration "${migration}".`);
    } else {
      migrationPaths.add(migration);
    }

    const absoluteMigrationPath = path.join(repositoryRoot, ...migration.split('/'));
    try {
      const migrationStat = await stat(absoluteMigrationPath);
      if (!migrationStat.isFile()) {
        errors.push(`${migrationLabel} does not point to a file.`);
      }
    } catch {
      errors.push(`${migrationLabel} does not exist: ${migration}`);
    }

    const directory = path.posix.dirname(migration);
    directories.add(directory);
    const expected = expectedByDirectory.get(directory) ?? new Set();
    expected.add(path.posix.basename(migration));
    expectedByDirectory.set(directory, expected);
  }

  for (const directory of directories) {
    const absoluteDirectory = path.join(repositoryRoot, ...directory.split('/'));
    let actualSqlFiles;
    try {
      actualSqlFiles = (await readdir(absoluteDirectory))
        .filter((entry) => entry.endsWith('.sql'))
        .sort((left, right) => left.localeCompare(right));
    } catch {
      errors.push(`${label} migration directory does not exist: ${directory}`);
      continue;
    }

    const expectedSqlFiles = [...(expectedByDirectory.get(directory) ?? [])].sort((left, right) =>
      left.localeCompare(right),
    );
    if (JSON.stringify(actualSqlFiles) !== JSON.stringify(expectedSqlFiles)) {
      errors.push(
        `${label} manifest must list every .sql migration in ${directory}. ` +
          `Expected [${actualSqlFiles.join(', ')}], manifest has [${expectedSqlFiles.join(', ')}].`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Migration contract verification failed for ${manifestRelativePath}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Migration contract verified: ${manifest.owners.length} owners, ${migrationPaths.size} migrations.`,
  );
}

function isSafeRepositoryPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && !path.posix.isAbsolute(value) && value !== '..' && !value.startsWith('../');
}

function isWithin(root, candidate) {
  const relative = path.posix.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('../');
}

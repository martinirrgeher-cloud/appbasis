import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryRealRoot = await realpath(repositoryRoot);
const manifestRelativePath = 'apps/reference/appbasis.database.json';
const manifestPath = path.join(repositoryRoot, ...manifestRelativePath.split('/'));

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

  const absoluteOwnerRoot = repositoryPath(owner.root);
  let ownerRealRoot;
  try {
    const ownerRootStat = await lstat(absoluteOwnerRoot);
    if (ownerRootStat.isSymbolicLink()) {
      errors.push(`${label}.root must not be a symbolic link: ${owner.root}`);
      continue;
    }
    if (!ownerRootStat.isDirectory()) {
      errors.push(`${label}.root must point to a directory: ${owner.root}`);
      continue;
    }
    ownerRealRoot = await realpath(absoluteOwnerRoot);
    if (!isWithinFilesystemPath(repositoryRealRoot, ownerRealRoot)) {
      errors.push(`${label}.root resolves outside the repository: ${owner.root}`);
      continue;
    }
  } catch {
    errors.push(`${label}.root does not exist: ${owner.root}`);
    continue;
  }

  if (!Number.isInteger(owner.schemaVersion) || owner.schemaVersion < 1) {
    errors.push(`${label}.schemaVersion must be a positive integer.`);
  }

  if (!Array.isArray(owner.migrations) || owner.migrations.length === 0) {
    errors.push(`${label}.migrations must be a non-empty array.`);
    continue;
  }

  const stringMigrations = owner.migrations.filter((migration) => typeof migration === 'string');
  if (stringMigrations.length !== owner.migrations.length) {
    errors.push(`${label}.migrations must contain only repository-relative strings.`);
  } else {
    const sortedMigrations = [...stringMigrations].sort((left, right) =>
      left.localeCompare(right),
    );
    if (!stringMigrations.every((migration, index) => migration === sortedMigrations[index])) {
      errors.push(`${label}.migrations must be lexicographically sorted.`);
    }
  }

  const directories = new Set();

  for (const [migrationIndex, migration] of owner.migrations.entries()) {
    const migrationLabel = `${label}.migrations[${migrationIndex}]`;
    if (typeof migration !== 'string' || !isSafeRepositoryPath(migration)) {
      errors.push(`${migrationLabel} must be a safe repository-relative path.`);
      continue;
    }
    if (!migration.endsWith('.sql')) {
      errors.push(`${migrationLabel} must reference a .sql file.`);
    }
    if (!isWithinRepositoryPath(owner.root, migration)) {
      errors.push(`${migrationLabel} must stay within owner root "${owner.root}".`);
    }
    if (migrationPaths.has(migration)) {
      errors.push(`${migrationLabel} duplicates migration "${migration}".`);
    } else {
      migrationPaths.add(migration);
    }

    const absoluteMigrationPath = repositoryPath(migration);
    try {
      const migrationStat = await lstat(absoluteMigrationPath);
      if (migrationStat.isSymbolicLink()) {
        errors.push(`${migrationLabel} must not be a symbolic link: ${migration}`);
      } else if (!migrationStat.isFile()) {
        errors.push(`${migrationLabel} does not point to a file.`);
      } else {
        const migrationRealPath = await realpath(absoluteMigrationPath);
        if (!isWithinFilesystemPath(ownerRealRoot, migrationRealPath)) {
          errors.push(`${migrationLabel} resolves outside owner root "${owner.root}".`);
        }
      }
    } catch {
      errors.push(`${migrationLabel} does not exist: ${migration}`);
    }

    directories.add(path.posix.dirname(migration));
  }

  for (const directory of directories) {
    const absoluteDirectory = repositoryPath(directory);
    let actualSqlFiles;
    try {
      const directoryStat = await lstat(absoluteDirectory);
      if (directoryStat.isSymbolicLink()) {
        errors.push(`${label} migration directory must not be a symbolic link: ${directory}`);
        continue;
      }
      if (!directoryStat.isDirectory()) {
        errors.push(`${label} migration directory is not a directory: ${directory}`);
        continue;
      }
      const directoryRealPath = await realpath(absoluteDirectory);
      if (!isWithinFilesystemPath(ownerRealRoot, directoryRealPath)) {
        errors.push(`${label} migration directory resolves outside owner root: ${directory}`);
        continue;
      }
      actualSqlFiles = await collectSqlFiles(directory, absoluteDirectory, label);
    } catch {
      errors.push(`${label} migration directory does not exist: ${directory}`);
      continue;
    }

    const expectedSqlFiles = owner.migrations
      .filter(
        (migration) =>
          typeof migration === 'string' &&
          migration.endsWith('.sql') &&
          isAtOrWithinRepositoryPath(directory, migration),
      )
      .sort((left, right) => left.localeCompare(right));

    if (JSON.stringify(actualSqlFiles) !== JSON.stringify(expectedSqlFiles)) {
      errors.push(
        `${label} manifest must list every .sql migration below ${directory}. ` +
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

async function collectSqlFiles(relativeDirectory, absoluteDirectory, label) {
  const sqlFiles = [];
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const relativeEntry = path.posix.join(relativeDirectory, entry.name);
    const absoluteEntry = path.join(absoluteDirectory, entry.name);

    if (entry.isSymbolicLink()) {
      errors.push(`${label} migration tree must not contain symbolic links: ${relativeEntry}`);
      continue;
    }
    if (entry.isDirectory()) {
      sqlFiles.push(...(await collectSqlFiles(relativeEntry, absoluteEntry, label)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      sqlFiles.push(relativeEntry);
    }
  }

  return sqlFiles.sort((left, right) => left.localeCompare(right));
}

function repositoryPath(value) {
  return path.resolve(repositoryRoot, ...value.split('/'));
}

function isSafeRepositoryPath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  return (
    normalized === value &&
    !path.posix.isAbsolute(value) &&
    value !== '..' &&
    !value.startsWith('../')
  );
}

function isWithinRepositoryPath(root, candidate) {
  const relative = path.posix.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('../');
}

function isAtOrWithinRepositoryPath(root, candidate) {
  const relative = path.posix.relative(root, candidate);
  return relative !== '..' && !relative.startsWith('../');
}

function isWithinFilesystemPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

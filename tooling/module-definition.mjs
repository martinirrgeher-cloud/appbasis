import { lstat, readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";

import { assertGeneratedModuleDatabaseOwners } from "./generated-database-manifest.mjs";

const MODULE_DEFINITION_FILE = "appbasis.module.json";
const MODULE_DEFINITION_KEYS = new Set([
  "schemaVersion",
  "moduleId",
  "displayName",
  "packageName",
  "compatibility",
  "capabilities",
  "database",
]);
const COMPATIBILITY_KEYS = new Set(["appDefinitionSchemaVersions"]);
const DATABASE_KEYS = new Set(["schemaVersion", "migrations"]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export function parseModuleDefinition(value, options = {}) {
  const directoryName = options.directoryName;
  if (!isPlainObject(value)) {
    throw new Error("Module definition must be a JSON object.");
  }
  assertOnlyKeys(value, MODULE_DEFINITION_KEYS, "module definition");

  if (value.schemaVersion !== 1) {
    throw new Error("Module definition schemaVersion must be 1.");
  }

  const moduleId = requiredIdentifier(value.moduleId, "moduleId");
  if (directoryName !== undefined && moduleId !== directoryName) {
    throw new Error(
      `Module definition moduleId ${moduleId} must match modules/${directoryName}.`,
    );
  }

  const displayName = requiredDisplayName(value.displayName);
  const packageName = requiredPackageName(value.packageName, moduleId);
  const compatibility = parseCompatibility(value.compatibility);
  const capabilities = parseCapabilities(value.capabilities, moduleId);
  const database = parseDatabase(value.database, moduleId);

  return Object.freeze({
    schemaVersion: 1,
    moduleId,
    displayName,
    packageName,
    compatibility,
    capabilities,
    database,
  });
}

export async function readModuleDefinitions(repositoryRoot = process.cwd()) {
  const modulesDirectory = join(repositoryRoot, "modules");
  const entries = await directoryNames(modulesDirectory);
  const definitions = [];
  const ids = new Set();

  for (const directoryName of entries) {
    const manifestPath = join(
      modulesDirectory,
      directoryName,
      MODULE_DEFINITION_FILE,
    );
    const parsed = await readRequiredJson(
      manifestPath,
      `modules/${directoryName}/${MODULE_DEFINITION_FILE}`,
      `modules/${directoryName} is missing ${MODULE_DEFINITION_FILE}.`,
    );

    const definition = parseModuleDefinition(parsed, { directoryName });
    if (ids.has(definition.moduleId)) {
      throw new Error(`Duplicate moduleId: ${definition.moduleId}.`);
    }

    await verifyModuleOwnedArtifacts(
      repositoryRoot,
      directoryName,
      definition,
    );

    ids.add(definition.moduleId);
    definitions.push(definition);
  }

  return Object.freeze(definitions);
}

export async function verifyModuleDefinitions(repositoryRoot = process.cwd()) {
  const definitions = await readModuleDefinitions(repositoryRoot);
  assertGeneratedModuleDatabaseOwners(definitions);
  return definitions;
}

export function assertAppModuleCompatibility(appDefinition, moduleDefinition) {
  if (
    !isPlainObject(appDefinition) ||
    typeof appDefinition.appId !== "string" ||
    !Number.isInteger(appDefinition.schemaVersion)
  ) {
    throw new Error("App/module compatibility requires a parsed app definition.");
  }
  if (
    !isPlainObject(moduleDefinition) ||
    typeof moduleDefinition.moduleId !== "string" ||
    !isPlainObject(moduleDefinition.compatibility) ||
    !Array.isArray(moduleDefinition.compatibility.appDefinitionSchemaVersions)
  ) {
    throw new Error("App/module compatibility requires a parsed module definition.");
  }

  if (
    !moduleDefinition.compatibility.appDefinitionSchemaVersions.includes(
      appDefinition.schemaVersion,
    )
  ) {
    throw new Error(
      `App ${appDefinition.appId} schemaVersion ${appDefinition.schemaVersion} is not compatible with module ${moduleDefinition.moduleId}.`,
    );
  }
}

async function verifyModuleOwnedArtifacts(
  repositoryRoot,
  directoryName,
  definition,
) {
  const moduleRoot = join(repositoryRoot, "modules", directoryName);
  const packageJson = await readRequiredJson(
    join(moduleRoot, "package.json"),
    `modules/${directoryName}/package.json`,
    `modules/${directoryName} is missing package.json.`,
  );
  if (packageJson.name !== definition.packageName) {
    throw new Error(
      `Module ${definition.moduleId} package.json name must be ${definition.packageName}.`,
    );
  }

  const migrationRoot = join(moduleRoot, "migrations");
  const actualMigrations = await collectSqlFiles(
    `modules/${directoryName}/migrations`,
    migrationRoot,
  );

  if (definition.database === null) {
    if (actualMigrations.length !== 0) {
      throw new Error(
        `Module ${definition.moduleId} declares database null but owns SQL migrations.`,
      );
    }
    return;
  }

  const expectedMigrations = [...definition.database.migrations];
  if (
    actualMigrations.length !== expectedMigrations.length ||
    actualMigrations.some(
      (migration, index) => migration !== expectedMigrations[index],
    )
  ) {
    throw new Error(
      `Module ${definition.moduleId} database migrations must list every owned SQL migration in deterministic path order.`,
    );
  }
}

function parseCompatibility(value) {
  if (!isPlainObject(value)) {
    throw new Error("Module definition compatibility must be a JSON object.");
  }
  assertOnlyKeys(value, COMPATIBILITY_KEYS, "module compatibility");

  const versions = value.appDefinitionSchemaVersions;
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(
      "Module compatibility appDefinitionSchemaVersions must be a non-empty array.",
    );
  }

  const normalized = [];
  const seen = new Set();
  for (const version of versions) {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        "Module compatibility appDefinitionSchemaVersions must contain positive integers.",
      );
    }
    if (seen.has(version)) {
      throw new Error(
        "Module compatibility appDefinitionSchemaVersions must not contain duplicates.",
      );
    }
    seen.add(version);
    normalized.push(version);
  }

  const sorted = [...normalized].sort((left, right) => left - right);
  if (sorted.some((version, index) => version !== normalized[index])) {
    throw new Error(
      "Module compatibility appDefinitionSchemaVersions must use ascending order.",
    );
  }

  return Object.freeze({
    appDefinitionSchemaVersions: Object.freeze(normalized),
  });
}

function parseCapabilities(value, moduleId) {
  if (!Array.isArray(value)) {
    throw new Error("Module definition capabilities must be an array.");
  }

  const capabilities = [];
  const seen = new Set();
  for (const capability of value) {
    if (
      typeof capability !== "string" ||
      !CAPABILITY_PATTERN.test(capability) ||
      !capability.startsWith(`${moduleId}:`)
    ) {
      throw new Error(
        `Module capability must match ${CAPABILITY_PATTERN.source} and be namespaced by ${moduleId}.`,
      );
    }
    if (seen.has(capability)) {
      throw new Error("Module definition capabilities must not contain duplicates.");
    }
    seen.add(capability);
    capabilities.push(capability);
  }
  const sorted = [...capabilities].sort((left, right) =>
    left.localeCompare(right),
  );
  if (sorted.some((capability, index) => capability !== capabilities[index])) {
    throw new Error("Module definition capabilities must use deterministic order.");
  }

  return Object.freeze(capabilities);
}

function parseDatabase(value, moduleId) {
  if (value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error("Module definition database must be null or a JSON object.");
  }
  assertOnlyKeys(value, DATABASE_KEYS, "module database");

  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new Error("Module database schemaVersion must be a positive integer.");
  }
  if (!Array.isArray(value.migrations) || value.migrations.length === 0) {
    throw new Error("Module database migrations must be a non-empty array.");
  }

  const root = `modules/${moduleId}/migrations`;
  const migrations = [];
  const seen = new Set();
  for (const migration of value.migrations) {
    if (
      typeof migration !== "string" ||
      migration.length === 0 ||
      migration !== migration.trim() ||
      !migration.endsWith(".sql") ||
      !isAtOrWithin(root, migration)
    ) {
      throw new Error(
        `Module database migration must be a .sql path below ${root}.`,
      );
    }
    if (seen.has(migration)) {
      throw new Error("Module database migrations must not contain duplicates.");
    }
    seen.add(migration);
    migrations.push(migration);
  }

  const sorted = [...migrations].sort((left, right) =>
    left.localeCompare(right),
  );
  if (sorted.some((migration, index) => migration !== migrations[index])) {
    throw new Error(
      "Module database migrations must use deterministic path order.",
    );
  }

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    migrations: Object.freeze(migrations),
  });
}

async function readRequiredJson(path, label, missingMessage) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(missingMessage);
    }
    throw error;
  }

  try {
    const value = JSON.parse(raw);
    if (!isPlainObject(value)) {
      throw new Error(`${label} must contain a JSON object.`);
    }
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} is not valid JSON.`);
    }
    throw error;
  }
}

async function collectSqlFiles(relativeDirectory, absoluteDirectory) {
  const entries = await directoryEntriesOrEmpty(
    absoluteDirectory,
    relativeDirectory,
  );
  const files = [];

  for (const entry of entries) {
    const relativePath = posix.join(relativeDirectory, entry.name);
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Module migration tree must not contain symbolic links: ${relativePath}.`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await collectSqlFiles(relativePath, absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".sql")) {
      files.push(relativePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function directoryEntriesOrEmpty(path, relativePath) {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  if (stats.isSymbolicLink()) {
    throw new Error(
      `Module migration tree must not contain symbolic links: ${relativePath}.`,
    );
  }
  if (!stats.isDirectory()) {
    throw new Error(
      `Module migration path must be a directory: ${relativePath}.`,
    );
  }

  return readdir(path, { withFileTypes: true });
}

function isAtOrWithin(root, candidate) {
  const relative = posix.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith("../") &&
    !posix.isAbsolute(relative)
  );
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `Module definition ${field} must match ${IDENTIFIER_PATTERN.source}.`,
    );
  }
  return value;
}

function requiredDisplayName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    value.trim() !== value
  ) {
    throw new Error(
      "Module definition displayName must be a non-empty trimmed string with at most 80 characters.",
    );
  }
  return value;
}

function requiredPackageName(value, moduleId) {
  const expected = `@appbasis/${moduleId}`;
  if (value !== expected) {
    throw new Error(`Module definition packageName must be ${expected}.`);
  }
  return value;
}

function assertOnlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown ${label} field: ${key}.`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`Missing ${label} field: ${key}.`);
    }
  }
}

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

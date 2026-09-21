import { readFile, readdir } from "node:fs/promises";
import { posix, join } from "node:path";

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
    const path = join(modulesDirectory, directoryName, MODULE_DEFINITION_FILE);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          `modules/${directoryName} is missing ${MODULE_DEFINITION_FILE}.`,
        );
      }
      if (error instanceof SyntaxError) {
        throw new Error(
          `modules/${directoryName}/${MODULE_DEFINITION_FILE} is not valid JSON.`,
        );
      }
      throw error;
    }

    const definition = parseModuleDefinition(parsed, { directoryName });
    if (ids.has(definition.moduleId)) {
      throw new Error(`Duplicate moduleId: ${definition.moduleId}.`);
    }
    ids.add(definition.moduleId);
    definitions.push(definition);
  }

  return Object.freeze(definitions);
}

export async function verifyModuleDefinitions(repositoryRoot = process.cwd()) {
  return readModuleDefinitions(repositoryRoot);
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

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    migrations: Object.freeze(migrations),
  });
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

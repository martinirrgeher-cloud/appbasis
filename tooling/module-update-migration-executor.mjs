import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

import {
  loadRepositoryOwnerMigrationPlan,
  validatePostgresConnectionString,
} from "./database-migration-executor.mjs";
import { planModuleUpdate } from "./module-update-plan.mjs";

const IDENTIFIER_SOURCE = '(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))';
const IDENTIFIER_END = '(?=\\s|$|\\(|,|;)';

export class ModuleUpdateMigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModuleUpdateMigrationConfigurationError";
  }
}

export class ModuleUpdateMigrationExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModuleUpdateMigrationExecutionError";
  }
}

export async function loadModuleUpdateMigrationExecutionPlan(
  { appId, moduleId } = {},
  options = {},
) {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const updatePlan = await planModuleUpdate(
    { appId, moduleId },
    { repositoryRoot },
  );

  if (updatePlan.module.databaseSchemaVersion === null) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B requires a database-owning target module.",
    );
  }

  const repositoryContract = await resolveRepositoryMigrationContract({
    repositoryRoot,
    updatePlan,
  });
  const { baselineOwners, targetOwner, repositoryState } = repositoryContract;

  if (baselineOwners.length === 0) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B requires a non-empty existing database baseline.",
    );
  }

  const baselinePlan = [];
  for (const owner of baselineOwners) {
    baselinePlan.push(
      ...(await loadRepositoryOwnerMigrationPlan({
        repositoryRoot,
        owner,
        ConfigurationError: ModuleUpdateMigrationConfigurationError,
      })),
    );
  }

  const targetPlan = await loadRepositoryOwnerMigrationPlan({
    repositoryRoot,
    owner: targetOwner,
    ConfigurationError: ModuleUpdateMigrationConfigurationError,
  });

  const baselineCatalogContract = createCatalogContract(
    baselinePlan,
    "baseline",
  );
  const targetCatalogContract = createCatalogContract(targetPlan, "target");
  assertTargetCatalogIsolation({
    baselineCatalogContract,
    targetCatalogContract,
  });
  if (
    targetCatalogContract.length === 0 ||
    targetCatalogContract.some((marker) => marker.present !== true)
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B target migrations require a non-destructive catalog marker contract.",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    operation: "module-install-migrations",
    application: updatePlan.app.appId,
    moduleId: updatePlan.module.moduleId,
    repositoryState,
    beforeOwnerIds: Object.freeze(
      baselineOwners.map((owner) => owner.id),
    ),
    targetOwner: Object.freeze({
      id: targetOwner.id,
      root: targetOwner.root,
      schemaVersion: targetOwner.schemaVersion,
      migrations: Object.freeze([...targetOwner.migrations]),
    }),
    baselineCatalogContract,
    targetCatalogContract,
    migrations: Object.freeze(
      targetPlan.map((migration) =>
        Object.freeze({
          ownerId: migration.ownerId,
          relativePath: migration.relativePath,
          statements: Object.freeze([...migration.statements]),
        }),
      ),
    ),
  });
}

async function resolveRepositoryMigrationContract({
  repositoryRoot,
  updatePlan,
}) {
  if (
    updatePlan.state === "install" &&
    updatePlan.changes.databaseMigrationDelta !== null &&
    updatePlan.changes.databaseManifest !== null
  ) {
    const beforeManifest = updatePlan.changes.databaseManifest.before;
    const afterManifest = updatePlan.changes.databaseManifest.after;
    if (
      !isDatabaseManifest(beforeManifest, updatePlan.app.appId) ||
      !isDatabaseManifest(afterManifest, updatePlan.app.appId)
    ) {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B requires canonical before/after database manifests.",
      );
    }

    return Object.freeze({
      repositoryState: "pending-repository-update",
      baselineOwners: Object.freeze([...beforeManifest.owners]),
      targetOwner: updatePlan.changes.databaseMigrationDelta.addedOwner,
    });
  }

  if (updatePlan.state !== "already-installed") {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B requires a pending or canonically published database-owning module installation.",
    );
  }

  const manifestPath = join(
    repositoryRoot,
    "apps",
    updatePlan.app.appId,
    "appbasis.database.json",
  );
  let currentManifest;
  try {
    currentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B published target database manifest could not be read.",
    );
  }
  if (!isDatabaseManifest(currentManifest, updatePlan.app.appId)) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B published target database manifest is invalid.",
    );
  }

  const targetOwners = currentManifest.owners.filter(
    (owner) => owner.id === updatePlan.module.moduleId,
  );
  if (targetOwners.length !== 1) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B published target must contain exactly one target module database owner.",
    );
  }

  const targetOwner = targetOwners[0];
  if (
    targetOwner.root !== `modules/${updatePlan.module.moduleId}` ||
    targetOwner.schemaVersion !== updatePlan.module.databaseSchemaVersion
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B published target owner does not match the verified module contract.",
    );
  }

  const baselineOwners = currentManifest.owners.filter(
    (owner) => owner.id !== updatePlan.module.moduleId,
  );

  return Object.freeze({
    repositoryState: "published-target",
    baselineOwners: Object.freeze(baselineOwners),
    targetOwner: Object.freeze(targetOwner),
  });
}

export async function applyModuleUpdateMigrations(
  {
    appId,
    moduleId,
    connectionString,
    expectedDatabase,
    expectedPrincipal,
  } = {},
  options = {},
) {
  const executionPlan = await loadModuleUpdateMigrationExecutionPlan(
    { appId, moduleId },
    options,
  );
  assertExpectedDatabase(expectedDatabase);
  const normalizedConnectionString = validatePostgresConnectionString(
    connectionString,
    {
      expectedDatabase,
      ConfigurationError: ModuleUpdateMigrationConfigurationError,
    },
  );
  assertConnectionPrincipal(
    normalizedConnectionString,
    expectedPrincipal,
  );

  const createDatabase = options.createDatabase ?? createPostgresDatabase;
  if (typeof createDatabase !== "function") {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B migration database factory is unavailable.",
    );
  }

  let connection;
  try {
    connection = createDatabase(normalizedConnectionString);
  } catch {
    throw new ModuleUpdateMigrationExecutionError(
      "FC6-B migration database connection could not be created.",
    );
  }

  let primaryError;
  let statementCount = 0;
  try {
    await connection.client.begin(async (transaction) => {
      await verifyTargetIdentity(transaction, {
        expectedDatabase,
        expectedPrincipal,
      });

      await transaction`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`${executionPlan.application}:${executionPlan.moduleId}`},
            0
          )
        )
      `;

      await verifyCatalogContract(
        transaction,
        executionPlan.baselineCatalogContract,
        "FC6-B existing database baseline does not match the expected app contract.",
      );

      if (
        await anyCatalogMarkerExists(
          transaction,
          executionPlan.targetCatalogContract,
        )
      ) {
        throw new ModuleUpdateMigrationExecutionError(
          "FC6-B target module appears already or partially applied.",
        );
      }

      for (const migration of executionPlan.migrations) {
        for (const statement of migration.statements) {
          await transaction.unsafe(statement);
          statementCount += 1;
        }
      }

      await verifyCatalogContract(
        transaction,
        executionPlan.targetCatalogContract,
        "FC6-B target module migration did not reach its catalog contract.",
      );
    });

    return Object.freeze({
      state: "applied",
      application: executionPlan.application,
      moduleId: executionPlan.moduleId,
      migrationCount: executionPlan.migrations.length,
      statementCount,
      baselineMarkerCount: executionPlan.baselineCatalogContract.length,
      targetMarkerCount: executionPlan.targetCatalogContract.length,
    });
  } catch (error) {
    primaryError = error;
    if (error instanceof ModuleUpdateMigrationExecutionError) throw error;
    throw new ModuleUpdateMigrationExecutionError(
      "FC6-B module migration transaction failed and was rolled back.",
    );
  } finally {
    try {
      await connection.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new ModuleUpdateMigrationExecutionError(
          "FC6-B migration database connection could not be closed cleanly.",
        );
      }
    }
  }
}

export function createCatalogContract(plan, label = "migration") {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new ModuleUpdateMigrationConfigurationError(
      `FC6-B ${label} migration plan is empty.`,
    );
  }

  const finalMarkers = new Map();
  for (const migration of plan) {
    if (!Array.isArray(migration?.statements) || migration.statements.length === 0) {
      throw new ModuleUpdateMigrationConfigurationError(
        `FC6-B ${label} migration entry is invalid.`,
      );
    }
    for (const statement of migration.statements) {
      const commands = splitSqlCommands(statement);
      if (commands.length === 0) {
        throw new ModuleUpdateMigrationConfigurationError(
          `FC6-B ${label} migration contains no executable SQL command.`,
        );
      }
      for (const command of commands) {
        const markers = catalogMarkersFromStatement(command);
        if (markers.length === 0) {
          throw new ModuleUpdateMigrationConfigurationError(
            `FC6-B ${label} migration contains a statement without a verifiable catalog marker.`,
          );
        }
        for (const marker of markers) {
          finalMarkers.set(catalogMarkerKey(marker), marker);
        }
      }
    }
  }

  return Object.freeze(
    [...finalMarkers.values()]
      .sort((left, right) =>
        catalogMarkerKey(left).localeCompare(catalogMarkerKey(right)),
      )
      .map((marker) => Object.freeze(marker)),
  );
}

function catalogMarkersFromStatement(statement) {
  if (typeof statement !== "string") return [];
  const normalized = stripLeadingSqlComments(statement);
  if (normalized.length === 0) return [];

  const createTable = new RegExp(
    `^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}\\s*\\(([\\s\\S]*)\\)\\s*;?$`,
    "i",
  ).exec(normalized);
  if (createTable !== null) {
    const table = capturedIdentifier(createTable, 1, 2);
    const markers = [
      { kind: "table", name: table, present: true },
    ];
    for (const segment of splitTopLevel(createTable[3])) {
      const trimmed = segment.trim();
      const namedConstraint = new RegExp(
        `^CONSTRAINT\\s+${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
        "i",
      ).exec(trimmed);
      if (namedConstraint !== null) {
        markers.push({
          kind: "constraint",
          table,
          name: capturedIdentifier(namedConstraint, 1, 2),
          present: true,
        });
        continue;
      }
      if (/^(?:PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)\b/i.test(trimmed)) {
        continue;
      }
      const column = new RegExp(`^${IDENTIFIER_SOURCE}${IDENTIFIER_END}`, "i").exec(trimmed);
      if (column !== null) {
        markers.push({
          kind: "column",
          table,
          name: capturedIdentifier(column, 1, 2),
          present: true,
        });
      }
    }
    return markers;
  }

  const createIndex = new RegExp(
    `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}\\s+ON\\s+${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
    "i",
  ).exec(normalized);
  if (createIndex !== null) {
    return [
      {
        kind: "index",
        table: capturedIdentifier(createIndex, 3, 4),
        name: capturedIdentifier(createIndex, 1, 2),
        present: true,
      },
    ];
  }

  const alterTable = new RegExp(
    `^ALTER\\s+TABLE\\s+${IDENTIFIER_SOURCE}\\s+([\\s\\S]+?)\\s*;?$`,
    "i",
  ).exec(normalized);
  if (alterTable !== null) {
    const table = capturedIdentifier(alterTable, 1, 2);
    const markers = [];
    for (const action of splitTopLevel(alterTable[3])) {
      const trimmed = action.trim();
      let matched = false;

      const addConstraint = new RegExp(
        `^ADD\\s+CONSTRAINT\\s+${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
        "i",
      ).exec(trimmed);
      if (addConstraint !== null) {
        markers.push({
          kind: "constraint",
          table,
          name: capturedIdentifier(addConstraint, 1, 2),
          present: true,
        });
        matched = true;
        continue;
      }

      const dropConstraint = new RegExp(
        `^DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
        "i",
      ).exec(trimmed);
      if (dropConstraint !== null) {
        markers.push({
          kind: "constraint",
          table,
          name: capturedIdentifier(dropConstraint, 1, 2),
          present: false,
        });
        matched = true;
        continue;
      }

      const addColumn = new RegExp(
        `^ADD\\s+(?:COLUMN\\s+)?${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
        "i",
      ).exec(trimmed);
      if (addColumn !== null) {
        markers.push({
          kind: "column",
          table,
          name: capturedIdentifier(addColumn, 1, 2),
          present: true,
        });
        matched = true;
        continue;
      }

      const dropColumn = new RegExp(
        `^DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
        "i",
      ).exec(trimmed);
      if (dropColumn !== null) {
        markers.push({
          kind: "column",
          table,
          name: capturedIdentifier(dropColumn, 1, 2),
          present: false,
        });
        matched = true;
      }

      if (!matched) return [];
    }
    return markers;
  }

  return [];
}

function assertTargetCatalogIsolation({
  baselineCatalogContract,
  targetCatalogContract,
}) {
  const baselineTables = new Set(
    baselineCatalogContract
      .filter((marker) => marker.kind === "table" && marker.present === true)
      .map((marker) => marker.name),
  );
  const targetTables = new Set(
    targetCatalogContract
      .filter((marker) => marker.kind === "table" && marker.present === true)
      .map((marker) => marker.name),
  );

  for (const table of targetTables) {
    if (baselineTables.has(table)) {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B target module attempts to create or own a baseline-owned table.",
      );
    }
  }

  for (const marker of targetCatalogContract) {
    if (marker.kind === "table") continue;
    if (
      typeof marker.table !== "string" ||
      !targetTables.has(marker.table) ||
      baselineTables.has(marker.table)
    ) {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B target module attempts to modify a table outside its own migration delta.",
      );
    }
  }
}

function stripLeadingSqlComments(value) {
  let index = 0;

  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index])) index += 1;

    if (value[index] === "-" && value[index + 1] === "-") {
      index += 2;
      while (index < value.length && value[index] !== "\n") index += 1;
      continue;
    }

    if (value[index] === "/" && value[index + 1] === "*") {
      index = skipSqlBlockComment(value, index);
      continue;
    }

    break;
  }

  return value.slice(index).trim();
}

async function verifyTargetIdentity(
  transaction,
  { expectedDatabase, expectedPrincipal },
) {
  const rows = await transaction`
    SELECT
      current_database() AS database_name,
      current_user AS principal_name
  `;
  if (
    rows.length !== 1 ||
    rows[0]?.database_name !== expectedDatabase ||
    rows[0]?.principal_name !== expectedPrincipal
  ) {
    throw new ModuleUpdateMigrationExecutionError(
      "FC6-B database connection did not select the required database and principal.",
    );
  }
}

async function verifyCatalogContract(transaction, contract, message) {
  for (const marker of contract) {
    const exists = await catalogMarkerExists(transaction, marker);
    if (exists !== marker.present) {
      throw new ModuleUpdateMigrationExecutionError(message);
    }
  }
}

async function anyCatalogMarkerExists(transaction, contract) {
  for (const marker of contract) {
    if (marker.present && (await catalogMarkerExists(transaction, marker))) {
      return true;
    }
  }
  return false;
}

async function catalogMarkerExists(transaction, marker) {
  if (marker.kind === "table") {
    const rows = await transaction`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ${marker.name}
          AND c.relkind IN ('r', 'p')
      ) AS present
    `;
    return rows[0]?.present === true;
  }

  if (marker.kind === "index") {
    const rows = await transaction`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
        JOIN pg_catalog.pg_class rel ON rel.oid = i.indrelid
        WHERE n.nspname = 'public'
          AND c.relname = ${marker.name}
          AND c.relkind = 'i'
          AND rel.relname = ${marker.table}
      ) AS present
    `;
    return rows[0]?.present === true;
  }

  if (marker.kind === "column") {
    const rows = await transaction`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${marker.table}
          AND column_name = ${marker.name}
      ) AS present
    `;
    return rows[0]?.present === true;
  }

  if (marker.kind === "constraint") {
    const rows = await transaction`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = ${marker.table}
          AND con.conname = ${marker.name}
      ) AS present
    `;
    return rows[0]?.present === true;
  }

  throw new ModuleUpdateMigrationConfigurationError(
    "FC6-B catalog marker kind is unsupported.",
  );
}

function assertExpectedDatabase(expectedDatabase) {
  if (
    typeof expectedDatabase !== "string" ||
    expectedDatabase.length === 0 ||
    expectedDatabase.trim() !== expectedDatabase
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B expectedDatabase must be an explicit PostgreSQL database.",
    );
  }
}

function assertConnectionPrincipal(connectionString, expectedPrincipal) {
  if (
    typeof expectedPrincipal !== "string" ||
    expectedPrincipal.length === 0 ||
    expectedPrincipal.trim() !== expectedPrincipal ||
    expectedPrincipal.length > 63
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B expectedPrincipal must be an explicit PostgreSQL principal.",
    );
  }

  const url = new URL(connectionString);
  let configuredPrincipal;
  try {
    configuredPrincipal = decodeURIComponent(url.username);
  } catch {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B PostgreSQL principal in the connection URL is invalid.",
    );
  }
  if (
    configuredPrincipal.length === 0 ||
    configuredPrincipal !== expectedPrincipal
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B PostgreSQL connection principal does not match expectedPrincipal.",
    );
  }
}

function isDatabaseManifest(value, application) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.manifestVersion === 1 &&
    value.application === application &&
    value.dialect === "postgresql" &&
    Array.isArray(value.owners) &&
    value.owners.length > 0
  );
}

function capturedIdentifier(match, quotedIndex, plainIndex) {
  const value = match[quotedIndex] ?? match[plainIndex];
  return value.replaceAll('""', '"');
}

function catalogMarkerKey(marker) {
  return [
    marker.kind,
    marker.table ?? "",
    marker.name,
  ].join(":");
}

function splitSqlCommands(value) {
  if (typeof value !== "string") return [];

  const commands = [];
  let start = 0;
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "-" && next === "-") {
      index += 2;
      while (index < value.length && value[index] !== "\n") index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index = skipSqlBlockComment(value, index);
      continue;
    }

    if (char === "'") {
      index = skipSqlSingleQuotedString(value, index);
      continue;
    }

    if (char === '"') {
      index = skipSqlDoubleQuotedIdentifier(value, index);
      continue;
    }

    if (char === "$") {
      const marker =
        value.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (marker !== undefined) {
        const closingIndex = value.indexOf(marker, index + marker.length);
        index =
          closingIndex === -1
            ? value.length
            : closingIndex + marker.length;
        continue;
      }
    }

    if (char === ";") {
      const command = value.slice(start, index + 1).trim();
      if (command.length > 0) commands.push(command);
      start = index + 1;
    }
    index += 1;
  }

  const tail = value.slice(start).trim();
  if (tail.length > 0) commands.push(tail);
  return commands;
}

function skipSqlSingleQuotedString(value, start) {
  const escapeBackslash =
    start > 0 &&
    (value[start - 1] === "E" || value[start - 1] === "e") &&
    (start < 2 || !/[A-Za-z0-9_$]/.test(value[start - 2]));
  let index = start + 1;
  while (index < value.length) {
    if (value[index] === "'" && value[index + 1] === "'") {
      index += 2;
      continue;
    }
    if (escapeBackslash && value[index] === "\\" && index + 1 < value.length) {
      index += 2;
      continue;
    }
    if (value[index] === "'") return index + 1;
    index += 1;
  }
  return value.length;
}

function skipSqlDoubleQuotedIdentifier(value, start) {
  let index = start + 1;
  while (index < value.length) {
    if (value[index] === '"' && value[index + 1] === '"') {
      index += 2;
      continue;
    }
    if (value[index] === '"') return index + 1;
    index += 1;
  }
  return value.length;
}

function skipSqlBlockComment(value, start) {
  let depth = 1;
  let index = start + 2;
  while (index < value.length && depth > 0) {
    if (value[index] === "/" && value[index + 1] === "*") {
      depth += 1;
      index += 2;
      continue;
    }
    if (value[index] === "*" && value[index + 1] === "/") {
      depth -= 1;
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (quote === "'") {
      if (char === "'" && next === "'") {
        index += 1;
        continue;
      }
      if (char === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (char === '"' && next === '"') {
        index += 1;
        continue;
      }
      if (char === '"') quote = null;
      continue;
    }
    if (char === "'") {
      quote = "'";
      continue;
    }
    if (char === '"') {
      quote = '"';
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      continue;
    }
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}

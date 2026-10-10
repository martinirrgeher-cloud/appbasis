import { createHash } from "node:crypto";
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

  const allowedUnsupportedMigrationPaths =
    await loadBaselineCatalogExceptionPaths({
      repositoryRoot,
      appId: updatePlan.app.appId,
      baselinePlan,
      targetPlan,
    });

  const baselineCatalogContract = createCatalogContract(
    baselinePlan,
    "baseline",
    { allowedUnsupportedMigrationPaths },
  );
  const targetCatalogContract = createCatalogContract(targetPlan, "target");
  assertTargetMigrationReferencePolicy({
    plan: targetPlan,
    targetCatalogContract,
  });
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

  assertUniqueManifestOwnerIds(currentManifest.owners);

  const targetOwners = currentManifest.owners.filter(
    (owner) => owner.id === updatePlan.module.moduleId,
  );
  if (targetOwners.length !== 1) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B published target must contain exactly one target module database owner.",
    );
  }

  const targetOwner = targetOwners[0];
  const moduleManifestPath = join(
    repositoryRoot,
    "modules",
    updatePlan.module.moduleId,
    "appbasis.module.json",
  );
  let moduleManifest;
  try {
    moduleManifest = JSON.parse(await readFile(moduleManifestPath, "utf8"));
  } catch {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B verified module manifest could not be read.",
    );
  }
  const expectedTargetOwner = {
    id: updatePlan.module.moduleId,
    root: `modules/${updatePlan.module.moduleId}`,
    schemaVersion: moduleManifest?.database?.schemaVersion,
    migrations: moduleManifest?.database?.migrations,
  };
  if (
    targetOwner.root !== expectedTargetOwner.root ||
    targetOwner.schemaVersion !== updatePlan.module.databaseSchemaVersion ||
    JSON.stringify(targetOwner) !== JSON.stringify(expectedTargetOwner)
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
      repositoryState: executionPlan.repositoryState,
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

export function createCatalogContract(plan, label = "migration", options = {}) {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new ModuleUpdateMigrationConfigurationError(
      `FC6-B ${label} migration plan is empty.`,
    );
  }

  const allowedUnsupportedMigrationPaths =
    options.allowedUnsupportedMigrationPaths ?? new Set();
  if (!(allowedUnsupportedMigrationPaths instanceof Set)) {
    throw new ModuleUpdateMigrationConfigurationError(
      `FC6-B ${label} unsupported-migration allowlist is invalid.`,
    );
  }

  const finalMarkers = new Map();
  const constraintEvidence = createConstraintEvidenceState();

  for (const migration of plan) {
    if (
      typeof migration?.relativePath !== "string" ||
      migration.relativePath.length === 0 ||
      !Array.isArray(migration.statements) ||
      migration.statements.length === 0
    ) {
      throw new ModuleUpdateMigrationConfigurationError(
        `FC6-B ${label} migration entry is invalid.`,
      );
    }
    const migrationAllowsUnsupportedStatements =
      allowedUnsupportedMigrationPaths.has(migration.relativePath);

    for (const statement of migration.statements) {
      const commands = splitSqlCommands(statement);
      if (commands.length === 0) {
        throw new ModuleUpdateMigrationConfigurationError(
          `FC6-B ${label} migration contains no executable SQL command.`,
        );
      }
      for (const command of commands) {
        applyConstraintCountEvidence(command, constraintEvidence, label);

        const markers = catalogMarkersFromStatement(command);
        if (markers.length === 0) {
          if (migrationAllowsUnsupportedStatements) continue;
          throw new ModuleUpdateMigrationConfigurationError(
            `FC6-B ${label} migration contains a statement without a verifiable catalog marker.`,
          );
        }
        for (const marker of markers) {
          if (
            marker.kind === "constraint" &&
            marker.present === false &&
            constraintEvidence.createdConstraintNames.has(
              namedConstraintKey(marker.table, marker.name),
            )
          ) {
            // A constraint created and removed entirely inside this migration
            // plan is transient target DDL, not a destructive final-state
            // requirement. Baseline-owned drops are never added to this set
            // and therefore remain fail-closed.
            finalMarkers.delete(catalogMarkerKey(marker));
            continue;
          }
          finalMarkers.set(catalogMarkerKey(marker), marker);
        }
      }
    }
  }

  for (const table of constraintEvidence.trackedTables) {
    for (const constraintType of ["c", "f", "p", "u", "x"]) {
      const marker = {
        kind: "constraint-count",
        table,
        name: constraintType,
        count:
          constraintEvidence.counts.get(
            constraintCountKey(table, constraintType),
          ) ?? 0,
        present: true,
      };
      finalMarkers.set(catalogMarkerKey(marker), marker);
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

export async function loadBaselineCatalogExceptionPaths({
  repositoryRoot,
  appId,
  baselinePlan,
  targetPlan,
}) {
  const path = join(
    repositoryRoot,
    "apps",
    appId,
    "appbasis.database-baseline-catalog-exceptions.json",
  );

  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B baseline catalog exception evidence could not be read.",
    );
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B baseline catalog exception evidence is invalid JSON.",
    );
  }

  const configKeys =
    config !== null && typeof config === "object" && !Array.isArray(config)
      ? Object.keys(config).sort()
      : [];
  if (
    JSON.stringify(configKeys) !==
      JSON.stringify(["application", "exceptions", "schemaVersion"]) ||
    config.schemaVersion !== 1 ||
    config.application !== appId ||
    !Array.isArray(config.exceptions) ||
    config.exceptions.length === 0
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B baseline catalog exception evidence is invalid.",
    );
  }

  const baselinePaths = new Set(
    baselinePlan.map((migration) => migration.relativePath),
  );
  const targetPaths = new Set(
    targetPlan.map((migration) => migration.relativePath),
  );
  const allowedPaths = new Set();

  for (const exception of config.exceptions) {
    const exceptionKeys =
      exception !== null &&
      typeof exception === "object" &&
      !Array.isArray(exception)
        ? Object.keys(exception).sort()
        : [];
    if (
      JSON.stringify(exceptionKeys) !==
        JSON.stringify(["classification", "migration", "sha256"]) ||
      exception.classification !== "historical-access-control-only" ||
      typeof exception.migration !== "string" ||
      !exception.migration.startsWith(`apps/${appId}/migrations/`) ||
      !/^[0-9a-f]{64}$/.test(exception.sha256) ||
      !baselinePaths.has(exception.migration) ||
      targetPaths.has(exception.migration) ||
      allowedPaths.has(exception.migration)
    ) {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B baseline catalog exception evidence contains an invalid entry.",
      );
    }

    let migrationSql;
    try {
      migrationSql = await readFile(
        join(repositoryRoot, exception.migration),
        "utf8",
      );
    } catch {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B baseline catalog exception migration could not be read.",
      );
    }
    const digest = createHash("sha256").update(migrationSql, "utf8").digest("hex");
    if (digest !== exception.sha256) {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B baseline catalog exception migration has drifted from its reviewed digest.",
      );
    }

    allowedPaths.add(exception.migration);
  }

  return allowedPaths;
}

function createConstraintEvidenceState() {
  return {
    trackedTables: new Set(),
    counts: new Map(),
    namedTypes: new Map(),
    createdConstraintNames: new Set(),
  };
}

function applyConstraintCountEvidence(statement, state, label) {
  const normalized = stripLeadingSqlComments(statement);
  if (normalized.length === 0) return;

  const createTable = new RegExp(
    `^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}\\s*\\(([\\s\\S]*)\\)\\s*;?$`,
    "i",
  ).exec(normalized);

  if (createTable !== null) {
    const table = capturedIdentifier(createTable, 1, 2);
    if (state.trackedTables.has(table)) {
      throw new ModuleUpdateMigrationConfigurationError(
        `FC6-B ${label} migration creates the same table more than once.`,
      );
    }

    state.trackedTables.add(table);
    for (const constraintType of ["c", "f", "p", "u", "x"]) {
      state.counts.set(constraintCountKey(table, constraintType), 0);
    }

    for (const segment of splitTopLevel(createTable[3])) {
      const trimmed = stripLeadingSqlComments(segment);
      if (trimmed.length === 0) {
        throw new ModuleUpdateMigrationConfigurationError(
          `FC6-B ${label} migration contains an empty CREATE TABLE element.`,
        );
      }

      const namedConstraint = parseNamedConstraintClause(trimmed);
      if (namedConstraint !== null) {
        const constraintType = constraintTypeFromClause(namedConstraint.clause);
        if (constraintType === null) {
          throw new ModuleUpdateMigrationConfigurationError(
            `FC6-B ${label} migration contains an unsupported named constraint.`,
          );
        }
        adjustConstraintCount(state, table, constraintType, 1, label);
        const key = namedConstraintKey(table, namedConstraint.name);
        state.namedTypes.set(key, constraintType);
        state.createdConstraintNames.add(key);
        continue;
      }

      const tableConstraintType = constraintTypeFromClause(trimmed);
      if (tableConstraintType !== null) {
        adjustConstraintCount(state, table, tableConstraintType, 1, label);
        if (tableConstraintType === "p") {
          rememberPostgresDefaultPrimaryKeyName(state, table, label);
        }
        continue;
      }

      const column = new RegExp(
        `^${IDENTIFIER_SOURCE}\\s+([\\s\\S]+)$`,
        "i",
      ).exec(trimmed);
      if (column === null) {
        throw new ModuleUpdateMigrationConfigurationError(
          `FC6-B ${label} migration contains an unprovable CREATE TABLE element.`,
        );
      }

      const columnTypes = columnConstraintTypes(column[3]);
      for (const constraintType of columnTypes) {
        adjustConstraintCount(state, table, constraintType, 1, label);
      }
      if (columnTypes.includes("p")) {
        rememberPostgresDefaultPrimaryKeyName(state, table, label);
      }
    }
    return;
  }

  const alterTable = new RegExp(
    `^ALTER\\s+TABLE\\s+${IDENTIFIER_SOURCE}\\s+([\\s\\S]+?)\\s*;?$`,
    "i",
  ).exec(normalized);
  if (alterTable === null) return;

  const table = capturedIdentifier(alterTable, 1, 2);
  if (!state.trackedTables.has(table)) return;

  for (const action of splitTopLevel(alterTable[3])) {
    const trimmed = action.trim();

    const addConstraint = new RegExp(
      `^ADD\\s+CONSTRAINT\\s+${IDENTIFIER_SOURCE}\\s+([\\s\\S]+)$`,
      "i",
    ).exec(trimmed);
    if (addConstraint !== null) {
      const name = capturedIdentifier(addConstraint, 1, 2);
      const constraintType = constraintTypeFromClause(addConstraint[3]);
      if (constraintType === null) {
        throw new ModuleUpdateMigrationConfigurationError(
          `FC6-B ${label} migration contains an unsupported added constraint.`,
        );
      }
      adjustConstraintCount(state, table, constraintType, 1, label);
      const key = namedConstraintKey(table, name);
      state.namedTypes.set(key, constraintType);
      state.createdConstraintNames.add(key);
      continue;
    }

    const dropConstraint = new RegExp(
      `^DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
      "i",
    ).exec(trimmed);
    if (dropConstraint !== null) {
      const name = capturedIdentifier(dropConstraint, 1, 2);
      const key = namedConstraintKey(table, name);
      const constraintType = state.namedTypes.get(key);
      if (constraintType === undefined) {
        throw new ModuleUpdateMigrationConfigurationError(
          `FC6-B ${label} migration drops a constraint whose type cannot be proven.`,
        );
      }
      adjustConstraintCount(state, table, constraintType, -1, label);
      state.namedTypes.delete(key);
      continue;
    }

    const addColumn = new RegExp(
      `^ADD\\s+(?:COLUMN\\s+)?${IDENTIFIER_SOURCE}\\s+([\\s\\S]+)$`,
      "i",
    ).exec(trimmed);
    if (addColumn !== null) {
      for (const constraintType of columnConstraintTypes(addColumn[3])) {
        adjustConstraintCount(state, table, constraintType, 1, label);
      }
      continue;
    }

    if (
      new RegExp(
        `^DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?${IDENTIFIER_SOURCE}${IDENTIFIER_END}`,
        "i",
      ).test(trimmed)
    ) {
      throw new ModuleUpdateMigrationConfigurationError(
        `FC6-B ${label} migration drops a column whose implicit constraint changes cannot be proven.`,
      );
    }
  }
}

function parseNamedConstraintClause(value) {
  const match = new RegExp(
    `^CONSTRAINT\\s+${IDENTIFIER_SOURCE}\\s+([\\s\\S]+)$`,
    "i",
  ).exec(value);
  if (match === null) return null;

  return {
    name: capturedIdentifier(match, 1, 2),
    clause: match[3].trim(),
  };
}

function constraintTypeFromClause(value) {
  const normalized = stripLeadingSqlComments(value).trim();
  if (/^PRIMARY\s+KEY\b/i.test(normalized)) return "p";
  if (/^UNIQUE\b/i.test(normalized)) return "u";
  if (/^CHECK\b/i.test(normalized)) return "c";
  if (/^FOREIGN\s+KEY\b/i.test(normalized)) return "f";
  if (/^EXCLUDE\b/i.test(normalized)) return "x";
  return null;
}

function columnConstraintTypes(value) {
  const words = topLevelSqlWords(value);
  const types = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (word === "PRIMARY" && words[index + 1] === "KEY") {
      types.push("p");
      index += 1;
      continue;
    }
    if (word === "UNIQUE") {
      types.push("u");
      continue;
    }
    if (word === "CHECK") {
      types.push("c");
      continue;
    }
    if (word === "REFERENCES") {
      types.push("f");
    }
  }

  return types;
}

function topLevelSqlWords(value) {
  const words = [];
  let depth = 0;
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
    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < value.length && /[A-Za-z0-9_$]/.test(value[index])) {
        index += 1;
      }
      words.push(value.slice(start, index).toUpperCase());
      continue;
    }
    index += 1;
  }

  return words;
}

function rememberPostgresDefaultPrimaryKeyName(state, table, label) {
  const generatedName = `${table}_pkey`;
  // PostgreSQL truncates generated identifiers beyond NAMEDATALEN. Do not
  // guess a truncated name: only prove the canonical untruncated default.
  if (
    !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table) ||
    Buffer.byteLength(generatedName, "utf8") > 63
  ) {
    return;
  }
  const key = namedConstraintKey(table, generatedName);
  if (state.namedTypes.has(key)) {
    throw new ModuleUpdateMigrationConfigurationError(
      `FC6-B ${label} migration creates an ambiguous implicit primary-key name.`,
    );
  }
  state.namedTypes.set(key, "p");
  state.createdConstraintNames.add(key);
}

function adjustConstraintCount(state, table, constraintType, delta, label) {
  const key = constraintCountKey(table, constraintType);
  const next = (state.counts.get(key) ?? 0) + delta;
  if (next < 0) {
    throw new ModuleUpdateMigrationConfigurationError(
      `FC6-B ${label} migration produces an invalid constraint count.`,
    );
  }
  state.counts.set(key, next);
}

function constraintCountKey(table, constraintType) {
  return `${table}\u0000${constraintType}`;
}

function namedConstraintKey(table, name) {
  return `${table}\u0000${name}`;
}

function catalogMarkersFromStatement(statement) {
  if (typeof statement !== "string") return [];
  const normalized = stripLeadingSqlComments(statement);
  if (normalized.length === 0) return [];

  if (containsTopLevelCreateTableInheritance(normalized)) return [];

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
      const trimmed = stripLeadingSqlComments(segment);
      if (trimmed.length === 0) return [];

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
      if (column === null) return [];

      markers.push({
        kind: "column",
        table,
        name: capturedIdentifier(column, 1, 2),
        present: true,
      });
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

function assertTargetMigrationReferencePolicy({
  plan,
  targetCatalogContract,
}) {
  const targetTables = new Set(
    targetCatalogContract
      .filter((marker) => marker.kind === "table" && marker.present === true)
      .map((marker) => marker.name),
  );

  for (const migration of plan) {
    for (const statement of migration.statements) {
      for (const command of splitSqlCommands(statement)) {
        if (!containsSqlKeyword(command, "REFERENCES")) continue;

        const references = referencedRelationsFromSqlCommand(command);
        if (references.length === 0) {
          throw new ModuleUpdateMigrationConfigurationError(
            "FC6-B target migration REFERENCES clause could not be proven.",
          );
        }

        for (const reference of references) {
          if (
            (reference.schema !== null && reference.schema !== "public") ||
            !targetTables.has(reference.table)
          ) {
            throw new ModuleUpdateMigrationConfigurationError(
              "FC6-B target migrations may only use REFERENCES to tables owned by the target module until an explicit public module dependency contract exists.",
            );
          }
        }
      }
    }
  }
}

function referencedRelationsFromSqlCommand(value) {
  const tokens = sqlReferenceTokens(value);
  const references = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.kind !== "identifier" ||
      token.keyword !== "REFERENCES"
    ) {
      continue;
    }

    const first = tokens[index + 1];
    if (first?.kind !== "identifier") {
      throw new ModuleUpdateMigrationConfigurationError(
        "FC6-B target migration REFERENCES target is not a provable relation.",
      );
    }

    let schema = null;
    let table = first.value;
    index += 1;

    if (tokens[index + 1]?.kind === "dot") {
      const second = tokens[index + 2];
      if (second?.kind !== "identifier") {
        throw new ModuleUpdateMigrationConfigurationError(
          "FC6-B target migration REFERENCES target is not a provable relation.",
        );
      }
      schema = table;
      table = second.value;
      index += 2;

      if (tokens[index + 1]?.kind === "dot") {
        throw new ModuleUpdateMigrationConfigurationError(
          "FC6-B target migration REFERENCES target uses an unsupported qualification.",
        );
      }
    }

    references.push(Object.freeze({ schema, table }));
  }

  return Object.freeze(references);
}

function sqlReferenceTokens(value) {
  const tokens = [];
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    const next = value[index + 1];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
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
    if (char === '"') {
      const quoted = readSqlQuotedIdentifier(value, index);
      if (quoted === null) {
        throw new ModuleUpdateMigrationConfigurationError(
          "FC6-B target migration contains an unterminated quoted identifier.",
        );
      }
      tokens.push({
        kind: "identifier",
        value: quoted.value,
        keyword: null,
      });
      index = quoted.nextIndex;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < value.length && /[A-Za-z0-9_$]/.test(value[index])) {
        index += 1;
      }
      const raw = value.slice(start, index);
      tokens.push({
        kind: "identifier",
        value: raw.toLowerCase(),
        keyword: raw.toUpperCase(),
      });
      continue;
    }
    if (char === ".") {
      tokens.push({ kind: "dot" });
    }
    index += 1;
  }

  return tokens;
}

function readSqlQuotedIdentifier(value, start) {
  let index = start + 1;
  let identifier = "";

  while (index < value.length) {
    if (value[index] === '"' && value[index + 1] === '"') {
      identifier += '"';
      index += 2;
      continue;
    }
    if (value[index] === '"') {
      return {
        value: identifier,
        nextIndex: index + 1,
      };
    }
    identifier += value[index];
    index += 1;
  }

  return null;
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

function containsTopLevelCreateTableInheritance(value) {
  if (!/^CREATE\s+TABLE\b/i.test(value)) return false;

  let index = 0;
  let depth = 0;
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

    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    if (depth === 0 && /[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < value.length && /[A-Za-z0-9_$]/.test(value[end])) end += 1;
      if (value.slice(index, end).toUpperCase() === "INHERITS") return true;
      index = end;
      continue;
    }

    index += 1;
  }

  return false;
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
    if (marker.kind === "constraint-count") continue;
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

  if (marker.kind === "constraint-count") {
    const rows = await transaction`
      SELECT count(*)::int AS count
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'public'
        AND rel.relname = ${marker.table}
        AND con.contype = ${marker.name}
    `;
    return rows[0]?.count === marker.count;
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

function assertUniqueManifestOwnerIds(owners) {
  const ids = owners.map((owner) => owner?.id);
  if (
    ids.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new ModuleUpdateMigrationConfigurationError(
      "FC6-B published target database owners are not unique.",
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
  const quoted = match[quotedIndex];
  if (quoted !== undefined) return quoted.replaceAll('""', '"');

  const plain = match[plainIndex];
  return plain.toLowerCase();
}

function catalogMarkerKey(marker) {
  return [
    marker.kind,
    marker.table ?? "",
    marker.name,
  ].join(":");
}

function containsSqlKeyword(value, keyword) {
  if (typeof value !== "string" || typeof keyword !== "string") return false;

  const expected = keyword.toUpperCase();
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
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < value.length && /[A-Za-z0-9_$]/.test(value[index])) {
        index += 1;
      }
      if (value.slice(start, index).toUpperCase() === expected) return true;
      continue;
    }
    index += 1;
  }

  return false;
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
    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      index += 1;
      continue;
    }
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }

  parts.push(value.slice(start));
  return parts;
}

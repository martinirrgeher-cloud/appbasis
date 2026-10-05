import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validatePostgresConnectionString } from "./database-migration-executor.mjs";
import { planUlcExerciseCatalogAdoption } from "./ulc-linz-exercise-catalog-adoption-plan.mjs";

const REQUIRED_EXECUTION_SCOPE = "isolated-proof";
const ISOLATED_DATABASE_PREFIX = "appbasis_e6g_c2_";
const ADOPTION_LOCK_KEY = "ulc-linz:exercise-catalog:adoption-copy";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export class UlcExerciseCatalogAdoptionConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogAdoptionConfigurationError";
  }
}

export class UlcExerciseCatalogAdoptionExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogAdoptionExecutionError";
  }
}

export async function applyUlcExerciseCatalogAdoptionCopy(
  {
    connectionString,
    expectedDatabase,
    expectedPrincipal,
    executionScope,
  } = {},
  options = {},
) {
  assertExecutionScope(executionScope);
  assertExpectedTarget(expectedDatabase, "database");
  assertIsolatedDatabaseName(expectedDatabase);
  assertExpectedTarget(expectedPrincipal, "principal");

  const normalizedConnectionString = validatePostgresConnectionString(
    connectionString,
    {
      expectedDatabase,
      ConfigurationError: UlcExerciseCatalogAdoptionConfigurationError,
    },
  );
  assertConnectionPrincipal(normalizedConnectionString, expectedPrincipal);

  let plan;
  try {
    plan = await planUlcExerciseCatalogAdoption({
      repositoryRoot: options.repositoryRoot,
    });
  } catch (error) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 could not validate the E6G-C1 adoption contract: " +
        safeErrorMessage(error),
    );
  }
  assertC2Plan(plan);

  const beforeTargetLock = options.testingHooks?.beforeTargetLock;
  const afterSourceSnapshot = options.testingHooks?.afterSourceSnapshot;
  if (
    (beforeTargetLock !== undefined &&
      typeof beforeTargetLock !== "function") ||
    (afterSourceSnapshot !== undefined &&
      typeof afterSourceSnapshot !== "function")
  ) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 testing hook configuration is invalid.",
    );
  }

  const createDatabase = options.createDatabase ?? createPostgresDatabase;
  if (typeof createDatabase !== "function") {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 PostgreSQL database factory is unavailable.",
    );
  }

  let connection;
  try {
    connection = createDatabase(normalizedConnectionString);
  } catch {
    throw new UlcExerciseCatalogAdoptionExecutionError(
      "E6G-C2 PostgreSQL connection could not be created.",
    );
  }

  let primaryError;
  try {
    await verifyTargetIdentity(connection.client, {
      expectedDatabase,
      expectedPrincipal,
    });
    await assertRelationsExist(connection.client, plan.copy.tables);

    return await connection.client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
      );

      if (beforeTargetLock !== undefined) {
        await beforeTargetLock();
      }

      // Acquire the target lock before the first transaction snapshot read.
      // This makes rows committed by a writer while this transaction is
      // starting visible to the subsequent empty-target check.
      await lockTargetTables(transaction, plan.copy.tables);
      await verifyTargetIdentity(transaction, {
        expectedDatabase,
        expectedPrincipal,
      });
      await transaction`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${ADOPTION_LOCK_KEY}, 0)
        )
      `;

      await assertRelationsExist(transaction, plan.copy.tables);
      await assertMappedColumnsExist(transaction, plan.copy.tables);
      await assertTargetPrimaryKeys(transaction, plan.copy.tables);
      await assertTargetTablesEmpty(transaction, plan.copy.tables);
      await assertNoSourceExerciseOrphans(transaction, plan.copy.tables);
      await assertNoDuplicateMappedTargetKeys(transaction, plan.copy.tables);

      const sourceSummary = await collectSourceSummary(
        transaction,
        plan.copy.tables,
      );

      if (afterSourceSnapshot !== undefined) {
        await afterSourceSnapshot();
      }

      for (const table of plan.copy.tables) {
        await transaction.unsafe(insertMappedRowsSql(table));
      }

      await verifyCopiedData(
        transaction,
        plan.copy.tables,
        sourceSummary,
      );

      return deepFreeze({
        state: "copied-and-verified-isolated",
        application: plan.application,
        moduleId: plan.target.moduleId,
        executionScope,
        transactionIsolation: "repeatable-read",
        tables: sourceSummary,
        sourceWriteQuiescenceApplied: false,
        finalEqualityUnderSourceWriteQuiescence: false,
        cutoverGuardSatisfied: false,
        runtimeCutoverEligible: false,
      });
    });
  } catch (error) {
    primaryError = error;
    if (
      error instanceof UlcExerciseCatalogAdoptionConfigurationError ||
      error instanceof UlcExerciseCatalogAdoptionExecutionError
    ) {
      throw error;
    }
    throw new UlcExerciseCatalogAdoptionExecutionError(
      "E6G-C2 adoption copy failed and the transaction was rolled back.",
    );
  } finally {
    try {
      await connection.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcExerciseCatalogAdoptionExecutionError(
          "E6G-C2 PostgreSQL connection could not be closed cleanly.",
        );
      }
    }
  }
}

function assertExecutionScope(value) {
  if (value !== REQUIRED_EXECUTION_SCOPE) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 only permits the isolated-proof execution scope.",
    );
  }
}

function assertExpectedTarget(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 expected PostgreSQL " + label + " is invalid.",
    );
  }
}

function assertIsolatedDatabaseName(value) {
  if (
    !value.startsWith(ISOLATED_DATABASE_PREFIX) ||
    value.length === ISOLATED_DATABASE_PREFIX.length ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(value)
  ) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 requires a dedicated appbasis_e6g_c2_* isolated database.",
    );
  }
}

function assertConnectionPrincipal(connectionString, expectedPrincipal) {
  let username;
  try {
    username = decodeURIComponent(new URL(connectionString).username);
  } catch {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 PostgreSQL connection principal is invalid.",
    );
  }
  if (username !== expectedPrincipal) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 PostgreSQL URL does not use the expected principal.",
    );
  }
}

function assertC2Plan(plan) {
  if (
    plan?.schemaVersion !== 1 ||
    plan.operation !== "ulc-exercise-catalog-adoption" ||
    plan.state !== "ready-for-isolated-adoption-proof" ||
    plan.application !== "ulc-linz" ||
    plan.target?.moduleId !== "exercise-catalog" ||
    plan.databaseAccess !== false ||
    !Array.isArray(plan.writes) ||
    plan.writes.length !== 0 ||
    !Array.isArray(plan.copy?.tables) ||
    plan.copy.tables.length !== 4 ||
    plan.cutoverGuard?.strategy !== "quiesce-and-verify" ||
    plan.cutoverGuard?.runtimeSwitchOnlyAfterSuccessfulFinalVerification !==
      true
  ) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 requires the reviewed E6G-C1 isolated adoption plan.",
    );
  }
}

async function verifyTargetIdentity(
  sql,
  { expectedDatabase, expectedPrincipal },
) {
  const rows = await sql`
    SELECT
      current_database()::text AS database_name,
      current_user::text AS principal
  `;
  if (
    rows.length !== 1 ||
    rows[0]?.database_name !== expectedDatabase ||
    rows[0]?.principal !== expectedPrincipal
  ) {
    throw new UlcExerciseCatalogAdoptionExecutionError(
      "E6G-C2 connected PostgreSQL target identity does not match the approved isolated target.",
    );
  }
}

async function assertRelationsExist(sql, tables) {
  for (const table of tables) {
    for (const relation of [table.sourceTable, table.targetTable]) {
      assertIdentifier(relation);
      const qualified = "public." + relation;
      const rows = await sql`
        SELECT to_regclass(${qualified})::text AS relation_name
      `;
      if (rows.length !== 1 || rows[0]?.relation_name === null) {
        throw new UlcExerciseCatalogAdoptionExecutionError(
          "E6G-C2 required relation is missing: " + relation + ".",
        );
      }
    }
  }
}

async function lockTargetTables(sql, tables) {
  const targets = tables.map((table) => qualifiedTable(table.targetTable));
  await sql.unsafe(
    "LOCK TABLE " +
      targets.join(", ") +
      " IN ACCESS EXCLUSIVE MODE",
  );
}

async function assertMappedColumnsExist(sql, tables) {
  for (const table of tables) {
    await assertColumnsExist(
      sql,
      table.sourceTable,
      table.columns.map((column) => column.source),
      "source",
    );
    await assertColumnsExist(
      sql,
      table.targetTable,
      table.columns.map((column) => column.target),
      "target",
    );
  }
}

async function assertColumnsExist(sql, tableName, expectedColumns, label) {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `;
  const actual = new Set(rows.map((row) => row.column_name));
  const missing = expectedColumns.filter((column) => !actual.has(column));
  if (missing.length > 0) {
    throw new UlcExerciseCatalogAdoptionExecutionError(
      "E6G-C2 " +
        label +
        " relation " +
        tableName +
        " is missing mapped columns: " +
        missing.join(", ") +
        ".",
    );
  }
}

async function assertTargetPrimaryKeys(sql, tables) {
  for (const table of tables) {
    const rows = await sql`
      SELECT
        array_agg(a.attname ORDER BY k.ordinality)::text[] AS columns
      FROM pg_constraint AS c
      INNER JOIN pg_class AS r
        ON r.oid = c.conrelid
      INNER JOIN pg_namespace AS n
        ON n.oid = r.relnamespace
      CROSS JOIN LATERAL
        unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
      INNER JOIN pg_attribute AS a
        ON a.attrelid = r.oid
       AND a.attnum = k.attnum
      WHERE c.contype = 'p'
        AND n.nspname = 'public'
        AND r.relname = ${table.targetTable}
      GROUP BY c.oid
    `;
    const columns = rows[0]?.columns;
    if (
      rows.length !== 1 ||
      !Array.isArray(columns) ||
      JSON.stringify(columns) !== JSON.stringify(table.targetKey)
    ) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 target primary key does not match the reviewed contract for " +
          table.targetTable +
          ".",
      );
    }
  }
}

async function assertTargetTablesEmpty(sql, tables) {
  for (const table of tables) {
    const rows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.targetTable),
    );
    if (rows.length !== 1 || rows[0]?.count !== 0) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 target table is not empty: " + table.targetTable + ".",
      );
    }
  }
}

async function assertNoSourceExerciseOrphans(sql, tables) {
  const item = findTable(tables, "ulc_linz_exercise_catalog_item");
  for (const sourceTable of [
    "ulc_linz_exercise_parameter",
    "ulc_linz_exercise_group",
    "ulc_linz_exercise_favorite",
  ]) {
    const child = findTable(tables, sourceTable);
    const rows = await sql.unsafe(
      "SELECT count(*)::int AS count " +
        "FROM " +
        qualifiedTable(child.sourceTable) +
        " AS child " +
        "LEFT JOIN " +
        qualifiedTable(item.sourceTable) +
        " AS item " +
        "ON item.organization_id = child.organization_id " +
        "AND item.id = child.exercise_id " +
        "WHERE item.id IS NULL",
    );
    if (rows.length !== 1 || rows[0]?.count !== 0) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 source contains orphaned exercise references in " +
          child.sourceTable +
          ".",
      );
    }
  }
}

async function assertNoDuplicateMappedTargetKeys(sql, tables) {
  for (const table of tables) {
    const sourceKeyColumns = table.targetKey.map((targetColumn) => {
      const mapping = table.columns.find(
        (column) => column.target === targetColumn,
      );
      if (mapping === undefined) {
        throw new UlcExerciseCatalogAdoptionConfigurationError(
          "E6G-C2 target key is not fully represented by the copy mapping.",
        );
      }
      return mapping.source;
    });
    const groupBy = sourceKeyColumns
      .map((column) => quotedIdentifier(column))
      .join(", ");
    const rows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM (" +
        "SELECT " +
        groupBy +
        " FROM " +
        qualifiedTable(table.sourceTable) +
        " GROUP BY " +
        groupBy +
        " HAVING count(*) > 1" +
        ") AS duplicate_keys",
    );
    if (rows.length !== 1 || rows[0]?.count !== 0) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 source mapping contains duplicate target keys for " +
          table.sourceTable +
          ".",
      );
    }
  }
}

async function collectSourceSummary(sql, tables) {
  const summaries = [];
  for (const table of tables) {
    const countRows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.sourceTable),
    );
    const organizationRows = await sql.unsafe(
      "SELECT organization_id, count(*)::int AS count " +
        "FROM " +
        qualifiedTable(table.sourceTable) +
        " GROUP BY organization_id ORDER BY organization_id",
    );
    summaries.push({
      sourceTable: table.sourceTable,
      targetTable: table.targetTable,
      rowCount: countRows[0]?.count ?? -1,
      organizationCounts: organizationRows.map((row) => ({
        organizationId: row.organization_id,
        rowCount: row.count,
      })),
    });
  }
  return deepFreeze(summaries);
}

function insertMappedRowsSql(table) {
  const targetColumns = table.columns
    .map((column) => quotedIdentifier(column.target))
    .join(", ");
  const sourceColumns = table.columns
    .map((column) => quotedIdentifier(column.source))
    .join(", ");
  const sourceKeyColumns = table.targetKey.map((targetColumn) => {
    const mapping = table.columns.find(
      (column) => column.target === targetColumn,
    );
    if (mapping === undefined) {
      throw new UlcExerciseCatalogAdoptionConfigurationError(
        "E6G-C2 target key is not fully represented by the copy mapping.",
      );
    }
    return quotedIdentifier(mapping.source);
  });
  return (
    "INSERT INTO " +
    qualifiedTable(table.targetTable) +
    " (" +
    targetColumns +
    ") SELECT " +
    sourceColumns +
    " FROM " +
    qualifiedTable(table.sourceTable) +
    " ORDER BY " +
    sourceKeyColumns.join(", ")
  );
}

async function verifyCopiedData(sql, tables, sourceSummary) {
  for (const table of tables) {
    const expected = sourceSummary.find(
      (entry) =>
        entry.sourceTable === table.sourceTable &&
        entry.targetTable === table.targetTable,
    );
    if (expected === undefined) {
      throw new UlcExerciseCatalogAdoptionConfigurationError(
        "E6G-C2 source summary is incomplete.",
      );
    }

    const countRows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.targetTable),
    );
    if (
      countRows.length !== 1 ||
      countRows[0]?.count !== expected.rowCount
    ) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 exact row count mismatch for " + table.targetTable + ".",
      );
    }

    const organizationRows = await sql.unsafe(
      "SELECT organization_id, count(*)::int AS count " +
        "FROM " +
        qualifiedTable(table.targetTable) +
        " GROUP BY organization_id ORDER BY organization_id",
    );
    const actualOrganizationCounts = organizationRows.map((row) => ({
      organizationId: row.organization_id,
      rowCount: row.count,
    }));
    if (
      JSON.stringify(actualOrganizationCounts) !==
      JSON.stringify(expected.organizationCounts)
    ) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 per-organization row count mismatch for " +
          table.targetTable +
          ".",
      );
    }

    const mismatchRows = await sql.unsafe(mappedMismatchSql(table));
    if (mismatchRows.length !== 1 || mismatchRows[0]?.count !== 0) {
      throw new UlcExerciseCatalogAdoptionExecutionError(
        "E6G-C2 mapped content mismatch for " + table.targetTable + ".",
      );
    }
  }
}

function mappedMismatchSql(table) {
  const sourceProjection = table.columns
    .map(
      (column) =>
        quotedIdentifier(column.source) +
        " AS " +
        quotedIdentifier(column.target),
    )
    .join(", ");
  const targetProjection = table.columns
    .map((column) => quotedIdentifier(column.target))
    .join(", ");
  const source = qualifiedTable(table.sourceTable);
  const target = qualifiedTable(table.targetTable);

  return (
    "SELECT count(*)::int AS count FROM (" +
    "(SELECT " +
    sourceProjection +
    " FROM " +
    source +
    " EXCEPT ALL SELECT " +
    targetProjection +
    " FROM " +
    target +
    ") UNION ALL (" +
    "SELECT " +
    targetProjection +
    " FROM " +
    target +
    " EXCEPT ALL SELECT " +
    sourceProjection +
    " FROM " +
    source +
    ")" +
    ") AS mapped_mismatch"
  );
}

function findTable(tables, sourceTable) {
  const table = tables.find((entry) => entry.sourceTable === sourceTable);
  if (table === undefined) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 reviewed table mapping is incomplete.",
    );
  }
  return table;
}

function qualifiedTable(value) {
  assertIdentifier(value);
  return '"public".' + quotedIdentifier(value);
}

function quotedIdentifier(value) {
  assertIdentifier(value);
  return '"' + value + '"';
}

function assertIdentifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new UlcExerciseCatalogAdoptionConfigurationError(
      "E6G-C2 adoption mapping contains an invalid SQL identifier.",
    );
  }
}

function safeErrorMessage(error) {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "unknown contract validation error";
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import { planUlcExerciseCatalogAdoption } from "./ulc-linz-exercise-catalog-adoption-plan.mjs";
import { ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const EXPECTED_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export class UlcExerciseCatalogPreviewCutoverConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewCutoverConfigurationError";
  }
}

export class UlcExerciseCatalogPreviewCutoverExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewCutoverExecutionError";
  }
}

export async function loadUlcExerciseCatalogPreviewCutoverPlan(
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
  { loadAdoptionPlan = planUlcExerciseCatalogAdoption } = {},
) {
  if (typeof loadAdoptionPlan !== "function") {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C adoption-plan dependency is unavailable.",
    );
  }

  let adoption;
  try {
    adoption = await loadAdoptionPlan({
      repositoryRoot: resolve(repositoryRoot),
    });
  } catch (error) {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C could not reconstruct the reviewed adoption contract: " +
        safeErrorMessage(error),
    );
  }

  if (
    adoption?.repositoryState !== "published-target" ||
    adoption?.target?.moduleId !== "exercise-catalog" ||
    adoption?.copy?.tables?.length !== 4 ||
    adoption?.verification?.finalEqualityUnderSourceWriteQuiescence !== true ||
    adoption?.cutoverGuard?.strategy !== "quiesce-and-verify" ||
    adoption?.cutoverGuard?.quiesceSourceWritesBeforeFinalVerification !==
      true ||
    adoption?.cutoverGuard?.requireFinalMappedContentEquality !== true ||
    adoption?.cutoverGuard?.abortOnMismatch !== true ||
    adoption?.cutoverGuard?.runtimeSwitchOnlyAfterSuccessfulFinalVerification !==
      true
  ) {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C reviewed cutover contract is not satisfied by the current repository state.",
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    operation: "ulc-exercise-catalog-preview-runtime-cutover",
    state: "ready-for-explicit-preview-cutover-gates",
    application: "ulc-linz",
    moduleId: "exercise-catalog",
    preview: {
      environment: EXPECTED_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    },
    phases: [
      {
        id: "quiesce",
        runtimeMode: "legacy-read-writes-blocked",
        sourceReads: true,
        sourceWrites: false,
        targetWrites: false,
        explicitApprovalRequired: true,
      },
      {
        id: "final-equality",
        transaction: "repeatable-read-read-only",
        sourceWritesMustAlreadyBeQuiesced: true,
        exactMappedEqualityRequired: true,
      },
      {
        id: "runtime-cutover",
        runtimeMode: "standard-module",
        explicitApprovalRequired: true,
        requiresFinalEqualityPass: true,
      },
    ],
    tables: adoption.copy.tables.map((table) => ({
      sourceTable: table.sourceTable,
      targetTable: table.targetTable,
      targetKey: [...table.targetKey],
      columns: table.columns.map((column) => ({ ...column })),
    })),
    productionChanged: false,
    sourceRetirementIncluded: false,
  });
}

export async function verifyUlcExerciseCatalogPreviewFinalEquality(
  { connectionString } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcExerciseCatalogPreviewCutoverPlan,
    loadAdoptionPlan = planUlcExerciseCatalogAdoption,
  } = {},
) {
  if (
    typeof databaseFactory !== "function" ||
    typeof loadPlan !== "function" ||
    typeof loadAdoptionPlan !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C final-equality dependencies are unavailable.",
    );
  }

  assertMigrationCredential(connectionString);
  const [plan, adoption] = await Promise.all([
    loadPlan({ repositoryRoot }),
    loadAdoptionPlan({ repositoryRoot }),
  ]);
  if (
    plan?.state !== "ready-for-explicit-preview-cutover-gates" ||
    adoption?.repositoryState !== "published-target" ||
    adoption?.copy?.tables?.length !== 4
  ) {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C final-equality repository contract is invalid.",
    );
  }

  let database;
  try {
    database = databaseFactory(connectionString);
  } catch {
    throw new UlcExerciseCatalogPreviewCutoverExecutionError(
      "E6G-C3C preview PostgreSQL connection could not be created.",
    );
  }

  let primaryError;
  try {
    return await database.client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      await verifyMigrationIdentity(transaction);
      await assertRelationsExist(transaction, adoption.copy.tables);
      await assertMappedColumnsExist(transaction, adoption.copy.tables);
      await assertTargetPrimaryKeys(transaction, adoption.copy.tables);
      await assertNoSourceExerciseOrphans(
        transaction,
        adoption.copy.tables,
      );
      const tables = await verifyExactMappedEquality(
        transaction,
        adoption.copy.tables,
      );

      return deepFreeze({
        state: "final-source-target-equality-pass",
        application: "ulc-linz",
        moduleId: "exercise-catalog",
        preview: {
          environment: EXPECTED_ENVIRONMENT,
          database: EXPECTED_DATABASE,
          migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
        },
        transactionIsolation: "repeatable-read-read-only",
        tableCount: tables.length,
        tables,
        finalMappedContentEquality: true,
        sourceWriteQuiescenceAssumedExternal: true,
        runtimeCutoverEligibleAfterQuiescenceEvidence: true,
      });
    });
  } catch (error) {
    primaryError = error;
    if (
      error instanceof UlcExerciseCatalogPreviewCutoverConfigurationError ||
      error instanceof UlcExerciseCatalogPreviewCutoverExecutionError
    ) {
      throw error;
    }
    throw new UlcExerciseCatalogPreviewCutoverExecutionError(
      "E6G-C3C final Source→Target equality verification failed.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcExerciseCatalogPreviewCutoverExecutionError(
          "E6G-C3C preview PostgreSQL connection could not be closed cleanly.",
        );
      }
    }
  }
}

function assertMigrationCredential(connectionString) {
  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C requires the dedicated direct ULC preview migration credential.",
    );
  }
  if (
    origin.database !== EXPECTED_DATABASE ||
    origin.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C requires the exact ULC preview migration database and principal.",
    );
  }
}

async function verifyMigrationIdentity(sql) {
  const rows = await sql.unsafe(
    "SELECT current_database()::text AS database_name, " +
      "current_user::text AS principal_name",
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0]?.database_name !== EXPECTED_DATABASE ||
    rows[0]?.principal_name !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewCutoverExecutionError(
      "E6G-C3C connected PostgreSQL identity does not match the approved ULC preview migration target.",
    );
  }
}

async function assertRelationsExist(sql, tables) {
  for (const table of tables) {
    for (const relation of [table.sourceTable, table.targetTable]) {
      assertIdentifier(relation);
      const rows = await sql.unsafe(
        "SELECT to_regclass('public." + relation + "')::text AS relation_name",
      );
      if (
        !Array.isArray(rows) ||
        rows.length !== 1 ||
        rows[0]?.relation_name === null
      ) {
        throw new UlcExerciseCatalogPreviewCutoverExecutionError(
          "E6G-C3C required relation is missing: " + relation + ".",
        );
      }
    }
  }
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
  assertIdentifier(tableName);
  for (const column of expectedColumns) assertIdentifier(column);
  const rows = await sql.unsafe(
    "SELECT column_name FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND table_name = '" + tableName + "'",
  );
  const actual = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : [],
  );
  const missing = expectedColumns.filter((column) => !actual.has(column));
  if (missing.length > 0) {
    throw new UlcExerciseCatalogPreviewCutoverExecutionError(
      "E6G-C3C " + label + " relation " + tableName +
        " is missing mapped columns: " + missing.join(", ") + ".",
    );
  }
}

async function assertTargetPrimaryKeys(sql, tables) {
  for (const table of tables) {
    assertIdentifier(table.targetTable);
    const rows = await sql.unsafe(
      "SELECT array_agg(a.attname ORDER BY k.ordinality)::text[] AS columns " +
        "FROM pg_constraint AS c " +
        "INNER JOIN pg_class AS r ON r.oid = c.conrelid " +
        "INNER JOIN pg_namespace AS n ON n.oid = r.relnamespace " +
        "CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY " +
        "AS k(attnum, ordinality) " +
        "INNER JOIN pg_attribute AS a ON a.attrelid = r.oid " +
        "AND a.attnum = k.attnum " +
        "WHERE c.contype = 'p' AND n.nspname = 'public' " +
        "AND r.relname = '" + table.targetTable + "' GROUP BY c.oid",
    );
    const columns = rows[0]?.columns;
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !Array.isArray(columns) ||
      JSON.stringify(columns) !== JSON.stringify(table.targetKey)
    ) {
      throw new UlcExerciseCatalogPreviewCutoverExecutionError(
        "E6G-C3C target primary key does not match the reviewed contract for " +
          table.targetTable + ".",
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
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(child.sourceTable) +
        " AS child LEFT JOIN " +
        qualifiedTable(item.sourceTable) +
        " AS item ON item.organization_id = child.organization_id " +
        "AND item.id = child.exercise_id WHERE item.id IS NULL",
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.count !== 0
    ) {
      throw new UlcExerciseCatalogPreviewCutoverExecutionError(
        "E6G-C3C source contains orphaned exercise references in " +
          child.sourceTable + ".",
      );
    }
  }
}

async function verifyExactMappedEquality(sql, tables) {
  const summaries = [];
  for (const table of tables) {
    const sourceCount = await singleCount(
      sql,
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.sourceTable),
    );
    const targetCount = await singleCount(
      sql,
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.targetTable),
    );
    if (sourceCount !== targetCount) {
      throw new UlcExerciseCatalogPreviewCutoverExecutionError(
        "E6G-C3C exact row count mismatch for " + table.targetTable + ".",
      );
    }

    const sourceOrganizations = await organizationCounts(
      sql,
      table.sourceTable,
    );
    const targetOrganizations = await organizationCounts(
      sql,
      table.targetTable,
    );
    if (
      JSON.stringify(sourceOrganizations) !==
      JSON.stringify(targetOrganizations)
    ) {
      throw new UlcExerciseCatalogPreviewCutoverExecutionError(
        "E6G-C3C per-organization row count mismatch for " +
          table.targetTable + ".",
      );
    }

    const mismatchRows = await sql.unsafe(mappedMismatchSql(table));
    if (
      !Array.isArray(mismatchRows) ||
      mismatchRows.length !== 1 ||
      mismatchRows[0]?.count !== 0
    ) {
      throw new UlcExerciseCatalogPreviewCutoverExecutionError(
        "E6G-C3C mapped content mismatch for " + table.targetTable + ".",
      );
    }

    summaries.push({
      sourceTable: table.sourceTable,
      targetTable: table.targetTable,
      rowCount: sourceCount,
      organizationCounts: sourceOrganizations,
      mappedContentEqual: true,
    });
  }
  return deepFreeze(summaries);
}

async function singleCount(sql, query) {
  const rows = await sql.unsafe(query);
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !Number.isInteger(rows[0]?.count) ||
    rows[0].count < 0
  ) {
    throw new UlcExerciseCatalogPreviewCutoverExecutionError(
      "E6G-C3C row-count query returned an invalid result.",
    );
  }
  return rows[0].count;
}

async function organizationCounts(sql, tableName) {
  const rows = await sql.unsafe(
    "SELECT organization_id, count(*)::int AS count FROM " +
      qualifiedTable(tableName) +
      " GROUP BY organization_id ORDER BY organization_id",
  );
  if (!Array.isArray(rows)) {
    throw new UlcExerciseCatalogPreviewCutoverExecutionError(
      "E6G-C3C organization row-count query returned an invalid result.",
    );
  }
  return rows.map((row) => {
    if (
      typeof row?.organization_id !== "string" ||
      row.organization_id.length === 0 ||
      !Number.isInteger(row?.count) ||
      row.count < 0
    ) {
      throw new UlcExerciseCatalogPreviewCutoverExecutionError(
        "E6G-C3C organization row-count result is invalid.",
      );
    }
    return {
      organizationId: row.organization_id,
      rowCount: row.count,
    };
  });
}

function mappedMismatchSql(table) {
  const sourceProjection = table.columns
    .map(
      (column) =>
        quotedIdentifier(column.source) +
        " AS " + quotedIdentifier(column.target),
    )
    .join(", ");
  const targetProjection = table.columns
    .map((column) => quotedIdentifier(column.target))
    .join(", ");
  return (
    "SELECT count(*)::int AS count FROM (" +
    "(SELECT " + sourceProjection + " FROM " +
    qualifiedTable(table.sourceTable) +
    " EXCEPT ALL SELECT " + targetProjection + " FROM " +
    qualifiedTable(table.targetTable) + ") UNION ALL (" +
    "SELECT " + targetProjection + " FROM " +
    qualifiedTable(table.targetTable) +
    " EXCEPT ALL SELECT " + sourceProjection + " FROM " +
    qualifiedTable(table.sourceTable) + ")" +
    ") AS mapped_mismatch"
  );
}

function findTable(tables, sourceTable) {
  const table = tables.find((entry) => entry.sourceTable === sourceTable);
  if (table === undefined) {
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C reviewed table mapping is incomplete.",
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
    throw new UlcExerciseCatalogPreviewCutoverConfigurationError(
      "E6G-C3C reviewed SQL identifier is invalid.",
    );
  }
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const command = process.argv[2] ?? "plan";
    const result =
      command === "plan"
        ? await loadUlcExerciseCatalogPreviewCutoverPlan()
        : command === "verify"
          ? await verifyUlcExerciseCatalogPreviewFinalEquality({
              connectionString:
                process.env.APPBASIS_MIGRATION_DATABASE_URL,
            })
          : null;
    if (result === null) {
      throw new Error("Expected command plan or verify.");
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  }
}

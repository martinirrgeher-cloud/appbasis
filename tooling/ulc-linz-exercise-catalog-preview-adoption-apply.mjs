import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import {
  loadModuleUpdateMigrationExecutionPlan,
} from "./module-update-migration-executor.mjs";
import { planUlcExerciseCatalogAdoption } from "./ulc-linz-exercise-catalog-adoption-plan.mjs";
import { planUlcExerciseCatalogPreviewAdoptionReadiness } from "./ulc-linz-exercise-catalog-preview-adoption-readiness.mjs";
import { ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const APP_ID = "ulc-linz";
const MODULE_ID = "exercise-catalog";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const REQUIRED_EXECUTION_SCOPE = "preview-schema-copy";
const ADOPTION_LOCK_KEY =
  "ulc-linz:exercise-catalog:preview-schema-copy";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export class UlcExerciseCatalogPreviewAdoptionConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewAdoptionConfigurationError";
  }
}

export class UlcExerciseCatalogPreviewAdoptionExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewAdoptionExecutionError";
  }
}

export async function loadUlcExerciseCatalogPreviewAdoptionApplyPlan(
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
  {
    loadReadiness = planUlcExerciseCatalogPreviewAdoptionReadiness,
    loadMigrationPlan = loadModuleUpdateMigrationExecutionPlan,
    loadAdoptionPlan = planUlcExerciseCatalogAdoption,
  } = {},
) {
  if (
    typeof loadReadiness !== "function" ||
    typeof loadMigrationPlan !== "function" ||
    typeof loadAdoptionPlan !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B preview adoption plan dependencies are unavailable.",
    );
  }

  const root = resolve(repositoryRoot);
  let readiness;
  let migrationPlan;
  let adoptionPlan;
  try {
    [readiness, migrationPlan, adoptionPlan] = await Promise.all([
      loadReadiness({ repositoryRoot: root }),
      loadMigrationPlan(
        { appId: APP_ID, moduleId: MODULE_ID },
        { repositoryRoot: root },
      ),
      loadAdoptionPlan({ repositoryRoot: root }),
    ]);
  } catch (error) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B could not reconstruct the reviewed preview adoption contract: " +
        safeErrorMessage(error),
    );
  }

  const adoptionMigrationPlan = selectAdoptionBaselineMigrationPlan(
    migrationPlan,
    adoptionPlan,
  );
  assertReviewedPlans({
    readiness,
    migrationPlan: adoptionMigrationPlan,
    adoptionPlan,
  });

  return deepFreeze({
    schemaVersion: 1,
    operation: "ulc-exercise-catalog-preview-adoption-apply",
    state: "ready-for-explicit-preview-schema-copy-apply",
    application: APP_ID,
    moduleId: MODULE_ID,
    repositoryState: "published-target",
    preview: {
      environment: EXPECTED_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    },
    transaction: {
      atomic: true,
      isolation: "repeatable-read",
      rollbackSchemaOnCopyFailure: true,
    },
    targetSchemaMigration: {
      ownerId: adoptionMigrationPlan.targetOwner.id,
      schemaVersion: adoptionMigrationPlan.targetOwner.schemaVersion,
      migrationPaths: adoptionMigrationPlan.migrations.map(
        (migration) => migration.relativePath,
      ),
      migrationCount: adoptionMigrationPlan.migrations.length,
    },
    copyAndVerify: {
      mode: adoptionPlan.copy.mode,
      tableCount: adoptionPlan.copy.tables.length,
      sourceTables: adoptionPlan.copy.tables.map(
        (table) => table.sourceTable,
      ),
      targetTables: adoptionPlan.copy.tables.map(
        (table) => table.targetTable,
      ),
      targetTablesMustBeAbsentBeforeApply: true,
      sourceWriteQuiescenceApplied: false,
    },
    runtimeCutover: {
      eligible: false,
      separateGate: true,
      blockedUntil: [
        "preview-schema-copy-pass",
        "source-writes-quiesced",
        "final-source-target-equality-pass",
      ],
    },
    providerAccess: false,
    databaseAccess: false,
    writes: [],
  });
}

export function renderUlcExerciseCatalogPreviewAdoptionApplyPlan(plan) {
  return JSON.stringify(plan, null, 2) + "\n";
}

export async function applyUlcExerciseCatalogPreviewAdoption(
  {
    connectionString,
    executionScope,
  } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcExerciseCatalogPreviewAdoptionApplyPlan,
    loadMigrationPlan = loadModuleUpdateMigrationExecutionPlan,
    loadAdoptionPlan = planUlcExerciseCatalogAdoption,
    testingHooks,
  } = {},
) {
  assertExecutionScope(executionScope);
  if (
    typeof databaseFactory !== "function" ||
    typeof loadPlan !== "function" ||
    typeof loadMigrationPlan !== "function" ||
    typeof loadAdoptionPlan !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B preview adoption execution dependencies are unavailable.",
    );
  }

  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B requires the dedicated direct ULC preview migration credential.",
    );
  }
  if (
    origin.database !== EXPECTED_DATABASE ||
    origin.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B requires the exact ULC preview migration database and principal.",
    );
  }

  const afterTargetSchemaMigration =
    testingHooks?.afterTargetSchemaMigration;
  if (
    afterTargetSchemaMigration !== undefined &&
    typeof afterTargetSchemaMigration !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B testing hook configuration is invalid.",
    );
  }

  const root = resolve(repositoryRoot);
  const plan = await loadPlan({ repositoryRoot: root });
  let migrationPlan;
  let adoptionPlan;
  try {
    [migrationPlan, adoptionPlan] = await Promise.all([
      loadMigrationPlan(
        { appId: APP_ID, moduleId: MODULE_ID },
        { repositoryRoot: root },
      ),
      loadAdoptionPlan({ repositoryRoot: root }),
    ]);
  } catch (error) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B could not load the executable reviewed adoption contract: " +
        safeErrorMessage(error),
    );
  }
  migrationPlan = selectAdoptionBaselineMigrationPlan(
    migrationPlan,
    adoptionPlan,
  );
  assertExecutablePlans({ plan, migrationPlan, adoptionPlan });

  let database;
  try {
    database = databaseFactory(connectionString);
  } catch {
    throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
      "E6G-C3B preview PostgreSQL connection could not be created.",
    );
  }

  let primaryError;
  try {
    const result = await database.client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
      );
      await verifyTargetIdentity(transaction);
      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('" +
          ADOPTION_LOCK_KEY +
          "', 0))",
      );

      await assertSourceRelationsExist(
        transaction,
        adoptionPlan.copy.tables,
      );
      await assertMappedSourceColumnsExist(
        transaction,
        adoptionPlan.copy.tables,
      );
      await assertTargetRelationsAbsent(
        transaction,
        adoptionPlan.copy.tables,
      );
      await assertNoSourceExerciseOrphans(
        transaction,
        adoptionPlan.copy.tables,
      );
      await assertNoDuplicateMappedTargetKeys(
        transaction,
        adoptionPlan.copy.tables,
      );
      const sourceSummary = await collectSourceSummary(
        transaction,
        adoptionPlan.copy.tables,
      );

      let statementCount = 0;
      for (const migration of migrationPlan.migrations) {
        for (const statement of migration.statements) {
          await transaction.unsafe(statement);
          statementCount += 1;
        }
      }

      await assertTargetRelationsExist(
        transaction,
        adoptionPlan.copy.tables,
      );
      await assertMappedTargetColumnsExist(
        transaction,
        adoptionPlan.copy.tables,
      );
      await assertTargetPrimaryKeys(
        transaction,
        adoptionPlan.copy.tables,
      );
      if (afterTargetSchemaMigration !== undefined) {
        await afterTargetSchemaMigration(transaction);
      }
      await lockTargetTables(transaction, adoptionPlan.copy.tables);
      await assertTargetTablesEmpty(
        transaction,
        adoptionPlan.copy.tables,
      );

      for (const table of adoptionPlan.copy.tables) {
        await transaction.unsafe(insertMappedRowsSql(table));
      }
      await verifyCopiedData(
        transaction,
        adoptionPlan.copy.tables,
        sourceSummary,
      );

      return deepFreeze({
        state: "preview-schema-copied-and-verified",
        application: APP_ID,
        moduleId: MODULE_ID,
        executionScope,
        preview: {
          environment: EXPECTED_ENVIRONMENT,
          database: EXPECTED_DATABASE,
          migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
        },
        transactionIsolation: "repeatable-read",
        atomicSchemaAndCopy: true,
        migrationCount: migrationPlan.migrations.length,
        statementCount,
        tables: sourceSummary,
        sourceWriteQuiescenceApplied: false,
        finalEqualityUnderSourceWriteQuiescence: false,
        cutoverGuardSatisfied: false,
        runtimeCutoverEligible: false,
      });
    });
    return result;
  } catch (error) {
    primaryError = error;
    if (
      error instanceof
        UlcExerciseCatalogPreviewAdoptionConfigurationError ||
      error instanceof UlcExerciseCatalogPreviewAdoptionExecutionError
    ) {
      throw error;
    }
    throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
      "E6G-C3B preview schema/copy transaction failed and was fully rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
          "E6G-C3B preview PostgreSQL connection could not be closed cleanly.",
        );
      }
    }
  }
}

export function assertUlcExerciseCatalogPreviewAdoptionEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== APP_ID) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B preview adoption requires appId ulc-linz.",
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== EXPECTED_DATABASE) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B preview adoption targets the wrong database.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B preview adoption requires explicit schema-migration approval.",
    );
  }
  if (
    environment.APPBASIS_APPLY_EXERCISE_CATALOG_ADOPTION !== "1"
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B preview adoption requires explicit copy/verify approval.",
    );
  }
}

function selectAdoptionBaselineMigrationPlan(
  migrationPlan,
  adoptionPlan,
) {
  const adoptionMigrationPaths = Array.isArray(
    adoptionPlan?.target?.migrations,
  )
    ? adoptionPlan.target.migrations.map((migration) => migration.path)
    : [];
  const ownerMigrationPaths = Array.isArray(
    migrationPlan?.targetOwner?.migrations,
  )
    ? migrationPlan.targetOwner.migrations
    : [];
  const executableMigrations = Array.isArray(migrationPlan?.migrations)
    ? migrationPlan.migrations
    : [];
  const executablePaths = executableMigrations.map(
    (migration) => migration?.relativePath,
  );
  const adoptionSchemaVersion = adoptionPlan?.target?.schemaVersion;

  if (
    migrationPlan === null ||
    typeof migrationPlan !== "object" ||
    migrationPlan.operation !== "module-install-migrations" ||
    migrationPlan.application !== APP_ID ||
    migrationPlan.moduleId !== MODULE_ID ||
    migrationPlan.repositoryState !== "published-target" ||
    migrationPlan.targetOwner?.id !== MODULE_ID ||
    migrationPlan.targetOwner?.root !== "modules/exercise-catalog" ||
    !Number.isSafeInteger(adoptionSchemaVersion) ||
    !Number.isSafeInteger(migrationPlan.targetOwner?.schemaVersion) ||
    migrationPlan.targetOwner.schemaVersion < adoptionSchemaVersion ||
    adoptionMigrationPaths.length === 0 ||
    ownerMigrationPaths.length < adoptionMigrationPaths.length ||
    executablePaths.length < adoptionMigrationPaths.length ||
    JSON.stringify(ownerMigrationPaths.slice(0, adoptionMigrationPaths.length)) !==
      JSON.stringify(adoptionMigrationPaths) ||
    JSON.stringify(executablePaths.slice(0, adoptionMigrationPaths.length)) !==
      JSON.stringify(adoptionMigrationPaths)
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B current target no longer preserves the reviewed adoption migration baseline.",
    );
  }

  return deepFreeze({
    ...migrationPlan,
    targetOwner: {
      ...migrationPlan.targetOwner,
      schemaVersion: adoptionSchemaVersion,
      migrations: [...adoptionMigrationPaths],
    },
    migrations: executableMigrations.slice(0, adoptionMigrationPaths.length),
  });
}

function assertReviewedPlans({
  readiness,
  migrationPlan,
  adoptionPlan,
}) {
  const adoptionMigrationPaths = Array.isArray(
    adoptionPlan?.target?.migrations,
  )
    ? adoptionPlan.target.migrations.map((migration) => migration.path)
    : [];
  const ownerMigrationPaths = Array.isArray(
    migrationPlan?.targetOwner?.migrations,
  )
    ? [...migrationPlan.targetOwner.migrations]
    : [];
  const executionMigrationPaths = Array.isArray(migrationPlan?.migrations)
    ? migrationPlan.migrations.map((migration) => migration.relativePath)
    : [];

  if (
    readiness?.operation !==
      "ulc-exercise-catalog-preview-adoption-readiness" ||
    readiness.state !==
      "ready-for-explicit-preview-schema-copy-gate" ||
    readiness.repositoryState !== "published-target" ||
    readiness.preview?.environment !== EXPECTED_ENVIRONMENT ||
    readiness.preview?.database !== EXPECTED_DATABASE ||
    readiness.targetSchemaMigration?.migrationCount !== 2 ||
    readiness.copyAndVerify?.tableCount !== 4 ||
    readiness.copyAndVerify?.previewBoundExecutorRequired !== true ||
    readiness.copyAndVerify?.isolatedProofExecutorReusableOnPreview !==
      false ||
    readiness.runtimeCutover?.eligible !== false ||
    readiness.providerAccess !== false ||
    readiness.databaseAccess !== false ||
    !Array.isArray(readiness.writes) ||
    readiness.writes.length !== 0
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B requires the exact reviewed C3A preview-readiness contract.",
    );
  }

  if (
    migrationPlan?.operation !== "module-install-migrations" ||
    migrationPlan.application !== APP_ID ||
    migrationPlan.moduleId !== MODULE_ID ||
    migrationPlan.repositoryState !== "published-target" ||
    migrationPlan.targetOwner?.id !== MODULE_ID ||
    migrationPlan.targetOwner?.root !== "modules/exercise-catalog" ||
    migrationPlan.targetOwner?.schemaVersion !== 2 ||
    !Array.isArray(migrationPlan.migrations) ||
    migrationPlan.migrations.length !== 2 ||
    adoptionMigrationPaths.length !== 2 ||
    JSON.stringify(ownerMigrationPaths) !==
      JSON.stringify(adoptionMigrationPaths) ||
    JSON.stringify(executionMigrationPaths) !==
      JSON.stringify(adoptionMigrationPaths)
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B requires exactly the two published exercise-catalog target migrations.",
    );
  }

  if (
    adoptionPlan?.operation !== "ulc-exercise-catalog-adoption" ||
    adoptionPlan.repositoryState !== "published-target" ||
    adoptionPlan.application !== APP_ID ||
    adoptionPlan.target?.moduleId !== MODULE_ID ||
    adoptionPlan.copy?.mode !== "insert-only-preserve-identifiers" ||
    !Array.isArray(adoptionPlan.copy?.tables) ||
    adoptionPlan.copy.tables.length !== 4 ||
    adoptionPlan.cutoverGuard?.strategy !== "quiesce-and-verify"
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B requires the reviewed published-target adoption mapping.",
    );
  }
}

function assertExecutablePlans({ plan, migrationPlan, adoptionPlan }) {
  const migrationPaths = Array.isArray(migrationPlan?.migrations)
    ? migrationPlan.migrations.map((migration) => migration.relativePath)
    : [];
  const sourceTables = Array.isArray(adoptionPlan?.copy?.tables)
    ? adoptionPlan.copy.tables.map((table) => table.sourceTable)
    : [];
  const targetTables = Array.isArray(adoptionPlan?.copy?.tables)
    ? adoptionPlan.copy.tables.map((table) => table.targetTable)
    : [];

  if (
    plan?.operation !==
      "ulc-exercise-catalog-preview-adoption-apply" ||
    plan.state !== "ready-for-explicit-preview-schema-copy-apply" ||
    plan.preview?.environment !== EXPECTED_ENVIRONMENT ||
    plan.preview?.database !== EXPECTED_DATABASE ||
    plan.preview?.migrationPrincipal !==
      EXPECTED_MIGRATION_PRINCIPAL ||
    plan.transaction?.atomic !== true ||
    plan.transaction?.isolation !== "repeatable-read" ||
    plan.transaction?.rollbackSchemaOnCopyFailure !== true ||
    plan.targetSchemaMigration?.ownerId !== MODULE_ID ||
    plan.targetSchemaMigration?.schemaVersion !== 2 ||
    plan.targetSchemaMigration?.migrationCount !== 2 ||
    JSON.stringify(plan.targetSchemaMigration?.migrationPaths) !==
      JSON.stringify(migrationPaths) ||
    plan.copyAndVerify?.tableCount !== 4 ||
    JSON.stringify(plan.copyAndVerify?.sourceTables) !==
      JSON.stringify(sourceTables) ||
    JSON.stringify(plan.copyAndVerify?.targetTables) !==
      JSON.stringify(targetTables) ||
    plan.runtimeCutover?.eligible !== false ||
    plan.databaseAccess !== false ||
    !Array.isArray(plan.writes) ||
    plan.writes.length !== 0
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B executable preview plan is not canonical.",
    );
  }

  if (
    migrationPlan?.operation !== "module-install-migrations" ||
    migrationPlan.application !== APP_ID ||
    migrationPlan.moduleId !== MODULE_ID ||
    migrationPlan.repositoryState !== "published-target" ||
    migrationPlan.targetOwner?.id !== MODULE_ID ||
    migrationPlan.targetOwner?.schemaVersion !== 2 ||
    migrationPaths.length !== 2 ||
    adoptionPlan?.operation !== "ulc-exercise-catalog-adoption" ||
    adoptionPlan.repositoryState !== "published-target" ||
    adoptionPlan.application !== APP_ID ||
    adoptionPlan.target?.moduleId !== MODULE_ID ||
    adoptionPlan.copy?.mode !== "insert-only-preserve-identifiers" ||
    sourceTables.length !== 4 ||
    targetTables.length !== 4 ||
    adoptionPlan.cutoverGuard?.strategy !== "quiesce-and-verify"
  ) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B executable migration/copy contracts drifted from the reviewed target.",
    );
  }
}

function assertExecutionScope(value) {
  if (value !== REQUIRED_EXECUTION_SCOPE) {
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B only permits the preview-schema-copy execution scope.",
    );
  }
}

async function verifyTargetIdentity(sql) {
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
    throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
      "E6G-C3B connected PostgreSQL identity does not match the approved ULC preview migration target.",
    );
  }
}

async function assertSourceRelationsExist(sql, tables) {
  for (const table of tables) {
    await assertRelationState(sql, table.sourceTable, true, "source");
  }
}

async function assertTargetRelationsAbsent(sql, tables) {
  for (const table of tables) {
    await assertRelationState(sql, table.targetTable, false, "target");
  }
}

async function assertTargetRelationsExist(sql, tables) {
  for (const table of tables) {
    await assertRelationState(sql, table.targetTable, true, "target");
  }
}

async function assertRelationState(sql, relation, expected, label) {
  assertIdentifier(relation);
  const rows = await sql.unsafe(
    "SELECT to_regclass('public." + relation + "')::text AS relation_name",
  );
  const present =
    Array.isArray(rows) &&
    rows.length === 1 &&
    rows[0]?.relation_name !== null;
  if (present !== expected) {
    throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
      expected
        ? "E6G-C3B required " + label + " relation is missing: " +
            relation + "."
        : "E6G-C3B target schema appears already or partially applied: " +
            relation + ".",
    );
  }
}

async function assertMappedSourceColumnsExist(sql, tables) {
  for (const table of tables) {
    await assertColumnsExist(
      sql,
      table.sourceTable,
      table.columns.map((column) => column.source),
      "source",
    );
  }
}

async function assertMappedTargetColumnsExist(sql, tables) {
  for (const table of tables) {
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
      "WHERE table_schema = 'public' AND table_name = '" +
      tableName +
      "'",
  );
  const actual = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : [],
  );
  const missing = expectedColumns.filter((column) => !actual.has(column));
  if (missing.length > 0) {
    throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
      "E6G-C3B " + label + " relation " + tableName +
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
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B target primary key does not match the reviewed contract for " +
          table.targetTable + ".",
      );
    }
  }
}

async function lockTargetTables(sql, tables) {
  const targets = tables.map((table) => qualifiedTable(table.targetTable));
  await sql.unsafe(
    "LOCK TABLE " + targets.join(", ") + " IN ACCESS EXCLUSIVE MODE",
  );
}

async function assertTargetTablesEmpty(sql, tables) {
  for (const table of tables) {
    const rows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.targetTable),
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.count !== 0
    ) {
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B target table is not empty after schema migration: " +
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
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B source contains orphaned exercise references in " +
          child.sourceTable + ".",
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
        throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
          "E6G-C3B target key is not fully represented by the copy mapping.",
        );
      }
      return mapping.source;
    });
    const groupBy = sourceKeyColumns
      .map((column) => quotedIdentifier(column))
      .join(", ");
    const rows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM (" +
        "SELECT " + groupBy + " FROM " +
        qualifiedTable(table.sourceTable) +
        " GROUP BY " + groupBy + " HAVING count(*) > 1" +
        ") AS duplicate_keys",
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.count !== 0
    ) {
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B source mapping contains duplicate target keys for " +
          table.sourceTable + ".",
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
      "SELECT organization_id, count(*)::int AS count FROM " +
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
      throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
        "E6G-C3B target key is not fully represented by the copy mapping.",
      );
    }
    return quotedIdentifier(mapping.source);
  });
  return (
    "INSERT INTO " + qualifiedTable(table.targetTable) +
    " (" + targetColumns + ") SELECT " + sourceColumns +
    " FROM " + qualifiedTable(table.sourceTable) +
    " ORDER BY " + sourceKeyColumns.join(", ")
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
      throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
        "E6G-C3B source summary is incomplete.",
      );
    }

    const countRows = await sql.unsafe(
      "SELECT count(*)::int AS count FROM " +
        qualifiedTable(table.targetTable),
    );
    if (
      !Array.isArray(countRows) ||
      countRows.length !== 1 ||
      countRows[0]?.count !== expected.rowCount
    ) {
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B exact row count mismatch for " +
          table.targetTable + ".",
      );
    }

    const organizationRows = await sql.unsafe(
      "SELECT organization_id, count(*)::int AS count FROM " +
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
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B per-organization row count mismatch for " +
          table.targetTable + ".",
      );
    }

    const mismatchRows = await sql.unsafe(mappedMismatchSql(table));
    if (
      !Array.isArray(mismatchRows) ||
      mismatchRows.length !== 1 ||
      mismatchRows[0]?.count !== 0
    ) {
      throw new UlcExerciseCatalogPreviewAdoptionExecutionError(
        "E6G-C3B mapped content mismatch for " +
          table.targetTable + ".",
      );
    }
  }
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
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B reviewed table mapping is incomplete.",
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
    throw new UlcExerciseCatalogPreviewAdoptionConfigurationError(
      "E6G-C3B adoption mapping contains an invalid SQL identifier.",
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

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    assertUlcExerciseCatalogPreviewAdoptionEnvironment();
    const result = await applyUlcExerciseCatalogPreviewAdoption(
      {
        connectionString: process.env.APPBASIS_MIGRATION_DATABASE_URL,
        executionScope: REQUIRED_EXECUTION_SCOPE,
      },
    );
    console.log(
      "ULC E6G-C3B preview adoption PASS: " +
        result.migrationCount + " migrations and " +
        result.tables.length + " tables copied and verified atomically.",
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC E6G-C3B preview adoption failed.",
    );
    process.exitCode = 1;
  }
}

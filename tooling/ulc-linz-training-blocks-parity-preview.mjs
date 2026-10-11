import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  createCatalogContract,
  loadModuleUpdateMigrationExecutionPlan,
} from "./module-update-migration-executor.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const APP_ID = "ulc-linz";
const MODULE_ID = "training-blocks";
const PREVIEW_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL = "appbasis_ulc_linz_preview_migration";
const FOUNDATION_MIGRATION =
  "modules/training-blocks/migrations/0000_appbasis_training_blocks_foundation.sql";
const TARGET_MIGRATION =
  "modules/training-blocks/migrations/0001_appbasis_training_blocks_parity_metadata.sql";
const BASELINE_TABLES = Object.freeze([
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter",
]);
const TARGET_TABLES = Object.freeze([
  "appbasis_training_block_favorite",
  "appbasis_training_block_usage",
]);

export class UlcTrainingBlocksParityPreviewConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingBlocksParityPreviewConfigurationError";
  }
}

export class UlcTrainingBlocksParityPreviewExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingBlocksParityPreviewExecutionError";
  }
}

export async function loadUlcTrainingBlocksParityPreviewPlan(
  { repositoryRoot = process.cwd() } = {},
) {
  const executionPlan = await loadModuleUpdateMigrationExecutionPlan(
    { appId: APP_ID, moduleId: MODULE_ID },
    { repositoryRoot: resolve(repositoryRoot) },
  );
  const expectedMigrations = [FOUNDATION_MIGRATION, TARGET_MIGRATION];
  if (
    executionPlan.application !== APP_ID ||
    executionPlan.moduleId !== MODULE_ID ||
    executionPlan.repositoryState !== "published-target" ||
    executionPlan.targetOwner?.schemaVersion !== 2 ||
    JSON.stringify(executionPlan.targetOwner?.migrations) !==
      JSON.stringify(expectedMigrations) ||
    executionPlan.migrations.length !== 2
  ) {
    throw new UlcTrainingBlocksParityPreviewConfigurationError(
      "E7A6 requires the canonical published training-blocks schema-v2 repository contract.",
    );
  }

  const foundation = executionPlan.migrations.find(
    (migration) => migration.relativePath === FOUNDATION_MIGRATION,
  );
  const migration = executionPlan.migrations.find(
    (entry) => entry.relativePath === TARGET_MIGRATION,
  );
  if (foundation === undefined || migration === undefined) {
    throw new UlcTrainingBlocksParityPreviewConfigurationError(
      "E7A6 training-blocks migration delta is unavailable or ambiguous.",
    );
  }

  const baselineCatalogContract = createCatalogContract(
    [foundation],
    "E7A6 training-blocks schema-v1 baseline",
  );
  const deltaCatalogContract = createCatalogContract(
    [migration],
    "E7A6 training-blocks schema-v2 delta",
  );
  const baselineTables = presentTables(baselineCatalogContract);
  const targetTables = presentTables(deltaCatalogContract);
  if (
    JSON.stringify(baselineTables) !== JSON.stringify([...BASELINE_TABLES].sort()) ||
    JSON.stringify(targetTables) !== JSON.stringify([...TARGET_TABLES].sort())
  ) {
    throw new UlcTrainingBlocksParityPreviewConfigurationError(
      "E7A6 training-blocks catalog contract does not match the expected v1-to-v2 delta.",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    operation: "ulc-training-blocks-parity-preview",
    application: APP_ID,
    moduleId: MODULE_ID,
    preview: Object.freeze({
      environment: PREVIEW_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    }),
    target: Object.freeze({
      schemaVersion: 2,
      migrationPath: TARGET_MIGRATION,
      baselineTables: Object.freeze([...BASELINE_TABLES]),
      tables: Object.freeze([...TARGET_TABLES]),
    }),
    migration: Object.freeze({
      relativePath: migration.relativePath,
      statements: Object.freeze([...migration.statements]),
    }),
    baselineCatalogContract,
    deltaCatalogContract,
    targetCatalogContract: executionPlan.targetCatalogContract,
    productionChanged: false,
  });
}

export function classifyUlcTrainingBlocksParityPreviewShape({ tables } = {}) {
  if (!Array.isArray(tables)) {
    throw new UlcTrainingBlocksParityPreviewConfigurationError(
      "E7A6 preview shape requires a table inventory.",
    );
  }

  const baselineCount = BASELINE_TABLES.filter((table) =>
    tables.includes(table),
  ).length;
  if (baselineCount !== BASELINE_TABLES.length) {
    throw new UlcTrainingBlocksParityPreviewExecutionError(
      "E7A6 requires the complete E7A5 training-blocks schema-v1 preview baseline.",
    );
  }

  const targetCount = TARGET_TABLES.filter((table) => tables.includes(table)).length;
  if (targetCount === 0) return "migration-required";
  if (targetCount === TARGET_TABLES.length) return "current";

  throw new UlcTrainingBlocksParityPreviewExecutionError(
    "E7A6 training-blocks schema-v2 delta is partially applied or drifted.",
  );
}

export async function inspectUlcTrainingBlocksParityPreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcTrainingBlocksParityPreviewPlan,
  } = {},
) {
  const context = await validatedContext(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
      repositoryRoot,
    },
    { loadPlan },
  );

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
    await verifyMigrationIdentity(database.client);
    const tables = await publicTableInventory(database.client);
    const state = classifyUlcTrainingBlocksParityPreviewShape({
      tables: [...tables],
    });
    await assertCatalogContract(
      database.client,
      context.plan.baselineCatalogContract,
    );
    if (state === "current") {
      await assertCatalogContract(
        database.client,
        context.plan.targetCatalogContract,
      );
    }
    return previewResult(state, context.plan);
  } finally {
    if (database !== undefined) {
      await database.client.end().catch(() => {});
    }
  }
}

export async function applyUlcTrainingBlocksParityPreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcTrainingBlocksParityPreviewPlan,
  } = {},
) {
  if (apply !== true) {
    throw new UlcTrainingBlocksParityPreviewConfigurationError(
      "E7A6 preview migration requires explicit apply authorization.",
    );
  }
  const context = await validatedContext(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
      repositoryRoot,
    },
    { loadPlan },
  );

  const before = await inspectUlcTrainingBlocksParityPreview(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    },
    { repositoryRoot, databaseFactory, loadPlan },
  );
  if (before.state === "current") {
    return Object.freeze({
      state: "already-current",
      application: APP_ID,
      moduleId: MODULE_ID,
      productionChanged: false,
    });
  }

  let database;
  let primaryError;
  let statementCount = 0;
  try {
    database = databaseFactory(migrationDatabaseUrl);
    await database.client.begin(async (transaction) => {
      await verifyMigrationIdentity(transaction);
      await transaction.unsafe(
        "SELECT pg_catalog.set_config('search_path', 'public', true) AS configured_search_path",
      );
      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:training-blocks-parity-preview', 0))",
      );
      const tables = await publicTableInventory(transaction);
      const lockedState = classifyUlcTrainingBlocksParityPreviewShape({
        tables: [...tables],
      });
      if (lockedState !== "migration-required") {
        throw new UlcTrainingBlocksParityPreviewExecutionError(
          "E7A6 preview migration no longer has the expected schema-v1 baseline.",
        );
      }
      await assertCatalogContract(
        transaction,
        context.plan.baselineCatalogContract,
      );
      for (const statement of context.plan.migration.statements) {
        await transaction.unsafe(statement);
        statementCount += 1;
      }
      await assertCatalogContract(
        transaction,
        context.plan.targetCatalogContract,
      );
      const afterTables = await publicTableInventory(transaction);
      if (
        classifyUlcTrainingBlocksParityPreviewShape({
          tables: [...afterTables],
        }) !== "current"
      ) {
        throw new UlcTrainingBlocksParityPreviewExecutionError(
          "E7A6 preview migration completed without reaching schema v2.",
        );
      }
    });

    return Object.freeze({
      state: "applied",
      application: APP_ID,
      moduleId: MODULE_ID,
      migrationCount: 1,
      statementCount,
      productionChanged: false,
    });
  } catch (error) {
    primaryError = error;
    if (error instanceof UlcTrainingBlocksParityPreviewExecutionError) {
      throw error;
    }
    throw new UlcTrainingBlocksParityPreviewExecutionError(
      "E7A6 preview migration transaction failed and was rolled back.",
    );
  } finally {
    if (database !== undefined) {
      try {
        await database.client.end();
      } catch {
        if (primaryError === undefined) {
          throw new UlcTrainingBlocksParityPreviewExecutionError(
            "E7A6 preview database connection could not be closed cleanly.",
          );
        }
      }
    }
  }
}

export async function verifyUlcTrainingBlocksParityPreview(
  input = {},
  options = {},
) {
  const result = await inspectUlcTrainingBlocksParityPreview(input, options);
  if (result.state !== "current") {
    throw new UlcTrainingBlocksParityPreviewExecutionError(
      "E7A6 preview verification requires the complete training-blocks schema v2.",
    );
  }
  return result;
}

async function validatedContext(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot,
  },
  { loadPlan },
) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  if (
    credentials.migration.database !== EXPECTED_DATABASE ||
    credentials.migration.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcTrainingBlocksParityPreviewConfigurationError(
      "E7A6 migration credential does not identify the exact isolated ULC preview target.",
    );
  }
  const plan = await loadPlan({ repositoryRoot });
  return Object.freeze({ credentials, plan });
}

function previewResult(state, plan) {
  return Object.freeze({
    state,
    application: APP_ID,
    moduleId: MODULE_ID,
    preview: plan.preview,
    target: plan.target,
    productionChanged: false,
  });
}

function presentTables(contract) {
  return contract
    .filter((marker) => marker.kind === "table" && marker.present === true)
    .map((marker) => marker.name)
    .sort();
}

async function verifyMigrationIdentity(client) {
  const rows = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0]?.database_name !== EXPECTED_DATABASE ||
    rows[0]?.principal_name !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcTrainingBlocksParityPreviewExecutionError(
      "E7A6 database connection did not select the required preview database and migration principal.",
    );
  }
}

async function publicTableInventory(client) {
  const rows = await client.unsafe(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  if (!Array.isArray(rows)) {
    throw new UlcTrainingBlocksParityPreviewExecutionError(
      "E7A6 preview table inventory is unavailable.",
    );
  }
  return new Set(rows.map((row) => row?.tablename).filter(Boolean));
}

async function assertCatalogContract(client, contract) {
  for (const marker of contract) {
    if (!(await catalogMarkerMatches(client, marker))) {
      throw new UlcTrainingBlocksParityPreviewExecutionError(
        "E7A6 training-blocks schema is partially applied or drifted.",
      );
    }
  }
}

async function catalogMarkerMatches(client, marker) {
  if (marker.kind === "table") {
    const rows = await client.unsafe(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = $1
            AND c.relkind IN ('r', 'p')
       ) AS present`,
      [marker.name],
    );
    return rows[0]?.present === marker.present;
  }
  if (marker.kind === "index") {
    const rows = await client.unsafe(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
           JOIN pg_catalog.pg_class rel ON rel.oid = i.indrelid
          WHERE n.nspname = 'public'
            AND c.relname = $1
            AND c.relkind = 'i'
            AND rel.relname = $2
       ) AS present`,
      [marker.name, marker.table],
    );
    return rows[0]?.present === marker.present;
  }
  if (marker.kind === "column") {
    const rows = await client.unsafe(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
       ) AS present`,
      [marker.table, marker.name],
    );
    return rows[0]?.present === marker.present;
  }
  if (marker.kind === "constraint") {
    const rows = await client.unsafe(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_constraint con
           JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
          WHERE n.nspname = 'public'
            AND rel.relname = $1
            AND con.conname = $2
       ) AS present`,
      [marker.table, marker.name],
    );
    return rows[0]?.present === marker.present;
  }
  if (marker.kind === "constraint-count") {
    const rows = await client.unsafe(
      `SELECT count(*)::int AS count
         FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = $1
          AND con.contype = $2`,
      [marker.table, marker.name],
    );
    return rows[0]?.count === marker.count;
  }
  throw new UlcTrainingBlocksParityPreviewConfigurationError(
    "E7A6 target catalog marker kind is unsupported.",
  );
}

async function main() {
  const command = process.argv[2] ?? "plan";
  const input = {
    migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  };
  if (command === "plan") {
    const plan = await loadUlcTrainingBlocksParityPreviewPlan();
    process.stdout.write(
      JSON.stringify({
        schemaVersion: plan.schemaVersion,
        operation: plan.operation,
        application: plan.application,
        moduleId: plan.moduleId,
        preview: plan.preview,
        target: plan.target,
        productionChanged: plan.productionChanged,
      }) + "\n",
    );
    return;
  }
  if (command === "inspect") {
    process.stdout.write(
      JSON.stringify(await inspectUlcTrainingBlocksParityPreview(input)) + "\n",
    );
    return;
  }
  if (command === "apply") {
    const explicitlyAuthorized =
      process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
      process.env.APPBASIS_APPLY_TRAINING_BLOCKS_PARITY_PREVIEW === "1";
    process.stdout.write(
      JSON.stringify(
        await applyUlcTrainingBlocksParityPreview({
          ...input,
          apply: explicitlyAuthorized,
        }),
      ) + "\n",
    );
    return;
  }
  if (command === "verify") {
    process.stdout.write(
      JSON.stringify(await verifyUlcTrainingBlocksParityPreview(input)) + "\n",
    );
    return;
  }
  throw new UlcTrainingBlocksParityPreviewConfigurationError(
    "E7A6 preview command must be plan, inspect, apply or verify.",
  );
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "E7A6 training-blocks preview operation failed.",
    );
    process.exitCode = 1;
  }
}

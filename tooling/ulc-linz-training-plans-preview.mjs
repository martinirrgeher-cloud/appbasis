import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  applyModuleUpdateMigrations,
  loadModuleUpdateMigrationExecutionPlan,
} from "./module-update-migration-executor.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const APP_ID = "ulc-linz";
const MODULE_ID = "training-plans";
const PREVIEW_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const EXPECTED_MIGRATIONS = Object.freeze([
  "modules/training-plans/migrations/0000_appbasis_training_plans_foundation.sql",
  "modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql",
]);
const EXPECTED_TABLES = Object.freeze([
  "appbasis_training_plan",
  "appbasis_training_plan_revision",
  "appbasis_training_plan_revision_item",
  "appbasis_training_plan_subject_deletion",
]);
const REQUIRED_TRAINING_BLOCKS_V2_TABLES = Object.freeze([
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter",
  "appbasis_training_block_favorite",
  "appbasis_training_block_usage",
]);

export class UlcTrainingPlansPreviewConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingPlansPreviewConfigurationError";
  }
}

export class UlcTrainingPlansPreviewExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingPlansPreviewExecutionError";
  }
}

export async function loadUlcTrainingPlansPreviewPlan(
  { repositoryRoot = process.cwd() } = {},
) {
  const executionPlan = await loadModuleUpdateMigrationExecutionPlan(
    { appId: APP_ID, moduleId: MODULE_ID },
    { repositoryRoot: resolve(repositoryRoot) },
  );
  const targetTables = presentTables(
    executionPlan.targetCatalogContract,
  );
  const baselineTables = new Set(
    presentTables(executionPlan.baselineCatalogContract),
  );

  if (
    executionPlan.application !== APP_ID ||
    executionPlan.moduleId !== MODULE_ID ||
    executionPlan.repositoryState !== "published-target" ||
    executionPlan.targetOwner?.schemaVersion !== 2 ||
    JSON.stringify(executionPlan.targetOwner?.migrations) !==
      JSON.stringify(EXPECTED_MIGRATIONS) ||
    JSON.stringify(targetTables) !==
      JSON.stringify([...EXPECTED_TABLES].sort()) ||
    REQUIRED_TRAINING_BLOCKS_V2_TABLES.some(
      (table) => !baselineTables.has(table),
    )
  ) {
    throw new UlcTrainingPlansPreviewConfigurationError(
      "E7B9 requires the canonical published training-plans schema-v2 contract on the training-blocks-v2 baseline.",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    operation: "ulc-training-plans-preview",
    application: APP_ID,
    moduleId: MODULE_ID,
    preview: Object.freeze({
      environment: PREVIEW_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    }),
    target: Object.freeze({
      schemaVersion: 2,
      migrations: Object.freeze([...EXPECTED_MIGRATIONS]),
      tables: Object.freeze([...EXPECTED_TABLES]),
    }),
    requiredTrainingBlocksTables: Object.freeze([
      ...REQUIRED_TRAINING_BLOCKS_V2_TABLES,
    ]),
    executionPlan,
    productionChanged: false,
  });
}

export function classifyUlcTrainingPlansPreviewShape(
  { tables } = {},
) {
  if (!Array.isArray(tables)) {
    throw new UlcTrainingPlansPreviewConfigurationError(
      "E7B9 preview shape requires a table inventory.",
    );
  }

  const present = EXPECTED_TABLES.filter((table) =>
    tables.includes(table),
  );
  if (present.length === 0) return "migration-required";
  if (present.length === EXPECTED_TABLES.length) return "current";

  throw new UlcTrainingPlansPreviewExecutionError(
    "E7B9 training-plans schema is partially applied or drifted.",
  );
}

export async function inspectUlcTrainingPlansPreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcTrainingPlansPreviewPlan,
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

    for (const table of context.plan.requiredTrainingBlocksTables) {
      if (!tables.has(table)) {
        throw new UlcTrainingPlansPreviewExecutionError(
          "E7B9 requires the complete training-blocks-v2 preview baseline.",
        );
      }
    }

    const state = classifyUlcTrainingPlansPreviewShape({
      tables: [...tables],
    });
    await assertCatalogContract(
      database.client,
      context.plan.executionPlan.baselineCatalogContract,
      "E7B9 preview baseline is incomplete or drifted.",
    );
    if (state === "current") {
      await assertCatalogContract(
        database.client,
        context.plan.executionPlan.targetCatalogContract,
        "E7B9 training-plans schema is partially applied or drifted.",
      );
    }

    return Object.freeze({
      state,
      application: APP_ID,
      moduleId: MODULE_ID,
      preview: context.plan.preview,
      target: context.plan.target,
      trainingBlocksSchemaVersion: 2,
      productionChanged: false,
    });
  } finally {
    if (database !== undefined) {
      await database.client.end().catch(() => {});
    }
  }
}

export async function applyUlcTrainingPlansPreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcTrainingPlansPreviewPlan,
  } = {},
) {
  if (apply !== true) {
    throw new UlcTrainingPlansPreviewConfigurationError(
      "E7B9 preview migration requires explicit apply authorization.",
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
  const before = await inspectUlcTrainingPlansPreview(
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

  const result = await applyModuleUpdateMigrations(
    {
      appId: APP_ID,
      moduleId: MODULE_ID,
      connectionString: migrationDatabaseUrl,
      expectedDatabase: EXPECTED_DATABASE,
      expectedPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    },
    {
      repositoryRoot: resolve(repositoryRoot),
      createDatabase: databaseFactory,
    },
  );

  const after = await inspectUlcTrainingPlansPreview(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    },
    { repositoryRoot, databaseFactory, loadPlan },
  );
  if (after.state !== "current") {
    throw new UlcTrainingPlansPreviewExecutionError(
      "E7B9 preview migration completed without reaching training-plans schema v2.",
    );
  }

  return Object.freeze({
    state: "applied",
    application: APP_ID,
    moduleId: MODULE_ID,
    migrationCount: result.migrationCount,
    statementCount: result.statementCount,
    productionChanged: false,
  });
}

export async function verifyUlcTrainingPlansPreview(
  input = {},
  options = {},
) {
  const result = await inspectUlcTrainingPlansPreview(input, options);
  if (result.state !== "current") {
    throw new UlcTrainingPlansPreviewExecutionError(
      "E7B9 preview verification requires the complete training-plans schema v2.",
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
    throw new UlcTrainingPlansPreviewConfigurationError(
      "E7B9 migration credential does not identify the exact isolated ULC preview target.",
    );
  }
  const plan = await loadPlan({ repositoryRoot });
  return Object.freeze({ credentials, plan });
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
    throw new UlcTrainingPlansPreviewExecutionError(
      "E7B9 database connection did not select the required preview database and migration principal.",
    );
  }
}

async function publicTableInventory(client) {
  const rows = await client.unsafe(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  if (!Array.isArray(rows)) {
    throw new UlcTrainingPlansPreviewExecutionError(
      "E7B9 preview table inventory is unavailable.",
    );
  }
  return new Set(rows.map((row) => row?.tablename).filter(Boolean));
}

async function assertCatalogContract(client, contract, message) {
  for (const marker of contract) {
    if (!(await catalogMarkerMatches(client, marker))) {
      throw new UlcTrainingPlansPreviewExecutionError(message);
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
  throw new UlcTrainingPlansPreviewConfigurationError(
    "E7B9 catalog marker kind is unsupported.",
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
    const plan = await loadUlcTrainingPlansPreviewPlan();
    process.stdout.write(
      JSON.stringify({
        schemaVersion: plan.schemaVersion,
        operation: plan.operation,
        application: plan.application,
        moduleId: plan.moduleId,
        preview: plan.preview,
        target: plan.target,
        requiredTrainingBlocksTables:
          plan.requiredTrainingBlocksTables,
        productionChanged: plan.productionChanged,
      }) + "\n",
    );
    return;
  }
  if (command === "inspect") {
    process.stdout.write(
      JSON.stringify(
        await inspectUlcTrainingPlansPreview(input),
      ) + "\n",
    );
    return;
  }
  if (command === "apply") {
    const explicitlyAuthorized =
      process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
      process.env.APPBASIS_APPLY_TRAINING_PLANS_PREVIEW === "1";
    process.stdout.write(
      JSON.stringify(
        await applyUlcTrainingPlansPreview({
          ...input,
          apply: explicitlyAuthorized,
        }),
      ) + "\n",
    );
    return;
  }
  if (command === "verify") {
    process.stdout.write(
      JSON.stringify(
        await verifyUlcTrainingPlansPreview(input),
      ) + "\n",
    );
    return;
  }

  throw new UlcTrainingPlansPreviewConfigurationError(
    "E7B9 preview command must be plan, inspect, apply or verify.",
  );
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url ===
    pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "E7B9 training-plans preview operation failed.",
    );
    process.exitCode = 1;
  }
}

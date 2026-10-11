import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  applyModuleUpdateMigrations,
  loadModuleUpdateMigrationExecutionPlan,
} from "./module-update-migration-executor.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const APP_ID = "ulc-linz";
const MODULE_ID = "training-blocks";
const PREVIEW_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const EXPECTED_MIGRATION_PATH =
  "modules/training-blocks/migrations/0000_appbasis_training_blocks_foundation.sql";
const EXPECTED_TABLES = Object.freeze([
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_block_revision_item",
  "appbasis_training_block_revision_item_parameter",
]);

export class UlcTrainingBlocksPreviewConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingBlocksPreviewConfigurationError";
  }
}

export class UlcTrainingBlocksPreviewExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingBlocksPreviewExecutionError";
  }
}

export async function loadUlcTrainingBlocksPreviewPlan(
  { repositoryRoot = process.cwd() } = {},
) {
  const executionPlan = await loadModuleUpdateMigrationExecutionPlan(
    { appId: APP_ID, moduleId: MODULE_ID },
    { repositoryRoot: resolve(repositoryRoot) },
  );

  const targetTables = executionPlan.targetCatalogContract
    .filter((marker) => marker.kind === "table" && marker.present === true)
    .map((marker) => marker.name)
    .sort();

  if (
    executionPlan.application !== APP_ID ||
    executionPlan.moduleId !== MODULE_ID ||
    executionPlan.repositoryState !== "published-target" ||
    executionPlan.targetOwner?.schemaVersion !== 1 ||
    !Array.isArray(executionPlan.targetOwner?.migrations) ||
    executionPlan.targetOwner.migrations.length !== 1 ||
    executionPlan.targetOwner.migrations[0] !== EXPECTED_MIGRATION_PATH ||
    JSON.stringify(targetTables) !== JSON.stringify([...EXPECTED_TABLES].sort())
  ) {
    throw new UlcTrainingBlocksPreviewConfigurationError(
      "E7A5 requires the canonical published training-blocks schema-v1 repository contract.",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    operation: "ulc-training-blocks-preview",
    application: APP_ID,
    moduleId: MODULE_ID,
    preview: Object.freeze({
      environment: PREVIEW_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    }),
    target: Object.freeze({
      schemaVersion: 1,
      migrationPath: EXPECTED_MIGRATION_PATH,
      tables: Object.freeze([...EXPECTED_TABLES]),
    }),
    executionPlan,
    productionChanged: false,
  });
}

export function classifyUlcTrainingBlocksPreviewShape(
  { tables } = {},
) {
  if (!Array.isArray(tables)) {
    throw new UlcTrainingBlocksPreviewConfigurationError(
      "E7A5 preview shape requires a table inventory.",
    );
  }

  const present = EXPECTED_TABLES.filter((table) => tables.includes(table));
  if (present.length === 0) return "migration-required";
  if (present.length === EXPECTED_TABLES.length) return "current";

  throw new UlcTrainingBlocksPreviewExecutionError(
    "E7A5 training-blocks schema is partially applied or drifted.",
  );
}

export async function inspectUlcTrainingBlocksPreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
  } = {},
) {
  const context = await validatedContext({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot,
  });

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
    await verifyMigrationIdentity(database.client);

    const rows = await database.client.unsafe(
      `SELECT tablename
         FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
        ORDER BY tablename`,
      [[...EXPECTED_TABLES]],
    );
    if (!Array.isArray(rows)) {
      throw new UlcTrainingBlocksPreviewExecutionError(
        "E7A5 preview table inventory is unavailable.",
      );
    }

    const state = classifyUlcTrainingBlocksPreviewShape({
      tables: rows.map((row) => row?.tablename).filter(Boolean),
    });

    if (state === "current") {
      await assertCatalogContract(
        database.client,
        context.plan.executionPlan.targetCatalogContract,
      );
    }

    return Object.freeze({
      state,
      application: APP_ID,
      moduleId: MODULE_ID,
      preview: context.plan.preview,
      target: context.plan.target,
      productionChanged: false,
    });
  } finally {
    if (database !== undefined) {
      await database.client.end().catch(() => {});
    }
  }
}

export async function applyUlcTrainingBlocksPreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
  } = {},
) {
  if (apply !== true) {
    throw new UlcTrainingBlocksPreviewConfigurationError(
      "E7A5 preview migration requires explicit apply authorization.",
    );
  }

  const credentials = validateUlcLinzD4PreviewDatabaseCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  assertExactPreviewCredentials(credentials);

  const before = await inspectUlcTrainingBlocksPreview(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    },
    { repositoryRoot, databaseFactory },
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

  const after = await inspectUlcTrainingBlocksPreview(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    },
    { repositoryRoot, databaseFactory },
  );
  if (after.state !== "current") {
    throw new UlcTrainingBlocksPreviewExecutionError(
      "E7A5 preview migration completed without reaching the canonical target.",
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

export async function verifyUlcTrainingBlocksPreview(
  input = {},
  options = {},
) {
  const result = await inspectUlcTrainingBlocksPreview(input, options);
  if (result.state !== "current") {
    throw new UlcTrainingBlocksPreviewExecutionError(
      "E7A5 preview verification requires the complete training-blocks schema.",
    );
  }
  return result;
}

async function validatedContext({
  migrationDatabaseUrl,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
  repositoryRoot,
}) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  assertExactPreviewCredentials(credentials);
  const plan = await loadUlcTrainingBlocksPreviewPlan({ repositoryRoot });
  return Object.freeze({ credentials, plan });
}

function assertExactPreviewCredentials(credentials) {
  if (
    credentials.migration.database !== EXPECTED_DATABASE ||
    credentials.migration.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcTrainingBlocksPreviewConfigurationError(
      "E7A5 migration credential does not identify the exact isolated ULC preview target.",
    );
  }
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
    throw new UlcTrainingBlocksPreviewExecutionError(
      "E7A5 database connection did not select the required preview database and migration principal.",
    );
  }
}

async function assertCatalogContract(client, contract) {
  for (const marker of contract) {
    const matches = await catalogMarkerMatches(client, marker);
    if (!matches) {
      throw new UlcTrainingBlocksPreviewExecutionError(
        "E7A5 training-blocks schema is partially applied or drifted.",
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

  throw new UlcTrainingBlocksPreviewConfigurationError(
    "E7A5 target catalog marker kind is unsupported.",
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
    const plan = await loadUlcTrainingBlocksPreviewPlan();
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
      JSON.stringify(await inspectUlcTrainingBlocksPreview(input)) + "\n",
    );
    return;
  }
  if (command === "apply") {
    const explicitlyAuthorized =
      process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
      process.env.APPBASIS_APPLY_TRAINING_BLOCKS_PREVIEW === "1";
    process.stdout.write(
      JSON.stringify(
        await applyUlcTrainingBlocksPreview({
          ...input,
          apply: explicitlyAuthorized,
        }),
      ) + "\n",
    );
    return;
  }
  if (command === "verify") {
    process.stdout.write(
      JSON.stringify(await verifyUlcTrainingBlocksPreview(input)) + "\n",
    );
    return;
  }

  throw new UlcTrainingBlocksPreviewConfigurationError(
    "E7A5 preview command must be plan, inspect, apply or verify.",
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
        : "E7A5 training-blocks preview operation failed.",
    );
    process.exitCode = 1;
  }
}

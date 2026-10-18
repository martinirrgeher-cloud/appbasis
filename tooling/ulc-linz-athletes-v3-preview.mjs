import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  createCatalogContract,
  loadModuleUpdateMigrationExecutionPlan,
} from "./module-update-migration-executor.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const APP_ID = "ulc-linz";
const MODULE_ID = "athletes";
const PREVIEW_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL = "appbasis_ulc_linz_preview_migration";
const FOUNDATION_MIGRATION =
  "modules/athletes/migrations/0000_appbasis_athletes_foundation.sql";
const DELETION_MIGRATION =
  "modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql";
const TARGET_MIGRATION =
  "modules/athletes/migrations/0002_appbasis_athlete_contacts.sql";

const EXPECTED_MIGRATIONS = Object.freeze([
  FOUNDATION_MIGRATION,
  DELETION_MIGRATION,
  TARGET_MIGRATION,
]);

export class UlcAthletesV3PreviewConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcAthletesV3PreviewConfigurationError";
  }
}

export class UlcAthletesV3PreviewExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcAthletesV3PreviewExecutionError";
  }
}

export async function loadUlcAthletesV3PreviewPlan(
  { repositoryRoot = process.cwd() } = {},
) {
  const executionPlan = await loadModuleUpdateMigrationExecutionPlan(
    { appId: APP_ID, moduleId: MODULE_ID },
    { repositoryRoot: resolve(repositoryRoot) },
  );

  if (
    executionPlan.application !== APP_ID ||
    executionPlan.moduleId !== MODULE_ID ||
    executionPlan.repositoryState !== "published-target" ||
    executionPlan.targetOwner?.schemaVersion !== 3 ||
    JSON.stringify(executionPlan.targetOwner?.migrations) !==
      JSON.stringify(EXPECTED_MIGRATIONS) ||
    executionPlan.migrations.length !== 3
  ) {
    throw new UlcAthletesV3PreviewConfigurationError(
      "Athletes v3 preview requires the canonical published schema-v3 repository contract.",
    );
  }

  const foundation = executionPlan.migrations.find(
    (entry) => entry.relativePath === FOUNDATION_MIGRATION,
  );
  const deletion = executionPlan.migrations.find(
    (entry) => entry.relativePath === DELETION_MIGRATION,
  );
  const migration = executionPlan.migrations.find(
    (entry) => entry.relativePath === TARGET_MIGRATION,
  );
  if (
    foundation === undefined ||
    deletion === undefined ||
    migration === undefined
  ) {
    throw new UlcAthletesV3PreviewConfigurationError(
      "Athletes v3 preview migration inventory is incomplete.",
    );
  }

  const baselineCatalogContract = additiveCompatibleCatalogContract(
    createCatalogContract(
      [foundation, deletion],
      "athletes schema-v2 preview baseline",
    ),
  );
  const deltaCatalogContract = createCatalogContract(
    [migration],
    "athletes schema-v3 preview delta",
  );

  return Object.freeze({
    schemaVersion: 1,
    operation: "ulc-athletes-v3-preview",
    application: APP_ID,
    moduleId: MODULE_ID,
    preview: Object.freeze({
      environment: PREVIEW_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    }),
    target: Object.freeze({
      schemaVersion: 3,
      migrationPath: TARGET_MIGRATION,
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

export function classifyUlcAthletesV3PreviewShape(
  {
    athleteOrganizationConstraint,
    contactTable,
    contactIndex,
  } = {},
) {
  const values = [
    athleteOrganizationConstraint,
    contactTable,
    contactIndex,
  ];
  if (values.some((value) => typeof value !== "boolean")) {
    throw new UlcAthletesV3PreviewConfigurationError(
      "Athletes v3 preview shape requires explicit catalog booleans.",
    );
  }
  const present = values.filter(Boolean).length;
  if (present === 0) return "migration-required";
  if (present === values.length) return "current";
  throw new UlcAthletesV3PreviewExecutionError(
    "Athletes schema-v3 delta is partially applied or drifted.",
  );
}

export async function inspectUlcAthletesV3Preview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcAthletesV3PreviewPlan,
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
    await assertCatalogContract(
      database.client,
      context.plan.baselineCatalogContract,
      "Athletes schema-v2 preview baseline is incomplete or drifted.",
    );
    const state = classifyUlcAthletesV3PreviewShape(
      await readV3Shape(database.client),
    );
    if (state === "current") {
      await assertCatalogContract(
        database.client,
        context.plan.targetCatalogContract,
        "Athletes schema-v3 preview target is incomplete or drifted.",
      );
    }
    return previewResult(state, context.plan);
  } finally {
    if (database !== undefined) {
      await database.client.end().catch(() => {});
    }
  }
}

export async function applyUlcAthletesV3Preview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  {
    repositoryRoot = process.cwd(),
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcAthletesV3PreviewPlan,
  } = {},
) {
  if (apply !== true) {
    throw new UlcAthletesV3PreviewConfigurationError(
      "Athletes v3 preview migration requires explicit apply authorization.",
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

  const before = await inspectUlcAthletesV3Preview(
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
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:athletes-v3-preview', 0))",
      );
      await assertCatalogContract(
        transaction,
        context.plan.baselineCatalogContract,
        "Athletes schema-v2 preview baseline changed before v3 migration.",
      );
      const lockedState = classifyUlcAthletesV3PreviewShape(
        await readV3Shape(transaction),
      );
      if (lockedState !== "migration-required") {
        throw new UlcAthletesV3PreviewExecutionError(
          "Athletes v3 preview migration no longer has the expected schema-v2 baseline.",
        );
      }

      for (const statement of context.plan.migration.statements) {
        await transaction.unsafe(statement);
        statementCount += 1;
      }

      await assertCatalogContract(
        transaction,
        context.plan.targetCatalogContract,
        "Athletes schema-v3 preview migration did not reach its target contract.",
      );
      if (
        classifyUlcAthletesV3PreviewShape(
          await readV3Shape(transaction),
        ) !== "current"
      ) {
        throw new UlcAthletesV3PreviewExecutionError(
          "Athletes v3 preview migration completed without reaching schema v3.",
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
    if (error instanceof UlcAthletesV3PreviewExecutionError) {
      throw error;
    }
    throw new UlcAthletesV3PreviewExecutionError(
      "Athletes v3 preview migration transaction failed and was rolled back.",
    );
  } finally {
    if (database !== undefined) {
      try {
        await database.client.end();
      } catch {
        if (primaryError === undefined) {
          throw new UlcAthletesV3PreviewExecutionError(
            "Athletes v3 preview database connection could not be closed cleanly.",
          );
        }
      }
    }
  }
}

export async function verifyUlcAthletesV3Preview(
  input = {},
  options = {},
) {
  const result = await inspectUlcAthletesV3Preview(input, options);
  if (result.state !== "current") {
    throw new UlcAthletesV3PreviewExecutionError(
      "Athletes v3 preview verification requires the complete schema-v3 delta.",
    );
  }
  return result;
}

function additiveCompatibleCatalogContract(contract) {
  return Object.freeze(
    contract.filter(
      (marker) =>
        !(
          marker.kind === "constraint-count" &&
          marker.table === "appbasis_athlete"
        ),
    ),
  );
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
    throw new UlcAthletesV3PreviewConfigurationError(
      "Athletes v3 migration credential does not identify the exact isolated ULC preview target.",
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

async function readV3Shape(client) {
  const tableRows = await client.unsafe(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'appbasis_athlete_contact'
          AND c.relkind IN ('r', 'p')
     ) AS present`,
  );
  const indexRows = await client.unsafe(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
         JOIN pg_catalog.pg_class rel ON rel.oid = i.indrelid
        WHERE n.nspname = 'public'
          AND c.relname = 'appbasis_athlete_contact_athlete_idx'
          AND c.relkind = 'i'
          AND rel.relname = 'appbasis_athlete_contact'
     ) AS present`,
  );
  const constraintRows = await client.unsafe(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = 'appbasis_athlete'
          AND con.conname = 'appbasis_athlete_org_id_unique'
     ) AS present`,
  );
  return Object.freeze({
    athleteOrganizationConstraint: constraintRows[0]?.present === true,
    contactTable: tableRows[0]?.present === true,
    contactIndex: indexRows[0]?.present === true,
  });
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
    throw new UlcAthletesV3PreviewExecutionError(
      "Athletes v3 database connection did not select the required preview database and migration principal.",
    );
  }
}

async function assertCatalogContract(client, contract, message) {
  for (const marker of contract) {
    if (!(await catalogMarkerMatches(client, marker))) {
      throw new UlcAthletesV3PreviewExecutionError(message);
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
  throw new UlcAthletesV3PreviewConfigurationError(
    "Athletes v3 catalog marker kind is unsupported.",
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
    const plan = await loadUlcAthletesV3PreviewPlan();
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
      JSON.stringify(await inspectUlcAthletesV3Preview(input)) + "\n",
    );
    return;
  }
  if (command === "apply") {
    const explicitlyAuthorized =
      process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
      process.env.APPBASIS_APPLY_ATHLETES_V3_PREVIEW === "1";
    process.stdout.write(
      JSON.stringify(
        await applyUlcAthletesV3Preview({
          ...input,
          apply: explicitlyAuthorized,
        }),
      ) + "\n",
    );
    return;
  }
  if (command === "verify") {
    process.stdout.write(
      JSON.stringify(await verifyUlcAthletesV3Preview(input)) + "\n",
    );
    return;
  }

  throw new UlcAthletesV3PreviewConfigurationError(
    "Athletes v3 preview command must be plan, inspect, apply or verify.",
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
        : "Athletes v3 preview operation failed.",
    );
    process.exitCode = 1;
  }
}

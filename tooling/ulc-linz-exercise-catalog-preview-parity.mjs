import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";
import { verifyUlcExerciseCatalogPreviewSourceWriteQuiescence } from "./ulc-linz-exercise-catalog-preview-quiescence.mjs";

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const APP_ID = "ulc-linz";
const MODULE_ID = "exercise-catalog";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const MIGRATION_PATH =
  "modules/exercise-catalog/migrations/0002_appbasis_exercise_catalog_parity.sql";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

const BASELINE_TABLES = Object.freeze([
  "appbasis_exercise_catalog_item",
  "appbasis_exercise_catalog_parameter",
  "appbasis_exercise_catalog_audience",
  "appbasis_exercise_catalog_favorite",
]);

const PARITY_TABLES = Object.freeze([
  "appbasis_exercise_catalog_video",
  "appbasis_exercise_catalog_similarity",
  "appbasis_exercise_catalog_usage",
  "appbasis_exercise_catalog_private_media",
]);

const PARITY_MARKERS = Object.freeze([
  "difficulty-column",
  "difficulty-constraint",
  "video-table",
  "video-index",
  "similarity-table",
  "similarity-index",
  "usage-table",
  "usage-index",
  "private-media-table",
  "private-media-storage-index",
  "private-media-exercise-index",
]);

export class UlcExerciseCatalogPreviewParityConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewParityConfigurationError";
  }
}

export class UlcExerciseCatalogPreviewParityExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewParityExecutionError";
  }
}

export async function loadUlcExerciseCatalogPreviewParityPlan(
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
) {
  const root = resolve(repositoryRoot);
  const [databaseManifest, moduleManifest, migrationSql] =
    await Promise.all([
      readJson(join(root, "apps", APP_ID, "appbasis.database.json")),
      readJson(join(root, "modules", MODULE_ID, "appbasis.module.json")),
      readFile(join(root, MIGRATION_PATH), "utf8"),
    ]);

  const owner = databaseManifest?.owners?.find(
    (candidate) => candidate?.id === MODULE_ID,
  );
  const moduleDatabase = moduleManifest?.database;
  if (
    databaseManifest?.application !== APP_ID ||
    owner?.root !== "modules/exercise-catalog" ||
    owner?.schemaVersion !== 3 ||
    !Array.isArray(owner?.migrations) ||
    owner.migrations.at(-1) !== MIGRATION_PATH ||
    moduleDatabase?.schemaVersion !== 3 ||
    JSON.stringify(moduleDatabase?.migrations) !==
      JSON.stringify(owner.migrations)
  ) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity requires the canonical exercise-catalog schema-v3 repository contract.",
    );
  }

  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  if (statements.length !== 11) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity migration statement contract drifted.",
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    operation: "ulc-exercise-catalog-preview-parity",
    application: APP_ID,
    moduleId: MODULE_ID,
    preview: {
      environment: "generated-preview-ulc-linz",
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    },
    target: {
      schemaVersion: 3,
      migrationPath: MIGRATION_PATH,
      statementCount: statements.length,
      parityMarkers: [...PARITY_MARKERS],
      runtimeMode: "standard-module",
    },
    statements,
    productionChanged: false,
  });
}

export function classifyUlcExerciseCatalogPreviewParityShape(shape) {
  if (
    shape === null ||
    typeof shape !== "object" ||
    Array.isArray(shape) ||
    !Array.isArray(shape.baselineTables) ||
    !Array.isArray(shape.parityMarkers)
  ) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity database shape is invalid.",
    );
  }
  if (
    BASELINE_TABLES.some(
      (table) => !shape.baselineTables.includes(table),
    )
  ) {
    throw new UlcExerciseCatalogPreviewParityExecutionError(
      "E6H preview parity requires the complete standard-module schema-v2 baseline.",
    );
  }

  const presentMarkers = PARITY_MARKERS.filter((marker) =>
    shape.parityMarkers.includes(marker),
  );
  if (presentMarkers.length === 0) return "upgrade-required";
  if (presentMarkers.length === PARITY_MARKERS.length) return "current";
  throw new UlcExerciseCatalogPreviewParityExecutionError(
    "E6H preview parity schema is partially applied or drifted.",
  );
}

export async function inspectUlcExerciseCatalogPreviewParity(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    verifyQuiescence =
      verifyUlcExerciseCatalogPreviewSourceWriteQuiescence,
  } = {},
) {
  const context = await validatedContext({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot,
    databaseFactory,
    verifyQuiescence,
  });

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
    await verifyMigrationIdentity(database.client);
    const shape = await readParityShape(database.client);
    const state = classifyUlcExerciseCatalogPreviewParityShape(shape);
    return deepFreeze({
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

export async function applyUlcExerciseCatalogPreviewParity(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    verifyQuiescence =
      verifyUlcExerciseCatalogPreviewSourceWriteQuiescence,
  } = {},
) {
  if (apply !== true) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity migration requires explicit apply=true.",
    );
  }

  const context = await validatedContext({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot,
    databaseFactory,
    verifyQuiescence,
  });
  const applicationRole = requiredRole(context.credentials.application.user);

  let database;
  let primaryError;
  try {
    database = databaseFactory(migrationDatabaseUrl);
    return await database.client.begin(async (transaction) => {
      await verifyMigrationIdentity(transaction);
      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:exercise-catalog:preview-parity-v3', 0))",
      );

      const beforeShape = await readParityShape(transaction);
      const beforeState =
        classifyUlcExerciseCatalogPreviewParityShape(beforeShape);
      let statementCount = 0;

      if (beforeState === "upgrade-required") {
        for (const statement of context.plan.statements) {
          await transaction.unsafe(statement);
          statementCount += 1;
        }
      }

      const afterShape = await readParityShape(transaction);
      if (
        classifyUlcExerciseCatalogPreviewParityShape(afterShape) !==
        "current"
      ) {
        throw new UlcExerciseCatalogPreviewParityExecutionError(
          "E6H preview parity migration did not reach the complete schema-v3 contract.",
        );
      }

      await reconcileParityTablePrivileges(
        transaction,
        applicationRole,
      );
      const privileges = await verifyParityTablePrivileges(
        transaction,
        applicationRole,
      );

      return deepFreeze({
        state:
          beforeState === "current"
            ? "already-current"
            : "applied",
        application: APP_ID,
        moduleId: MODULE_ID,
        preview: {
          ...context.plan.preview,
          applicationPrincipal: applicationRole,
        },
        target: context.plan.target,
        migrationCount: beforeState === "current" ? 0 : 1,
        statementCount,
        runtimeDmlReady: true,
        privileges,
        productionChanged: false,
      });
    });
  } catch (error) {
    primaryError = error;
    if (
      error instanceof
        UlcExerciseCatalogPreviewParityConfigurationError ||
      error instanceof UlcExerciseCatalogPreviewParityExecutionError
    ) {
      throw error;
    }
    throw new UlcExerciseCatalogPreviewParityExecutionError(
      "E6H preview parity transaction failed and was rolled back.",
    );
  } finally {
    if (database !== undefined) {
      try {
        await database.client.end();
      } catch {
        if (primaryError === undefined) {
          throw new UlcExerciseCatalogPreviewParityExecutionError(
            "E6H preview parity database connection could not be closed cleanly.",
          );
        }
      }
    }
  }
}

export async function verifyUlcExerciseCatalogPreviewParity(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    verifyQuiescence =
      verifyUlcExerciseCatalogPreviewSourceWriteQuiescence,
  } = {},
) {
  const context = await validatedContext({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot,
    databaseFactory,
    verifyQuiescence,
  });
  const applicationRole = requiredRole(context.credentials.application.user);

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
    await verifyMigrationIdentity(database.client);
    const state = classifyUlcExerciseCatalogPreviewParityShape(
      await readParityShape(database.client),
    );
    if (state !== "current") {
      throw new UlcExerciseCatalogPreviewParityExecutionError(
        "E6H preview parity schema-v3 verification requires the current state.",
      );
    }
    const privileges = await verifyParityTablePrivileges(
      database.client,
      applicationRole,
    );
    return deepFreeze({
      state: "verified-current",
      application: APP_ID,
      moduleId: MODULE_ID,
      preview: {
        ...context.plan.preview,
        applicationPrincipal: applicationRole,
      },
      target: context.plan.target,
      runtimeDmlReady: true,
      privileges,
      productionChanged: false,
    });
  } finally {
    if (database !== undefined) {
      await database.client.end().catch(() => {});
    }
  }
}

async function validatedContext({
  migrationDatabaseUrl,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
  repositoryRoot,
  databaseFactory,
  verifyQuiescence,
}) {
  if (
    typeof databaseFactory !== "function" ||
    typeof verifyQuiescence !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity dependencies are unavailable.",
    );
  }

  let credentials;
  try {
    credentials = validateUlcLinzD4PreviewDatabaseCredentials({
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    });
  } catch (error) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity credentials are invalid: " +
        safeMessage(error),
    );
  }
  if (
    credentials.migration.database !== EXPECTED_DATABASE ||
    credentials.migration.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity requires the exact protected preview migration principal.",
    );
  }

  const plan = await loadUlcExerciseCatalogPreviewParityPlan({
    repositoryRoot,
  });
  const quiescence = await verifyQuiescence(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    },
    { repositoryRoot, databaseFactory },
  );
  if (
    quiescence?.state !==
      "preview-source-write-quiescence-verified" ||
    quiescence?.targetRuntimeDmlReady !== true
  ) {
    throw new UlcExerciseCatalogPreviewParityExecutionError(
      "E6H preview parity requires the completed standard-module cutover guard.",
    );
  }

  return Object.freeze({ credentials, plan, quiescence });
}

async function readParityShape(sql) {
  const baselineTables = [];
  for (const table of BASELINE_TABLES) {
    const rows = await sql.unsafe(
      "SELECT to_regclass($1)::text AS relation_name",
      ["public." + table],
    );
    if (rows.length !== 1) {
      throw new UlcExerciseCatalogPreviewParityExecutionError(
        "E6H preview parity baseline inventory is ambiguous.",
      );
    }
    if (rows[0]?.relation_name !== null) baselineTables.push(table);
  }

  const markers = [];
  const markerQueries = [
    [
      "difficulty-column",
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'appbasis_exercise_catalog_item'
           AND column_name = 'difficulty_key'
       ) AS present`,
    ],
    [
      "difficulty-constraint",
      `SELECT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
           AND t.relname = 'appbasis_exercise_catalog_item'
           AND c.conname = 'appbasis_exercise_catalog_item_difficulty_check'
       ) AS present`,
    ],
    ["video-table", "SELECT to_regclass('public.appbasis_exercise_catalog_video') IS NOT NULL AS present"],
    ["video-index", "SELECT to_regclass('public.appbasis_exercise_catalog_video_exercise_idx') IS NOT NULL AS present"],
    ["similarity-table", "SELECT to_regclass('public.appbasis_exercise_catalog_similarity') IS NOT NULL AS present"],
    ["similarity-index", "SELECT to_regclass('public.appbasis_exercise_catalog_similarity_target_idx') IS NOT NULL AS present"],
    ["usage-table", "SELECT to_regclass('public.appbasis_exercise_catalog_usage') IS NOT NULL AS present"],
    ["usage-index", "SELECT to_regclass('public.appbasis_exercise_catalog_usage_exercise_idx') IS NOT NULL AS present"],
    ["private-media-table", "SELECT to_regclass('public.appbasis_exercise_catalog_private_media') IS NOT NULL AS present"],
    ["private-media-storage-index", "SELECT to_regclass('public.appbasis_exercise_catalog_private_media_storage_unique') IS NOT NULL AS present"],
    ["private-media-exercise-index", "SELECT to_regclass('public.appbasis_exercise_catalog_private_media_exercise_idx') IS NOT NULL AS present"],
  ];
  for (const [marker, query] of markerQueries) {
    const rows = await sql.unsafe(query);
    if (rows.length !== 1) {
      throw new UlcExerciseCatalogPreviewParityExecutionError(
        "E6H preview parity marker inventory is ambiguous.",
      );
    }
    if (rows[0]?.present === true) markers.push(marker);
  }

  return Object.freeze({
    baselineTables: Object.freeze(baselineTables),
    parityMarkers: Object.freeze(markers),
  });
}

async function reconcileParityTablePrivileges(sql, applicationRole) {
  const role = quoteIdentifier(applicationRole);
  for (const table of PARITY_TABLES) {
    const relation = quoteIdentifier(table);
    await sql.unsafe(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public." +
        relation +
        " TO " +
        role,
    );
    await sql.unsafe(
      "REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public." +
        relation +
        " FROM " +
        role,
    );
  }
}

async function verifyParityTablePrivileges(sql, applicationRole) {
  const result = [];
  for (const table of PARITY_TABLES) {
    const rows = await sql.unsafe(
      `SELECT
         has_table_privilege($1, $2, 'SELECT') AS can_select,
         has_table_privilege($1, $2, 'INSERT') AS can_insert,
         has_table_privilege($1, $2, 'UPDATE') AS can_update,
         has_table_privilege($1, $2, 'DELETE') AS can_delete,
         has_table_privilege($1, $2, 'TRUNCATE') AS can_truncate,
         has_table_privilege($1, $2, 'REFERENCES') AS can_references,
         has_table_privilege($1, $2, 'TRIGGER') AS can_trigger,
         has_table_privilege($1, $2, 'MAINTAIN') AS can_maintain`,
      [applicationRole, "public." + table],
    );
    const row = rows[0];
    if (
      rows.length !== 1 ||
      row?.can_select !== true ||
      row?.can_insert !== true ||
      row?.can_update !== true ||
      row?.can_delete !== true ||
      row?.can_truncate !== false ||
      row?.can_references !== false ||
      row?.can_trigger !== false ||
      row?.can_maintain !== false
    ) {
      throw new UlcExerciseCatalogPreviewParityExecutionError(
        "E6H preview parity runtime privileges are incomplete for " +
          table +
          ".",
      );
    }
    result.push(
      Object.freeze({
        table,
        select: true,
        insert: true,
        update: true,
        delete: true,
      }),
    );
  }
  return Object.freeze(result);
}

async function verifyMigrationIdentity(sql) {
  const rows = await sql.unsafe(
    "SELECT current_database()::text AS database_name, current_user::text AS principal_name",
  );
  if (
    rows.length !== 1 ||
    rows[0]?.database_name !== EXPECTED_DATABASE ||
    rows[0]?.principal_name !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewParityExecutionError(
      "E6H preview parity connected to an unexpected PostgreSQL identity.",
    );
  }
}

function requiredRole(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity application role is invalid.",
    );
  }
  return value;
}

function quoteIdentifier(value) {
  return '"' + requiredRole(value).replaceAll('"', '""') + '"';
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new UlcExerciseCatalogPreviewParityConfigurationError(
      "E6H preview parity repository contract could not be read.",
    );
  }
}

function safeMessage(error) {
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

async function runCli() {
  const command = process.argv[2];
  const input = {
    migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl:
      process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  };

  if (command === "plan") {
    process.stdout.write(
      JSON.stringify(
        await loadUlcExerciseCatalogPreviewParityPlan(),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (command === "inspect") {
    process.stdout.write(
      JSON.stringify(
        await inspectUlcExerciseCatalogPreviewParity(input),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (command === "apply") {
    process.stdout.write(
      JSON.stringify(
        await applyUlcExerciseCatalogPreviewParity({
          ...input,
          apply:
            process.env
              .APPBASIS_APPLY_EXERCISE_CATALOG_PARITY === "1",
        }),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (command === "verify") {
    process.stdout.write(
      JSON.stringify(
        await verifyUlcExerciseCatalogPreviewParity(input),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  throw new Error("Expected command plan, inspect, apply or verify.");
}

if (
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli().catch((error) => {
    process.stderr.write(safeMessage(error) + "\n");
    process.exitCode = 1;
  });
}

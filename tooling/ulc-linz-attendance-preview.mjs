import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { loadRepositoryOwnerMigrationPlan } from "./database-migration-executor.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const APP_ID = "ulc-linz";
const PREVIEW_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const ATHLETES_OWNER_ID = "athletes";
const LIFECYCLE_OWNER_ID = "ulc-linz-lifecycle";
const ATHLETES_TARGET_MIGRATION =
  "modules/athletes/migrations/0003_appbasis_training_group_attendance_mode.sql";
const LIFECYCLE_TARGET_MIGRATION =
  "apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql";
// The repository is now at lifecycle v10, but the attendance-only
// migration plan must remain pinned to v9 and never apply functionary v10.
const LIFECYCLE_MANIFEST_TAIL_MIGRATION =
  "apps/ulc-linz/migrations/0009_ulc_linz_functionary_role.sql";

const REQUIRED_BASELINE_TABLES = Object.freeze([
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_athlete_contact",
  "ulc_linz_training_session",
  "ulc_linz_training_attendance",
  "ulc_linz_training_module_group",
  "ulc_linz_exercise_catalog_item",
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_plan",
  "appbasis_training_plan_revision",
]);

const TARGET_SHAPE_KEYS = Object.freeze([
  "attendanceModeColumn",
  "attendanceModeConstraint",
  "registrationTable",
  "registrationChangeTable",
  "registrationIndex",
  "registrationChangeIndex",
]);

export class UlcAttendancePreviewConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcAttendancePreviewConfigurationError";
  }
}

export class UlcAttendancePreviewExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcAttendancePreviewExecutionError";
  }
}

export async function loadUlcAttendancePreviewPlan(
  { repositoryRoot = process.cwd() } = {},
  { loadOwnerMigrationPlan = loadRepositoryOwnerMigrationPlan } = {},
) {
  if (typeof loadOwnerMigrationPlan !== "function") {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview migration plan loader is unavailable.",
    );
  }

  const root = resolve(repositoryRoot);
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(
        resolve(root, "apps/ulc-linz/appbasis.database.json"),
        "utf8",
      ),
    );
  } catch {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview database manifest could not be read.",
    );
  }

  if (
    manifest?.manifestVersion !== 1 ||
    manifest?.application !== APP_ID ||
    !Array.isArray(manifest?.owners)
  ) {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview requires the canonical ULC database manifest.",
    );
  }

  const athletesOwner = uniqueOwner(manifest.owners, ATHLETES_OWNER_ID);
  const lifecycleOwner = uniqueOwner(manifest.owners, LIFECYCLE_OWNER_ID);

  assertTargetOwner(
    athletesOwner,
    4,
    ATHLETES_TARGET_MIGRATION,
    "Athletes",
  );
  assertTargetOwner(
    lifecycleOwner,
    10,
    LIFECYCLE_MANIFEST_TAIL_MIGRATION,
    "ULC lifecycle",
  );
  if (lifecycleOwner.migrations.at(-2) !== LIFECYCLE_TARGET_MIGRATION) {
    throw new UlcAttendancePreviewConfigurationError(
      "ULC attendance migration is not the reviewed lifecycle v9 delta.",
    );
  }

  const athletesPlan = await loadOwnerMigrationPlan({
    repositoryRoot: root,
    owner: athletesOwner,
    ConfigurationError: UlcAttendancePreviewConfigurationError,
  });
  const lifecyclePlan = await loadOwnerMigrationPlan({
    repositoryRoot: root,
    owner: lifecycleOwner,
    ConfigurationError: UlcAttendancePreviewConfigurationError,
  });

  const athletesMigration = exactMigration(
    athletesPlan,
    ATHLETES_TARGET_MIGRATION,
    "Athletes attendance-mode",
  );
  const lifecycleMigration = exactMigration(
    lifecyclePlan,
    LIFECYCLE_TARGET_MIGRATION,
    "ULC self-registration",
  );

  return Object.freeze({
    schemaVersion: 1,
    operation: "ulc-attendance-preview",
    application: APP_ID,
    preview: Object.freeze({
      environment: PREVIEW_ENVIRONMENT,
      database: EXPECTED_DATABASE,
      migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
    }),
    baseline: Object.freeze({
      athletesSchemaVersion: 3,
      lifecycleSchemaVersion: 8,
    }),
    target: Object.freeze({
      athletesSchemaVersion: 4,
      lifecycleSchemaVersion: 9,
      migrations: Object.freeze([
        ATHLETES_TARGET_MIGRATION,
        LIFECYCLE_TARGET_MIGRATION,
      ]),
    }),
    migrations: Object.freeze([
      Object.freeze({
        ownerId: ATHLETES_OWNER_ID,
        relativePath: athletesMigration.relativePath,
        statements: Object.freeze([...athletesMigration.statements]),
      }),
      Object.freeze({
        ownerId: LIFECYCLE_OWNER_ID,
        relativePath: lifecycleMigration.relativePath,
        statements: Object.freeze([...lifecycleMigration.statements]),
      }),
    ]),
    productionChanged: false,
  });
}

export function classifyUlcAttendancePreviewShape(shape = {}) {
  if (
    shape === null ||
    typeof shape !== "object" ||
    Array.isArray(shape) ||
    TARGET_SHAPE_KEYS.some((key) => typeof shape[key] !== "boolean")
  ) {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview shape is incomplete.",
    );
  }

  const present = TARGET_SHAPE_KEYS.filter((key) => shape[key] === true).length;
  if (present === 0) return "migration-required";
  if (present === TARGET_SHAPE_KEYS.length) return "current";

  throw new UlcAttendancePreviewExecutionError(
    "Attendance preview schema is partially applied or drifted.",
  );
}

export async function inspectUlcAttendancePreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot = process.cwd(),
  } = {},
  {
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcAttendancePreviewPlan,
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

  if (typeof databaseFactory !== "function") {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview database factory is unavailable.",
    );
  }

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
  } catch {
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview database connection could not be created.",
    );
  }

  let primaryError;
  try {
    await verifyMigrationIdentity(database.client);
    await verifyEstablishedBaseline(database.client);
    const shape = await readAttendanceShape(database.client);
    const state = classifyUlcAttendancePreviewShape(shape);
    return previewResult(state, context.plan);
  } catch (error) {
    primaryError = error;
    if (
      error instanceof UlcAttendancePreviewConfigurationError ||
      error instanceof UlcAttendancePreviewExecutionError
    ) {
      throw error;
    }
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview inspection failed.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcAttendancePreviewExecutionError(
          "Attendance preview database connection could not be closed cleanly.",
        );
      }
    }
  }
}

export async function applyUlcAttendancePreview(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    repositoryRoot = process.cwd(),
    apply = false,
  } = {},
  {
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcAttendancePreviewPlan,
  } = {},
) {
  if (apply !== true) {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview migration requires explicit apply authorization.",
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

  if (typeof databaseFactory !== "function") {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview database factory is unavailable.",
    );
  }

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
  } catch {
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview database connection could not be created.",
    );
  }

  let primaryError;
  let statementCount = 0;
  let migrationCount = 0;
  let resultState = "applied";
  try {
    await database.client.begin(async (transaction) => {
      await verifyMigrationIdentity(transaction);
      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:preview-attendance-upgrade', 0))",
      );
      await verifyEstablishedBaseline(transaction);

      const beforeShape = await readAttendanceShape(transaction);
      const beforeState = classifyUlcAttendancePreviewShape(beforeShape);
      if (beforeState === "current") {
        resultState = "already-current";
        return;
      }

      for (const migration of context.plan.migrations) {
        for (const statement of migration.statements) {
          await transaction.unsafe(statement);
          statementCount += 1;
        }
        migrationCount += 1;
      }

      await verifyEstablishedBaseline(transaction);
      const afterShape = await readAttendanceShape(transaction);
      if (classifyUlcAttendancePreviewShape(afterShape) !== "current") {
        throw new UlcAttendancePreviewExecutionError(
          "Attendance preview migration did not reach the schema-v4/v9 target.",
        );
      }
    });

    return Object.freeze({
      ...previewResult(resultState, context.plan),
      migrationCount,
      statementCount,
    });
  } catch (error) {
    primaryError = error;
    if (
      error instanceof UlcAttendancePreviewConfigurationError ||
      error instanceof UlcAttendancePreviewExecutionError
    ) {
      throw error;
    }
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview migration transaction failed and was rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcAttendancePreviewExecutionError(
          "Attendance preview database connection could not be closed cleanly.",
        );
      }
    }
  }
}

export async function verifyUlcAttendancePreview(input = {}, options = {}) {
  const result = await inspectUlcAttendancePreview(input, options);
  if (result.state !== "current") {
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview schema is not current.",
    );
  }
  return result;
}

export function assertUlcAttendancePreviewEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== APP_ID) {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview requires appId ulc-linz.",
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== EXPECTED_DATABASE) {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview targets the wrong database.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview requires explicit migration approval.",
    );
  }
  if (environment.APPBASIS_APPLY_ATTENDANCE_PREVIEW !== "1") {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview requires explicit attendance approval.",
    );
  }
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
  if (typeof loadPlan !== "function") {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview plan resolver is unavailable.",
    );
  }

  let credentials;
  try {
    credentials = validateUlcLinzD4PreviewDatabaseCredentials({
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    });
  } catch {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview requires the exact isolated preview database credentials.",
    );
  }

  if (
    credentials.migration.database !== EXPECTED_DATABASE ||
    credentials.migration.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcAttendancePreviewConfigurationError(
      "Attendance preview migration credential does not identify the exact isolated preview target.",
    );
  }

  const plan = await loadPlan({ repositoryRoot });
  return Object.freeze({ credentials, plan });
}

function uniqueOwner(owners, ownerId) {
  const matches = owners.filter((owner) => owner?.id === ownerId);
  if (matches.length !== 1) {
    throw new UlcAttendancePreviewConfigurationError(
      `Attendance preview requires exactly one ${ownerId} database owner.`,
    );
  }
  return matches[0];
}

function assertTargetOwner(owner, schemaVersion, targetMigration, label) {
  if (
    owner?.schemaVersion !== schemaVersion ||
    !Array.isArray(owner?.migrations) ||
    owner.migrations.length !== schemaVersion ||
    owner.migrations.at(-1) !== targetMigration
  ) {
    throw new UlcAttendancePreviewConfigurationError(
      `${label} owner is not at the expected attendance target.`,
    );
  }
}

function exactMigration(plan, relativePath, label) {
  const matches = Array.isArray(plan)
    ? plan.filter((entry) => entry?.relativePath === relativePath)
    : [];
  if (
    matches.length !== 1 ||
    !Array.isArray(matches[0]?.statements) ||
    matches[0].statements.length === 0
  ) {
    throw new UlcAttendancePreviewConfigurationError(
      `${label} migration delta is unavailable or ambiguous.`,
    );
  }
  return matches[0];
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
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview database connection does not select the required migration identity.",
    );
  }
}

async function verifyEstablishedBaseline(client) {
  const rows = await client.unsafe(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  if (!Array.isArray(rows)) {
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview table inventory is unavailable.",
    );
  }
  const tables = new Set(
    rows.map((row) => row?.tablename).filter((value) => typeof value === "string"),
  );
  const missing = REQUIRED_BASELINE_TABLES.filter((table) => !tables.has(table));
  if (missing.length > 0) {
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview requires the complete established E7B9 baseline.",
    );
  }
}

async function readAttendanceShape(client) {
  const rows = await client.unsafe(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'appbasis_training_group'
          AND column_name = 'attendance_mode'
      ) AS attendance_mode_column,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = 'appbasis_training_group'
          AND con.conname = 'appbasis_training_group_attendance_mode_check'
      ) AS attendance_mode_constraint,
      to_regclass('public.ulc_linz_training_registration') IS NOT NULL
        AS registration_table,
      to_regclass('public.ulc_linz_training_registration_change') IS NOT NULL
        AS registration_change_table,
      to_regclass('public.ulc_linz_training_registration_org_athlete_idx') IS NOT NULL
        AS registration_index,
      to_regclass('public.ulc_linz_training_registration_change_org_idx') IS NOT NULL
        AS registration_change_index
  `);

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new UlcAttendancePreviewExecutionError(
      "Attendance preview schema shape could not be read.",
    );
  }
  const row = rows[0];
  return Object.freeze({
    attendanceModeColumn: row?.attendance_mode_column === true,
    attendanceModeConstraint: row?.attendance_mode_constraint === true,
    registrationTable: row?.registration_table === true,
    registrationChangeTable: row?.registration_change_table === true,
    registrationIndex: row?.registration_index === true,
    registrationChangeIndex: row?.registration_change_index === true,
  });
}

function previewResult(state, plan) {
  return Object.freeze({
    state,
    application: APP_ID,
    preview: plan.preview,
    target: plan.target,
    productionChanged: false,
  });
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const command = process.argv[2] ?? "plan";
  const input = {
    migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  };

  try {
    if (command === "plan") {
      const plan = await loadUlcAttendancePreviewPlan();
      process.stdout.write(JSON.stringify(plan) + "\n");
    } else if (command === "inspect") {
      process.stdout.write(
        JSON.stringify(await inspectUlcAttendancePreview(input)) + "\n",
      );
    } else if (command === "apply") {
      assertUlcAttendancePreviewEnvironment();
      process.stdout.write(
        JSON.stringify(
          await applyUlcAttendancePreview({
            ...input,
            apply: true,
          }),
        ) + "\n",
      );
    } else if (command === "verify") {
      process.stdout.write(
        JSON.stringify(await verifyUlcAttendancePreview(input)) + "\n",
      );
    } else {
      throw new UlcAttendancePreviewConfigurationError(
        "Attendance preview command must be plan, inspect, apply or verify.",
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Attendance preview operation failed.",
    );
    process.exitCode = 1;
  }
}

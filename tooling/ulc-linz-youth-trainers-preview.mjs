import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const MIGRATION_FILE = "apps/ulc-linz/migrations/0015_ulc_linz_training_trainer_attendance.sql";
const PREVIOUS_MIGRATION = "apps/ulc-linz/migrations/0014_ulc_linz_youth_group_categories.sql";
const TABLE = "ulc_linz_training_trainer_attendance";
const EXPECTED_COLUMNS = Object.freeze([
  "organization_id", "session_id", "trainer_id", "created_at", "updated_at",
]);
const EXPECTED_CONSTRAINTS = Object.freeze([
  "ulc_linz_training_trainer_attendance_pk",
  "ulc_linz_training_trainer_attendance_session_id_fkey",
]);
const EXPECTED_INDEXES = Object.freeze([
  "ulc_linz_training_trainer_attendance_org_session_idx",
]);

export class UlcYouthTrainersPreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcYouthTrainersPreviewError";
  }
}

export async function loadYouthTrainersPreviewPlan({ repositoryRoot = process.cwd() } = {}) {
  const owner = ULC_LINZ_LIFECYCLE_DATABASE_OWNER;
  const manifest = JSON.parse(await readFile(
    resolve(repositoryRoot, "apps/ulc-linz/appbasis.database.json"), "utf8",
  ));
  const matched = manifest?.owners?.filter((entry) => entry?.id === owner.id);
  if (manifest?.application !== "ulc-linz" || manifest?.manifestVersion !== 1 ||
      manifest?.dialect !== "postgresql" || matched?.length !== 1 ||
      JSON.stringify(matched[0]) !== JSON.stringify(owner) ||
      owner.schemaVersion < 16 || owner.migrations[14] !== PREVIOUS_MIGRATION ||
      owner.migrations[15] !== MIGRATION_FILE) {
    throw new UlcYouthTrainersPreviewError("Trainer attendance requires the exact canonical v16 owner.");
  }
  const sql = await readFile(resolve(repositoryRoot, MIGRATION_FILE), "utf8");
  const statements = sql.split("--> statement-breakpoint")
    .map((s) => s.trim()).filter(Boolean);
  if (statements.length !== 2 ||
      !statements[0].includes("CREATE TABLE ulc_linz_training_trainer_attendance") ||
      !statements[0].includes("PRIMARY KEY (session_id, trainer_id)") ||
      !statements[0].includes("REFERENCES ulc_linz_training_session(id) ON DELETE CASCADE") ||
      !/^CREATE INDEX ulc_linz_training_trainer_attendance_org_session_idx\s+ON ulc_linz_training_trainer_attendance\s+\(/.test(statements[1]) ||
      statements.some((statement) =>
        /\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+|ALTER\s+TABLE|GRANT|REVOKE)\b/i.test(statement))) {
    throw new UlcYouthTrainersPreviewError("v16 migration changed from the reviewed additive-only SQL.");
  }
  return Object.freeze({
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    database: DATABASE,
    schemaVersion: 16,
    migrationRole: MIGRATION_ROLE,
    migrationPath: MIGRATION_FILE,
    statements: Object.freeze(statements),
    productionChanged: false,
  });
}

export function classifyYouthTrainersPreview({ tables, columns, constraints, indexes } = {}) {
  if (!Array.isArray(tables) || !Array.isArray(columns) ||
      !Array.isArray(constraints) || !Array.isArray(indexes) ||
      !tables.includes("ulc_linz_youth_group_category") ||
      !indexes.some((x) => x.indexname === "ulc_linz_youth_group_category_active_idx")) {
    throw new UlcYouthTrainersPreviewError("Complete schema-v15 is required before v16.");
  }
  const found = tables.includes(TABLE);
  const relatedColumns = columns.filter((x) => x.table_name === TABLE);
  const relatedConstraints = constraints.filter((x) => EXPECTED_CONSTRAINTS.includes(x.conname));
  const relatedIndexes = indexes.filter((x) => EXPECTED_INDEXES.includes(x.indexname));
  if (!found && relatedColumns.length === 0 &&
      relatedConstraints.length === 0 && relatedIndexes.length === 0) {
    return "migration-required";
  }
  if (!found ||
      !EXPECTED_COLUMNS.every((name) => relatedColumns.some((x) =>
        x.column_name === name && x.is_nullable === "NO")) ||
      !EXPECTED_CONSTRAINTS.every((name) => relatedConstraints.some((x) =>
        x.conname === name && x.convalidated === true)) ||
      !EXPECTED_INDEXES.every((name) => relatedIndexes.some((x) => x.indexname === name)) ||
      !relatedColumns.some((x) => x.column_name === "created_at" &&
        x.data_type === "timestamp with time zone") ||
      !relatedColumns.some((x) => x.column_name === "updated_at" &&
        x.data_type === "timestamp with time zone")) {
    throw new UlcYouthTrainersPreviewError("v16 trainer table is partly installed or drifted.");
  }
  return "current";
}

async function readState(client) {
  const identity = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (identity.length !== 1 || identity[0]?.database_name !== DATABASE ||
      identity[0]?.principal_name !== MIGRATION_ROLE) {
    throw new UlcYouthTrainersPreviewError("v16 migration refuses non-preview DB or principal.");
  }
  const [tables, columns, constraints, indexes] = await Promise.all([
    client.unsafe("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname='public'"),
    client.unsafe(
      "SELECT table_name, column_name, data_type, is_nullable, column_default " +
      "FROM information_schema.columns WHERE table_schema='public' AND " +
      "table_name IN ('ulc_linz_youth_group_category', 'ulc_linz_training_trainer_attendance')",
    ),
    client.unsafe(
      "SELECT conname, convalidated FROM pg_catalog.pg_constraint " +
      "WHERE connamespace='public'::regnamespace AND conname IN " +
      "('ulc_linz_training_trainer_attendance_pk', " +
      "'ulc_linz_training_trainer_attendance_session_id_fkey')",
    ),
    client.unsafe(
      "SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname='public' AND " +
      "tablename IN ('ulc_linz_youth_group_category', 'ulc_linz_training_trainer_attendance')",
    ),
  ]);
  return classifyYouthTrainersPreview({
    tables: tables.map((x) => x.name), columns, constraints, indexes,
  });
}

async function withPreviewDatabase(input, options, task) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (credentials.migration.database !== DATABASE ||
      credentials.migration.user !== MIGRATION_ROLE) {
    throw new UlcYouthTrainersPreviewError("v16 refuses unrelated database credentials.");
  }
  const plan = await loadYouthTrainersPreviewPlan(options);
  const database = (options.databaseFactory ?? createPostgresDatabase)(input.migrationDatabaseUrl);
  try {
    return await task(database.client, plan);
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function inspectYouthTrainersPreview(input, options = {}) {
  return withPreviewDatabase(input, options, async (client, plan) => ({
    state: await readState(client),
    schemaVersion: 16,
    application: plan.application,
    productionChanged: false,
  }));
}

export async function migrateYouthTrainersPreview(input, options = {}) {
  if (input?.apply !== true) {
    throw new UlcYouthTrainersPreviewError("v16 requires explicit apply=true.");
  }
  return withPreviewDatabase(input, options, async (client, plan) => {
    if (typeof client.begin !== "function") {
      throw new UlcYouthTrainersPreviewError("v16 requires an atomic transaction.");
    }
    const state = await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 16)");
      const before = await readState(transaction);
      if (before === "current") return "already-current";
      for (const statement of plan.statements) await transaction.unsafe(statement);
      if ((await readState(transaction)) !== "current") {
        throw new UlcYouthTrainersPreviewError("v16 validation failed; transaction rolls back.");
      }
      return "applied";
    });
    return { state, schemaVersion: 16, productionChanged: false };
  });
}

export async function verifyYouthTrainersPreview(input, options = {}) {
  const result = await inspectYouthTrainersPreview(input, options);
  if (result.state !== "current") {
    throw new UlcYouthTrainersPreviewError("Isolated Preview requires trainer attendance schema v16.");
  }
  return result;
}

function isMainModule() {
  return typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const command = process.argv[2];
    const input = {
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    };
    const result = command === "plan" ? await loadYouthTrainersPreviewPlan()
      : command === "inspect" ? await inspectYouthTrainersPreview(input)
      : command === "verify" ? await verifyYouthTrainersPreview(input)
      : command === "apply" ? await migrateYouthTrainersPreview({
        ...input,
        apply: process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
          process.env.APPBASIS_APPLY_YOUTH_TRAINERS_PREVIEW === "1",
      }) : null;
    if (result === null) throw new UlcYouthTrainersPreviewError(
      "Expected plan, inspect, apply or verify.",
    );
    const { statements: _statements, ...summary } = result;
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    console.error(error instanceof UlcYouthTrainersPreviewError
      ? error.message : "Trainer attendance v16 migration was blocked.");
    process.exitCode = 1;
  }
}

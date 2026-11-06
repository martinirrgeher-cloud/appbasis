import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const APPLICATION = "ulc-linz";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const RELATIVE_MIGRATION = "apps/ulc-linz/migrations/0012_ulc_linz_youth_training_catalog.sql";
const PREVIOUS_MIGRATION = "apps/ulc-linz/migrations/0011_ulc_linz_youth_training_content.sql";
const COLUMN = "training_content_items";
const CONSTRAINT = "ulc_linz_training_content_items_check";

export class UlcYouthContentPreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcYouthContentPreviewError";
  }
}

export async function loadYouthContentPreviewPlan({ repositoryRoot = process.cwd() } = {}) {
  const owner = ULC_LINZ_LIFECYCLE_DATABASE_OWNER;
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "apps/ulc-linz/appbasis.database.json"), "utf8"),
  );
  const matches = manifest?.owners?.filter((item) => item?.id === owner.id);
  if (manifest?.application !== APPLICATION || manifest?.manifestVersion !== 1 ||
      manifest?.dialect !== "postgresql" || matches?.length !== 1 ||
      JSON.stringify(matches[0]) !== JSON.stringify(owner) ||
      !Number.isInteger(owner.schemaVersion) || owner.schemaVersion < 13 ||
      owner.migrations[11] !== PREVIOUS_MIGRATION ||
      owner.migrations[12] !== RELATIVE_MIGRATION) {
    throw new UlcYouthContentPreviewError(
      "Youth-content preview requires the canonical v13 database owner.",
    );
  }

  const sql = await readFile(resolve(repositoryRoot, RELATIVE_MIGRATION), "utf8");
  const statements = sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim()).filter(Boolean);
  if (statements.length !== 2 ||
      !/ALTER TABLE ulc_linz_training_session\s+ADD COLUMN training_content_items jsonb NOT NULL DEFAULT '\[\]'::jsonb;\s*$/.test(statements[0]) ||
      !/^ALTER TABLE ulc_linz_training_session\s+ADD CONSTRAINT ulc_linz_training_content_items_check\s+CHECK\s*\(/.test(statements[1]) ||
      !statements[1].includes("jsonb_array_length(training_content_items) <= 5") ||
      !statements[1].includes("cardinality(training_content_titles)") ||
      statements.some((statement) =>
        /\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+|CREATE\s+TABLE)\b/i.test(statement))) {
    throw new UlcYouthContentPreviewError(
      "Youth-content v13 migration drifted from the reviewed additive contract.",
    );
  }
  return Object.freeze({
    application: APPLICATION,
    database: DATABASE,
    migrationRole: MIGRATION_ROLE,
    environment: "generated-preview-ulc-linz",
    schemaVersion: 13,
    migrationPath: RELATIVE_MIGRATION,
    statements: Object.freeze(statements),
    productionChanged: false,
  });
}

/** Schema classification is strict: an incomplete or modified v13 installation fails closed. */
export function classifyYouthContentPreviewSchema({
  tables, columns, constraints,
} = {}) {
  if (!Array.isArray(tables) || !Array.isArray(columns) || !Array.isArray(constraints) ||
      !["ulc_linz_training_session", "ulc_linz_training_attendance"].every(
        (name) => tables.includes(name)) ||
      !columns.some((row) => row.table_name === "ulc_linz_training_session" &&
        row.column_name === "training_content_titles" &&
        row.data_type === "ARRAY" && row.udt_name === "_text") ||
      !columns.some((row) => row.table_name === "ulc_linz_training_attendance" &&
        row.column_name === "training_content_slots" &&
        row.data_type === "ARRAY" && row.udt_name === "_int2") ||
      !constraints.some((row) => row.table_name === "ulc_linz_training_session" &&
        row.constraint_name === "ulc_linz_training_content_titles_check" &&
        row.convalidated === true) ||
      !constraints.some((row) => row.table_name === "ulc_linz_training_attendance" &&
        row.constraint_name === "ulc_linz_training_content_slots_check" &&
        row.convalidated === true)) {
    throw new UlcYouthContentPreviewError(
      "Youth-content preview requires a complete U12 schema-v12 baseline.",
    );
  }

  const found = columns.find((row) =>
    row.table_name === "ulc_linz_training_session" && row.column_name === COLUMN);
  const check = constraints.find((row) =>
    row.table_name === "ulc_linz_training_session" && row.constraint_name === CONSTRAINT);
  if (found === undefined && check === undefined) return "migration-required";
  if (found === undefined || check === undefined ||
      found.data_type !== "jsonb" || found.udt_name !== "jsonb" ||
      found.is_nullable !== "NO" || found.column_default !== "'[]'::jsonb" ||
      check.convalidated !== true || typeof check.definition !== "string" ||
      !["jsonb_typeof(training_content_items)",
        "jsonb_array_length(training_content_items)",
        "cardinality(training_content_titles)"].every((token) =>
        check.definition.includes(token))) {
    throw new UlcYouthContentPreviewError(
      "Youth-content preview schema-v13 is partially installed or drifted.",
    );
  }
  return "current";
}

async function readState(client) {
  const identity = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (identity.length !== 1 || identity[0]?.database_name !== DATABASE ||
      identity[0]?.principal_name !== MIGRATION_ROLE) {
    throw new UlcYouthContentPreviewError("Youth-content migration refuses non-preview credentials.");
  }
  const [tables, columns, constraints] = await Promise.all([
    client.unsafe("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'"),
    client.unsafe(
      "SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default " +
      "FROM information_schema.columns WHERE table_schema = 'public' AND " +
      "((table_name = 'ulc_linz_training_session' AND " +
      "column_name = ANY(ARRAY['training_content_titles', 'training_content_items'])) OR " +
      "(table_name = 'ulc_linz_training_attendance' AND column_name = 'training_content_slots'))",
    ),
    client.unsafe(
      "SELECT rel.relname AS table_name, con.conname AS constraint_name, con.convalidated, " +
      "pg_catalog.pg_get_constraintdef(con.oid) AS definition " +
      "FROM pg_catalog.pg_constraint AS con " +
      "JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid " +
      "JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace " +
      "WHERE ns.nspname = 'public' AND " +
      "con.conname = ANY(ARRAY['ulc_linz_training_content_items_check', " +
      "'ulc_linz_training_content_titles_check', 'ulc_linz_training_content_slots_check'])",
    ),
  ]);
  return classifyYouthContentPreviewSchema({
    tables: tables.map((row) => row.name), columns, constraints,
  });
}

async function withPreviewDatabase(input, options, fn) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (credentials.migration.database !== DATABASE ||
      credentials.migration.user !== MIGRATION_ROLE) {
    throw new UlcYouthContentPreviewError("Youth-content migration target is not isolated.");
  }
  const plan = await loadYouthContentPreviewPlan(options);
  const database = (options.databaseFactory ?? createPostgresDatabase)(input.migrationDatabaseUrl);
  try {
    return await fn(database.client, plan);
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function inspectYouthContentPreview(input, options = {}) {
  return withPreviewDatabase(input, options, async (client, plan) => ({
    state: await readState(client),
    application: plan.application,
    schemaVersion: plan.schemaVersion,
    environment: plan.environment,
    productionChanged: false,
  }));
}

export async function migrateYouthContentPreview(input, options = {}) {
  if (input?.apply !== true) {
    throw new UlcYouthContentPreviewError(
      "Youth-content migration requires explicit apply=true.",
    );
  }
  return withPreviewDatabase(input, options, async (client, plan) => {
    if (typeof client.begin !== "function") {
      throw new UlcYouthContentPreviewError("Youth-content migration requires a transaction.");
    }
    const state = await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 13)");
      const before = await readState(transaction);
      if (before === "current") return "already-current";
      for (const statement of plan.statements) await transaction.unsafe(statement);
      if ((await readState(transaction)) !== "current") {
        throw new UlcYouthContentPreviewError("Schema-v13 verification failed; rolling back.");
      }
      return "applied";
    });
    return { state, schemaVersion: 13, productionChanged: false };
  });
}

export async function verifyYouthContentPreview(input, options = {}) {
  const result = await inspectYouthContentPreview(input, options);
  if (result.state !== "current") {
    throw new UlcYouthContentPreviewError(
      "Preview requires youth-content schema-v13 before deploying the updated Worker.",
    );
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
    const result = command === "plan" ? await loadYouthContentPreviewPlan()
      : command === "inspect" ? await inspectYouthContentPreview(input)
      : command === "verify" ? await verifyYouthContentPreview(input)
      : command === "apply" ? await migrateYouthContentPreview({
        ...input,
        apply: process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
          process.env.APPBASIS_APPLY_YOUTH_CONTENT_PREVIEW === "1",
      }) : null;
    if (result === null) throw new UlcYouthContentPreviewError(
      "Expected plan, inspect, apply or verify.",
    );
    const { statements: _statements, ...summary } = result;
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    console.error(error instanceof UlcYouthContentPreviewError
      ? error.message : "Youth-content preview migration blocked.");
    process.exitCode = 1;
  }
}

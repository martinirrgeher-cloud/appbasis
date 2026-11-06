import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";

const APPLICATION = "ulc-linz";
const PREVIEW_DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const MIGRATION_PATH = "apps/ulc-linz/migrations/0011_ulc_linz_youth_training_content.sql";
const EXPECTED_COLUMNS = Object.freeze([
  { table: "ulc_linz_training_session", column: "training_content_titles", udt: "_text" },
  { table: "ulc_linz_training_attendance", column: "training_content_slots", udt: "_int2" },
]);
const EXPECTED_CONSTRAINTS = Object.freeze([
  { table: "ulc_linz_training_session", name: "ulc_linz_training_content_titles_check",
    tokens: ["cardinality(training_content_titles)", "array_position(training_content_titles", "char_length("] },
  { table: "ulc_linz_training_attendance", name: "ulc_linz_training_content_slots_check",
    tokens: ["cardinality(training_content_slots)", "array_position(training_content_slots", "status", "present"] },
]);

export class UlcU12PreviewSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcU12PreviewSchemaError";
  }
}

export async function loadU12PreviewSchemaPlan({ repositoryRoot = process.cwd() } = {}) {
  const root = resolve(repositoryRoot);
  const owner = ULC_LINZ_LIFECYCLE_DATABASE_OWNER;
  const manifest = JSON.parse(
    await readFile(resolve(root, "apps/ulc-linz/appbasis.database.json"), "utf8"),
  );
  const matches = manifest?.owners?.filter((item) => item?.id === owner.id);
  if (manifest?.application !== APPLICATION || manifest?.manifestVersion !== 1 ||
      manifest?.dialect !== "postgresql" || matches?.length !== 1 ||
      JSON.stringify(matches[0]) !== JSON.stringify(owner) ||
      !Number.isInteger(owner.schemaVersion) || owner.schemaVersion < 12 ||
      owner.migrations[11] !== MIGRATION_PATH) {
    throw new UlcU12PreviewSchemaError("U12 preview requires the canonical owner containing the original schema-v12 migration.");
  }

  const sql = await readFile(resolve(root, MIGRATION_PATH), "utf8");
  const statements = sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim()).filter(Boolean);
  if (statements.length !== 4 ||
      !/^--[\s\S]*?ALTER TABLE ulc_linz_training_session\s+ADD COLUMN training_content_titles text\[\] NOT NULL DEFAULT ARRAY\[\]::text\[\];$/m.test(statements[0]) ||
      !/^ALTER TABLE ulc_linz_training_session\s+ADD CONSTRAINT ulc_linz_training_content_titles_check\s+CHECK \(/.test(statements[1]) ||
      !/^ALTER TABLE ulc_linz_training_attendance\s+ADD COLUMN training_content_slots smallint\[\] NOT NULL DEFAULT ARRAY\[\]::smallint\[\];$/.test(statements[2]) ||
      !/^ALTER TABLE ulc_linz_training_attendance\s+ADD CONSTRAINT ulc_linz_training_content_slots_check\s+CHECK \(/.test(statements[3]) ||
      statements.some((statement) =>
        /(?:\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\b|\bCREATE\s+TABLE\b)/i.test(statement))) {
    throw new UlcU12PreviewSchemaError("U12 preview migration statements drifted from the reviewed additive contract.");
  }
  return Object.freeze({
    application: APPLICATION,
    environment: "generated-preview-ulc-linz",
    database: PREVIEW_DATABASE,
    migrationRole: MIGRATION_ROLE,
    schemaVersion: 12,
    migrationPath: MIGRATION_PATH,
    statements: Object.freeze(statements),
    productionChanged: false,
  });
}

export function classifyU12PreviewSchema({ tables, columns, constraints } = {}) {
  if (!Array.isArray(tables) || !Array.isArray(columns) || !Array.isArray(constraints) ||
      !["ulc_linz_training_session", "ulc_linz_training_attendance",
         "ulc_linz_training_registration", "ulc_linz_training_registration_change"]
        .every((name) => tables.includes(name)) ||
      !columns.some((entry) => entry.table_name === "ulc_linz_training_registration" &&
        entry.column_name === "note") ||
      !columns.some((entry) => entry.table_name === "ulc_linz_training_registration_change" &&
        entry.column_name === "note")) {
    throw new UlcU12PreviewSchemaError("U12 preview does not have the reviewed v11 training baseline.");
  }

  const foundColumns = EXPECTED_COLUMNS.map((expected) =>
    columns.find((row) => row.table_name === expected.table &&
      row.column_name === expected.column));
  const foundConstraints = EXPECTED_CONSTRAINTS.map((expected) =>
    constraints.find((row) => row.table_name === expected.table &&
      row.constraint_name === expected.name));

  if (foundColumns.every((column) => column === undefined) &&
      foundConstraints.every((constraint) => constraint === undefined)) {
    return "migration-required";
  }
  if (foundColumns.some((column) => column === undefined) ||
      foundConstraints.some((constraint) => constraint === undefined)) {
    throw new UlcU12PreviewSchemaError("U12 preview schema v12 is partially applied.");
  }
  for (let index = 0; index < EXPECTED_COLUMNS.length; index += 1) {
    const column = foundColumns[index];
    const expectedType = EXPECTED_COLUMNS[index].udt === "_text" ? "text" : "smallint";
    const allowedDefaults = [
      "ARRAY[]::" + expectedType + "[]",
      "'{}'::" + expectedType + "[]",
    ];
    if (column.udt_name !== EXPECTED_COLUMNS[index].udt ||
        column.data_type !== "ARRAY" || column.is_nullable !== "NO" ||
        !allowedDefaults.includes(column.column_default)) {
      throw new UlcU12PreviewSchemaError("U12 preview content column definition drifted.");
    }
  }
  for (let index = 0; index < EXPECTED_CONSTRAINTS.length; index += 1) {
    const constraint = foundConstraints[index];
    const expected = EXPECTED_CONSTRAINTS[index];
    if (typeof constraint.definition !== "string" ||
        expected.tokens.some((token) => !constraint.definition.includes(token))) {
      throw new UlcU12PreviewSchemaError("U12 preview training constraint drifted.");
    }
  }
  return "current";
}

async function queryState(client) {
  const identity = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (identity.length !== 1 || identity[0]?.database_name !== PREVIEW_DATABASE ||
      identity[0]?.principal_name !== MIGRATION_ROLE) {
    throw new UlcU12PreviewSchemaError("U12 preview refuses a non-preview database or role.");
  }
  const [tables, columns, constraints] = await Promise.all([
    client.unsafe("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'"),
    client.unsafe(
      "SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default " +
      "FROM information_schema.columns WHERE table_schema = 'public' AND " +
      "table_name = ANY($1::text[])",
      [["ulc_linz_training_session", "ulc_linz_training_attendance",
        "ulc_linz_training_registration", "ulc_linz_training_registration_change"]],
    ),
    client.unsafe(
      "SELECT rel.relname AS table_name, con.conname AS constraint_name, " +
      "pg_catalog.pg_get_constraintdef(con.oid) AS definition " +
      "FROM pg_catalog.pg_constraint AS con " +
      "JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid " +
      "JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace " +
      "WHERE ns.nspname = 'public' AND con.conname = ANY($1::text[])",
      [EXPECTED_CONSTRAINTS.map((item) => item.name)],
    ),
  ]);
  return classifyU12PreviewSchema({
    tables: tables.map((table) => table.name),
    columns, constraints,
  });
}

async function withPreviewDatabase(input, options, fn) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (credentials.migration.database !== PREVIEW_DATABASE ||
      credentials.migration.user !== MIGRATION_ROLE) {
    throw new UlcU12PreviewSchemaError("U12 preview target is not isolated or role-scoped.");
  }
  const plan = await loadU12PreviewSchemaPlan(options);
  const database = (options.databaseFactory ?? createPostgresDatabase)(input.migrationDatabaseUrl);
  try {
    return await fn(database.client, plan);
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function inspectU12PreviewSchema(input, options = {}) {
  return withPreviewDatabase(input, options, async (client, plan) => ({
    state: await queryState(client),
    application: plan.application,
    environment: plan.environment,
    schemaVersion: plan.schemaVersion,
    productionChanged: false,
  }));
}

export async function migrateU12PreviewSchema(input, options = {}) {
  if (input?.apply !== true) {
    throw new UlcU12PreviewSchemaError("U12 preview migration requires explicit apply=true.");
  }
  return withPreviewDatabase(input, options, async (client, plan) => {
    if (typeof client.begin !== "function") {
      throw new UlcU12PreviewSchemaError("U12 preview requires an atomic migration transaction.");
    }
    const state = await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 12)");
      const before = await queryState(transaction);
      if (before === "current") return "already-current";
      for (const statement of plan.statements) {
        await transaction.unsafe(statement);
      }
      if ((await queryState(transaction)) !== "current") {
        throw new UlcU12PreviewSchemaError("U12 preview migration verification failed; rolling back.");
      }
      return "applied";
    });
    return { state, application: plan.application, schemaVersion: 12, productionChanged: false };
  });
}

export async function verifyU12PreviewSchema(input, options = {}) {
  const result = await inspectU12PreviewSchema(input, options);
  if (result.state !== "current") {
    throw new UlcU12PreviewSchemaError("U12 preview requires schema v12 before deployment.");
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
    const result = command === "plan"
      ? await loadU12PreviewSchemaPlan()
      : command === "inspect"
        ? await inspectU12PreviewSchema(input)
        : command === "verify"
          ? await verifyU12PreviewSchema(input)
          : command === "apply"
            ? await migrateU12PreviewSchema({
                ...input,
                apply: process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
                  process.env.APPBASIS_APPLY_U12_PREVIEW === "1",
              })
            : null;
    if (result === null) throw new UlcU12PreviewSchemaError("Expected plan, inspect, apply or verify.");
    const { statements: _privateStatements, ...summary } = result;
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "U12 preview migration blocked.");
    process.exitCode = 1;
  }
}

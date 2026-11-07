import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const MIGRATION_FILE = "apps/ulc-linz/migrations/0014_ulc_linz_youth_group_categories.sql";
const PREVIOUS_MIGRATION = "apps/ulc-linz/migrations/0013_ulc_linz_youth_categories.sql";
const TABLE = "ulc_linz_youth_group_category";
const EXPECTED_COLUMNS = Object.freeze([
  "organization_id", "training_area", "code", "label", "is_active", "revision",
  "created_at", "updated_at",
]);
const EXPECTED_CONSTRAINTS = Object.freeze([
  "ulc_linz_youth_group_category_pk",
  "ulc_linz_youth_group_category_area_check",
  "ulc_linz_youth_group_category_code_check",
  "ulc_linz_youth_group_category_label_check",
  "ulc_linz_youth_group_category_revision_check",
]);
const EXPECTED_INDEXES = Object.freeze([
  "ulc_linz_youth_group_category_name_unique",
  "ulc_linz_youth_group_category_active_idx",
]);

export class UlcYouthAreasPreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcYouthAreasPreviewError";
  }
}

export async function loadYouthAreasPreviewPlan({ repositoryRoot = process.cwd() } = {}) {
  const owner = ULC_LINZ_LIFECYCLE_DATABASE_OWNER;
  const manifest = JSON.parse(await readFile(
    resolve(repositoryRoot, "apps/ulc-linz/appbasis.database.json"), "utf8",
  ));
  const matched = manifest?.owners?.filter((entry) => entry?.id === owner.id);
  if (manifest?.application !== "ulc-linz" || manifest?.manifestVersion !== 1 ||
      manifest?.dialect !== "postgresql" || matched?.length !== 1 ||
      JSON.stringify(matched[0]) !== JSON.stringify(owner) ||
      owner.schemaVersion < 15 || owner.migrations[13] !== PREVIOUS_MIGRATION ||
      owner.migrations[14] !== MIGRATION_FILE) {
    throw new UlcYouthAreasPreviewError("Area categories require the exact canonical v15 owner.");
  }
  const sql = await readFile(resolve(repositoryRoot, MIGRATION_FILE), "utf8");
  const statements = sql.split("--> statement-breakpoint")
    .map((s) => s.trim()).filter(Boolean);
  if (statements.length !== 3 ||
      !/CREATE TABLE ulc_linz_youth_group_category\s*\(/.test(statements[0]) ||
      !statements[0].includes("PRIMARY KEY (organization_id, training_area, code)") ||
      !statements[0].includes("training_area IN ('u14', 'kindertraining')") ||
      !/^CREATE UNIQUE INDEX ulc_linz_youth_group_category_name_unique\s+ON ulc_linz_youth_group_category\s*\(/.test(statements[1]) ||
      !/^CREATE INDEX ulc_linz_youth_group_category_active_idx\s+ON ulc_linz_youth_group_category\s*\(/.test(statements[2]) ||
      statements.some((statement) =>
        /\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+|ALTER\s+TABLE|GRANT|REVOKE)\b/i.test(statement))) {
    throw new UlcYouthAreasPreviewError("v15 migration changed from the reviewed additive-only SQL.");
  }
  return Object.freeze({
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    database: DATABASE,
    schemaVersion: 15,
    migrationRole: MIGRATION_ROLE,
    migrationPath: MIGRATION_FILE,
    statements: Object.freeze(statements),
    productionChanged: false,
  });
}

export function classifyYouthAreasPreview({ tables, columns, constraints, indexes } = {}) {
  if (!Array.isArray(tables) || !Array.isArray(columns) ||
      !Array.isArray(constraints) || !Array.isArray(indexes) ||
      !tables.includes("ulc_linz_youth_content_category") ||
      !columns.some((x) => x.table_name === "ulc_linz_youth_content_category" &&
        x.column_name === "revision" && x.is_nullable === "NO") ||
      !indexes.some((x) => x.indexname === "ulc_linz_youth_category_name_unique")) {
    throw new UlcYouthAreasPreviewError("Complete U12 schema-v14 is required before v15.");
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
      !relatedColumns.some((x) => x.column_name === "is_active" &&
        x.data_type === "boolean" && x.column_default === "true") ||
      !relatedColumns.some((x) => x.column_name === "revision" &&
        x.data_type === "integer" && x.column_default === "1") ||
      !relatedColumns.some((x) => x.column_name === "training_area" &&
        x.data_type === "text")) {
    throw new UlcYouthAreasPreviewError("v15 category table is partly installed or drifted.");
  }
  return "current";
}

async function readState(client) {
  const identity = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (identity.length !== 1 || identity[0]?.database_name !== DATABASE ||
      identity[0]?.principal_name !== MIGRATION_ROLE) {
    throw new UlcYouthAreasPreviewError("v15 migration refuses non-preview DB or principal.");
  }
  const [tables, columns, constraints, indexes] = await Promise.all([
    client.unsafe("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname='public'"),
    client.unsafe(
      "SELECT table_name, column_name, data_type, is_nullable, column_default " +
      "FROM information_schema.columns WHERE table_schema='public' AND " +
      "table_name IN ('ulc_linz_youth_content_category', 'ulc_linz_youth_group_category')",
    ),
    client.unsafe(
      "SELECT conname, convalidated FROM pg_catalog.pg_constraint " +
      "WHERE connamespace='public'::regnamespace AND conname IN " +
      "('ulc_linz_youth_group_category_pk', 'ulc_linz_youth_group_category_area_check', " +
      "'ulc_linz_youth_group_category_code_check', 'ulc_linz_youth_group_category_label_check', " +
      "'ulc_linz_youth_group_category_revision_check')",
    ),
    client.unsafe(
      "SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname='public' AND " +
      "tablename IN ('ulc_linz_youth_content_category', 'ulc_linz_youth_group_category')",
    ),
  ]);
  return classifyYouthAreasPreview({
    tables: tables.map((x) => x.name), columns, constraints, indexes,
  });
}

async function withPreviewDatabase(input, options, task) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (credentials.migration.database !== DATABASE ||
      credentials.migration.user !== MIGRATION_ROLE) {
    throw new UlcYouthAreasPreviewError("v15 refuses unrelated database credentials.");
  }
  const plan = await loadYouthAreasPreviewPlan(options);
  const database = (options.databaseFactory ?? createPostgresDatabase)(input.migrationDatabaseUrl);
  try {
    return await task(database.client, plan);
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function inspectYouthAreasPreview(input, options = {}) {
  return withPreviewDatabase(input, options, async (client, plan) => ({
    state: await readState(client),
    schemaVersion: 15,
    application: plan.application,
    productionChanged: false,
  }));
}

export async function migrateYouthAreasPreview(input, options = {}) {
  if (input?.apply !== true) {
    throw new UlcYouthAreasPreviewError("v15 requires explicit apply=true.");
  }
  return withPreviewDatabase(input, options, async (client, plan) => {
    if (typeof client.begin !== "function") {
      throw new UlcYouthAreasPreviewError("v15 requires an atomic transaction.");
    }
    const state = await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 15)");
      const before = await readState(transaction);
      if (before === "current") return "already-current";
      for (const statement of plan.statements) await transaction.unsafe(statement);
      if ((await readState(transaction)) !== "current") {
        throw new UlcYouthAreasPreviewError("v15 validation failed; transaction rolls back.");
      }
      return "applied";
    });
    return { state, schemaVersion: 15, productionChanged: false };
  });
}

export async function verifyYouthAreasPreview(input, options = {}) {
  const result = await inspectYouthAreasPreview(input, options);
  if (result.state !== "current") {
    throw new UlcYouthAreasPreviewError("Isolated Preview requires group category schema v15.");
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
    const result = command === "plan" ? await loadYouthAreasPreviewPlan()
      : command === "inspect" ? await inspectYouthAreasPreview(input)
      : command === "verify" ? await verifyYouthAreasPreview(input)
      : command === "apply" ? await migrateYouthAreasPreview({
        ...input,
        apply: process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
          process.env.APPBASIS_APPLY_YOUTH_AREAS_PREVIEW === "1",
      }) : null;
    if (result === null) throw new UlcYouthAreasPreviewError(
      "Expected plan, inspect, apply or verify.",
    );
    const { statements: _statements, ...summary } = result;
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    console.error(error instanceof UlcYouthAreasPreviewError
      ? error.message : "Group-categories v15 migration was blocked.");
    process.exitCode = 1;
  }
}

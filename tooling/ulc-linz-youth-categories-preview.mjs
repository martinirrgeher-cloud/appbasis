import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const PREVIEW_DB = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const MIGRATION_FILE = "apps/ulc-linz/migrations/0013_ulc_linz_youth_categories.sql";
const CATEGORY_TABLE = "ulc_linz_youth_content_category";
const EXPECTED_COLUMNS = Object.freeze([
  "organization_id", "code", "label", "is_active", "revision", "created_at", "updated_at",
]);
const EXPECTED_CONSTRAINTS = Object.freeze([
  "ulc_linz_youth_category_pk",
  "ulc_linz_youth_category_code_check",
  "ulc_linz_youth_category_label_check",
  "ulc_linz_youth_category_revision_check",
]);
const EXPECTED_INDEXES = Object.freeze([
  "ulc_linz_youth_category_name_unique",
  "ulc_linz_youth_category_active_idx",
]);

export class UlcYouthCategoriesPreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcYouthCategoriesPreviewError";
  }
}

export async function loadYouthCategoriesPreviewPlan({ repositoryRoot = process.cwd() } = {}) {
  const owner = ULC_LINZ_LIFECYCLE_DATABASE_OWNER;
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "apps/ulc-linz/appbasis.database.json"), "utf8"),
  );
  const matches = manifest?.owners?.filter((x) => x?.id === owner.id);
  if (manifest?.application !== "ulc-linz" ||
      manifest?.manifestVersion !== 1 ||
      manifest?.dialect !== "postgresql" ||
      matches?.length !== 1 ||
      JSON.stringify(matches[0]) !== JSON.stringify(owner) ||
      owner.schemaVersion !== 14 || owner.migrations[13] !== MIGRATION_FILE) {
    throw new UlcYouthCategoriesPreviewError(
      "Shared-category preview requires exact canonical v14 owner.",
    );
  }
  const sql = await readFile(resolve(repositoryRoot, MIGRATION_FILE), "utf8");
  const statements = sql.split("--> statement-breakpoint")
    .map((s) => s.trim()).filter(Boolean);
  if (statements.length !== 3 ||
      !/CREATE TABLE ulc_linz_youth_content_category\s*\(/.test(statements[0]) ||
      !statements[0].includes("PRIMARY KEY (organization_id, code)") ||
      !statements[0].includes("is_active boolean NOT NULL DEFAULT true") ||
      !statements[0].includes("revision integer NOT NULL DEFAULT 1") ||
      !/^CREATE UNIQUE INDEX ulc_linz_youth_category_name_unique\s+ON ulc_linz_youth_content_category\s*\(/.test(statements[1]) ||
      !/^CREATE INDEX ulc_linz_youth_category_active_idx\s+ON ulc_linz_youth_content_category\s*\(/.test(statements[2]) ||
      statements.some((statement) =>
        /\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+|ALTER\s+TABLE|GRANT|REVOKE)\b/i.test(statement))) {
    throw new UlcYouthCategoriesPreviewError(
      "Shared-category preview v14 migration drifted from reviewed DDL.",
    );
  }
  return Object.freeze({
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    database: PREVIEW_DB,
    schemaVersion: 14,
    migrationRole: MIGRATION_ROLE,
    migrationPath: MIGRATION_FILE,
    statements: Object.freeze(statements),
    productionChanged: false,
  });
}

export function classifyYouthCategoriesPreview({ tables, columns, constraints, indexes } = {}) {
  if (!Array.isArray(tables) || !Array.isArray(columns) ||
      !Array.isArray(constraints) || !Array.isArray(indexes) ||
      !tables.includes("ulc_linz_training_session") ||
      !columns.some((x) => x.table_name === "ulc_linz_training_session" &&
        x.column_name === "training_content_items" &&
        x.data_type === "jsonb" && x.is_nullable === "NO") ||
      !constraints.some((x) => x.conname === "ulc_linz_training_content_items_check" &&
        x.convalidated === true)) {
    throw new UlcYouthCategoriesPreviewError("Schema-v13 prerequisite not fully installed.");
  }
  const hasTable = tables.includes(CATEGORY_TABLE);
  const relatedColumns = columns.filter((c) => c.table_name === CATEGORY_TABLE);
  const relatedConstraints = constraints.filter((c) => EXPECTED_CONSTRAINTS.includes(c.conname));
  const relatedIndexes = indexes.filter((x) => EXPECTED_INDEXES.includes(x.indexname));
  if (!hasTable && relatedColumns.length === 0 &&
      relatedConstraints.length === 0 && relatedIndexes.length === 0) {
    return "migration-required";
  }
  if (!hasTable ||
      !EXPECTED_COLUMNS.every((name) => relatedColumns.some((c) => c.column_name === name &&
        c.is_nullable === "NO")) ||
      !EXPECTED_CONSTRAINTS.every((name) => relatedConstraints.some((c) =>
        c.conname === name && c.convalidated === true)) ||
      !EXPECTED_INDEXES.every((name) => relatedIndexes.some((x) => x.indexname === name)) ||
      !relatedColumns.some((c) => c.column_name === "is_active" &&
        c.data_type === "boolean" && c.column_default === "true") ||
      !relatedColumns.some((c) => c.column_name === "revision" &&
        c.data_type === "integer" && c.column_default === "1")) {
    throw new UlcYouthCategoriesPreviewError("Schema-v14 is partially installed or drifted.");
  }
  return "current";
}

async function queryState(client) {
  const identity = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (identity.length !== 1 || identity[0]?.database_name !== PREVIEW_DB ||
      identity[0]?.principal_name !== MIGRATION_ROLE) {
    throw new UlcYouthCategoriesPreviewError("Migration refuses non-preview DB or role.");
  }
  const [tables, columns, constraints, indexes] = await Promise.all([
    client.unsafe("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname='public'"),
    client.unsafe(
      "SELECT table_name, column_name, data_type, is_nullable, column_default " +
      "FROM information_schema.columns WHERE table_schema='public' AND " +
      "table_name IN ('ulc_linz_training_session', 'ulc_linz_youth_content_category')",
    ),
    client.unsafe(
      "SELECT conname, convalidated FROM pg_catalog.pg_constraint " +
      "WHERE connamespace='public'::regnamespace AND conname IN " +
      "('ulc_linz_training_content_items_check', " +
      "'ulc_linz_youth_category_pk', 'ulc_linz_youth_category_code_check', " +
      "'ulc_linz_youth_category_label_check', 'ulc_linz_youth_category_revision_check')",
    ),
    client.unsafe(
      "SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname='public' " +
      "AND tablename='ulc_linz_youth_content_category'",
    ),
  ]);
  return classifyYouthCategoriesPreview({
    tables: tables.map((x) => x.name), columns, constraints, indexes,
  });
}

async function withPreviewDatabase(input, options, task) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (credentials.migration.database !== PREVIEW_DB ||
      credentials.migration.user !== MIGRATION_ROLE) {
    throw new UlcYouthCategoriesPreviewError("Untrusted preview database credentials.");
  }
  const plan = await loadYouthCategoriesPreviewPlan(options);
  const database = (options.databaseFactory ?? createPostgresDatabase)(input.migrationDatabaseUrl);
  try {
    return await task(database.client, plan);
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function inspectYouthCategoriesPreview(input, options = {}) {
  return withPreviewDatabase(input, options, async (client, plan) => ({
    state: await queryState(client), schemaVersion: plan.schemaVersion,
    application: plan.application, productionChanged: false,
  }));
}

export async function migrateYouthCategoriesPreview(input, options = {}) {
  if (input?.apply !== true) {
    throw new UlcYouthCategoriesPreviewError("v14 requires explicit apply=true.");
  }
  return withPreviewDatabase(input, options, async (client, plan) => {
    if (typeof client.begin !== "function") {
      throw new UlcYouthCategoriesPreviewError("v14 requires a transaction.");
    }
    const state = await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 14)");
      const before = await queryState(transaction);
      if (before === "current") return "already-current";
      for (const statement of plan.statements) await transaction.unsafe(statement);
      if ((await queryState(transaction)) !== "current") {
        throw new UlcYouthCategoriesPreviewError("v14 verification failed; rolling back.");
      }
      return "applied";
    });
    return { state, schemaVersion: 14, productionChanged: false };
  });
}

export async function verifyYouthCategoriesPreview(input, options = {}) {
  const result = await inspectYouthCategoriesPreview(input, options);
  if (result.state !== "current") {
    throw new UlcYouthCategoriesPreviewError("Shared-category schema v14 is required.");
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
    const result = command === "plan" ? await loadYouthCategoriesPreviewPlan()
      : command === "inspect" ? await inspectYouthCategoriesPreview(input)
      : command === "verify" ? await verifyYouthCategoriesPreview(input)
      : command === "apply" ? await migrateYouthCategoriesPreview({
        ...input,
        apply: process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
          process.env.APPBASIS_APPLY_YOUTH_CATEGORIES_PREVIEW === "1",
      }) : null;
    if (result === null) throw new UlcYouthCategoriesPreviewError(
      "Expected plan, inspect, apply or verify.",
    );
    const { statements: _statements, ...summary } = result;
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    console.error(error instanceof UlcYouthCategoriesPreviewError
      ? error.message : "Shared-category preview migration blocked.");
    process.exitCode = 1;
  }
}

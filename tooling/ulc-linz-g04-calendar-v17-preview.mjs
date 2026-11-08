import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } from "./ulc-linz-database-contract.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";
import { verifyG04V17ActivationReadiness } from "./ulc-linz-g04-v17-activation-readiness.mjs";

const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_ROLE = "appbasis_ulc_linz_preview_migration";
const FILE = "apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql";
const PRIOR = "apps/ulc-linz/migrations/0015_ulc_linz_training_trainer_attendance.sql";
const RULE = "ulc_linz_registration_calendar_rule";
const EXCEPTION = "ulc_linz_registration_calendar_exception";
const FUNCTION = "ulc_linz_registration_calendar_guard";
const TRIGGER = "ulc_linz_registration_calendar_guard_trg";
const PRIMARY_KEYS = Object.freeze({
  [RULE]: Object.freeze(["organization_id", "group_id"]),
  [EXCEPTION]: Object.freeze(["organization_id", "group_id", "session_date"]),
});
const COLUMNS = Object.freeze({
  [RULE]: Object.freeze([
    "organization_id", "group_id", "weekdays_mask", "weeks_ahead",
    "deadline_days_before", "deadline_local_time", "late_mode",
    "revision", "updated_at",
  ]),
  [EXCEPTION]: Object.freeze([
    "organization_id", "group_id", "session_date", "kind",
    "revision", "updated_at",
  ]),
});

export class UlcG04CalendarPreviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcG04CalendarPreviewError";
  }
}

function refuse(message) {
  throw new UlcG04CalendarPreviewError(message);
}

export async function loadG04CalendarPreviewPlan({ repositoryRoot = process.cwd() } = {}) {
  const owner = ULC_LINZ_LIFECYCLE_DATABASE_OWNER;
  const manifest = JSON.parse(await readFile(resolve(
    repositoryRoot, "apps/ulc-linz/appbasis.database.json",
  ), "utf8"));
  const matches = manifest?.owners?.filter((entry) => entry.id === owner.id);
  if (manifest.application !== "ulc-linz" ||
      manifest.manifestVersion !== 1 ||
      manifest.dialect !== "postgresql" ||
      matches?.length !== 1 ||
      JSON.stringify(matches[0]) !== JSON.stringify(owner) ||
      owner.schemaVersion !== 16 ||
      owner.migrations.length !== 16 ||
      owner.migrations[15] !== PRIOR ||
      manifest.owners.flatMap((entry) => entry.migrations).includes(FILE)) {
    refuse("G-04 requires unchanged canonical schema v16; no automatic v17 promotion.");
  }
  const sql = await readFile(resolve(repositoryRoot, FILE), "utf8");
  const statements = sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim()).filter(Boolean);
  const lifecycleForeignKey =
    /group_id\\s+text\\s+NOT NULL\\s+REFERENCES\\s+appbasis_training_group\\(id\\)\\s+ON DELETE CASCADE/i;
  if (statements.length !== 5 ||
      !statements[0].includes("CREATE TABLE " + RULE + " (") ||
      !statements[1].includes("CREATE TABLE " + EXCEPTION + " (") ||
      !lifecycleForeignKey.test(statements[0]) ||
      !lifecycleForeignKey.test(statements[1]) ||
      !statements[2].includes("CREATE FUNCTION " + FUNCTION + "()") ||
      !statements[2].includes("RAISE EXCEPTION 'Training day cancelled'") ||
      !statements[2].includes("ERRCODE = 'UL024'") ||
      !statements[3].includes("REVOKE ALL ON FUNCTION " + FUNCTION + "() FROM PUBLIC") ||
      !statements[4].includes("CREATE TRIGGER " + TRIGGER) ||
      !statements[4].includes("BEFORE INSERT OR UPDATE ON ulc_linz_training_registration") ||
      statements.some((statement) => /\b(?:DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE|GRANT\s+ALL)\b/i.test(statement))) {
    refuse("G-04 candidate migration changed from expected additive schema and guard.");
  }
  return Object.freeze({
    environment: "generated-preview-ulc-linz",
    database: DATABASE,
    migrationRole: MIGRATION_ROLE,
    schemaVersion: 17,
    migrationPath: FILE,
    statements: Object.freeze(statements),
    productionChanged: false,
  });
}

export function classifyG04CalendarPreview(state) {
  const { tables, columns, constraints, triggers, functions } = state ?? {};
  if (![tables, columns, constraints, triggers, functions].every(Array.isArray)) {
    refuse("G-04 schema inventory is missing.");
  }
  if (!["ulc_linz_training_trainer_attendance",
    "ulc_linz_training_registration", "ulc_linz_training_session"
  ].every((table) => tables.includes(table))) {
    refuse("Complete v16 training schema is required before G-04 v17.");
  }
  const ruleExists = tables.includes(RULE);
  const exceptionExists = tables.includes(EXCEPTION);
  const ownedColumns = columns.filter((c) => Object.hasOwn(COLUMNS, c.table_name));
  const ownedConstraints = constraints.filter((c) =>
    c.table_name === RULE || c.table_name === EXCEPTION);
  const ownedTriggers = triggers.filter((t) => t.tgname === TRIGGER);
  const ownedFunctions = functions.filter((f) => f.proname === FUNCTION);
  if (!ruleExists && !exceptionExists && !ownedColumns.length &&
      !ownedConstraints.length && !ownedTriggers.length && !ownedFunctions.length) {
    return "migration-required";
  }
  const expected = Object.keys(COLUMNS);
  if (!expected.every((table) => tables.includes(table)) ||
      !expected.every((table) =>
        COLUMNS[table].every((name) => ownedColumns.some((column) =>
          column.table_name === table && column.column_name === name))) ||
      !expected.every((table) => ownedConstraints.filter((constraint) =>
        constraint.table_name === table && constraint.contype === "p" &&
        constraint.convalidated === true &&
        Array.isArray(constraint.key_columns) &&
        constraint.key_columns.length === PRIMARY_KEYS[table].length &&
        PRIMARY_KEYS[table].every((name, index) =>
          constraint.key_columns[index] === name)).length === 1) ||
      // A soft-inactive group is retained. Only a successful *physical*
      // group deletion should cascade to both configuration tables.
      !expected.every((table) => {
        const foreignKeys = ownedConstraints.filter((constraint) =>
          constraint.table_name === table && constraint.contype === "f");
        return foreignKeys.length === 1 &&
          foreignKeys[0].convalidated === true &&
          foreignKeys[0].confdeltype === "c" &&
          foreignKeys[0].foreign_table === "appbasis_training_group" &&
          foreignKeys[0].foreign_schema === "public" &&
          Array.isArray(foreignKeys[0].key_columns) &&
          foreignKeys[0].key_columns.length === 1 &&
          foreignKeys[0].key_columns[0] === "group_id" &&
          Array.isArray(foreignKeys[0].referenced_columns) &&
          foreignKeys[0].referenced_columns.length === 1 &&
          foreignKeys[0].referenced_columns[0] === "id";
      }) ||
      ownedTriggers.length !== 1 ||
      ownedTriggers[0].tgenabled !== "O" ||
      ownedTriggers[0].table_name !== "ulc_linz_training_registration" ||
      ownedTriggers[0].function_name !== FUNCTION ||
      ownedFunctions.length !== 1 ||
      ownedFunctions[0].schema_name !== "public") {
    refuse("G-04 schema is partial, unvalidated, or drifted.");
  }
  return "current";
}

export async function readG04CalendarPreviewState(client) {
  const principal = await client.unsafe(
    "SELECT current_database() AS database_name, current_user AS principal_name",
  );
  if (principal.length !== 1 || principal[0].database_name !== DATABASE ||
      principal[0].principal_name !== MIGRATION_ROLE) {
    refuse("G-04 refuses non-preview database or non-migration principal.");
  }
  const [tables, columns, constraints, triggers, functions] = await Promise.all([
    client.unsafe("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'"),
    client.unsafe(`SELECT table_name, column_name, is_nullable, data_type
      FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name IN ('${RULE}', '${EXCEPTION}')`),
    client.unsafe(`SELECT cl.relname AS table_name, co.contype, co.convalidated,
        co.confdeltype, foreign_cl.relname AS foreign_table,
        foreign_ns.nspname AS foreign_schema,
        ARRAY(
          SELECT att.attname::text
          FROM pg_catalog.unnest(co.conkey) WITH ORDINALITY AS key(attnum, pos)
          JOIN pg_catalog.pg_attribute att
            ON att.attrelid = cl.oid AND att.attnum = key.attnum
          ORDER BY key.pos
        ) AS key_columns,
        ARRAY(
          SELECT att.attname::text
          FROM pg_catalog.unnest(co.confkey) WITH ORDINALITY AS key(attnum, pos)
          JOIN pg_catalog.pg_attribute att
            ON att.attrelid = foreign_cl.oid AND att.attnum = key.attnum
          ORDER BY key.pos
        ) AS referenced_columns
      FROM pg_catalog.pg_constraint co
      JOIN pg_catalog.pg_class cl ON co.conrelid = cl.oid
      JOIN pg_catalog.pg_namespace ns ON cl.relnamespace = ns.oid
      LEFT JOIN pg_catalog.pg_class foreign_cl ON co.confrelid = foreign_cl.oid
      LEFT JOIN pg_catalog.pg_namespace foreign_ns ON
        foreign_cl.relnamespace = foreign_ns.oid
      WHERE ns.nspname = 'public' AND cl.relname IN ('${RULE}', '${EXCEPTION}')`),
    client.unsafe(`SELECT tg.tgname, tg.tgenabled, cl.relname AS table_name,
        fn.proname AS function_name
      FROM pg_catalog.pg_trigger tg
      JOIN pg_catalog.pg_class cl ON tg.tgrelid = cl.oid
      JOIN pg_catalog.pg_namespace ns ON cl.relnamespace = ns.oid
      JOIN pg_catalog.pg_proc fn ON tg.tgfoid = fn.oid
      JOIN pg_catalog.pg_namespace fn_ns ON fn.pronamespace = fn_ns.oid
      WHERE ns.nspname = 'public' AND fn_ns.nspname = 'public'
        AND NOT tg.tgisinternal AND tg.tgname = '${TRIGGER}'`),
    client.unsafe(`SELECT proc.proname, ns.nspname AS schema_name
      FROM pg_catalog.pg_proc proc
      JOIN pg_catalog.pg_namespace ns ON proc.pronamespace = ns.oid
      WHERE ns.nspname = 'public' AND proc.proname = '${FUNCTION}'`),
  ]);
  return classifyG04CalendarPreview({
    tables: tables.map((r) => r.name), columns, constraints, triggers, functions,
  });
}

async function withPreviewDatabase(input, options, task) {
  const credentials = validateUlcLinzD4PreviewDatabaseCredentials(input);
  if (credentials.migration.database !== DATABASE ||
      credentials.migration.user !== MIGRATION_ROLE) {
    refuse("G-04 requires the isolated Preview migration credentials.");
  }
  const plan = await loadG04CalendarPreviewPlan(options);
  const db = (options.databaseFactory ?? createPostgresDatabase)(
    input.migrationDatabaseUrl,
  );
  try {
    return await task(db.client, plan);
  } finally {
    await db.client.end().catch(() => {});
  }
}

export async function inspectG04CalendarPreview(input, options = {}) {
  return withPreviewDatabase(input, options, async (client) => ({
    state: await readG04CalendarPreviewState(client),
    schemaVersion: 17,
    productionChanged: false,
  }));
}

export async function migrateG04CalendarPreview(input, options = {}) {
  if (input?.apply !== true) {
    refuse("G-04 requires the operator's explicit apply=true approval.");
  }
  // Never allow direct CLI or API apply to bypass the independent privacy,
  // backed-up restore and operator-authorization evidence gate. The canonical
  // v16 plan/inspect commands remain intentionally available and read-only.
  await verifyG04V17ActivationReadiness({
    repositoryRoot: options.repositoryRoot ?? process.cwd(),
    now: options.now ?? new Date(),
  });
  return withPreviewDatabase(input, options, async (client, plan) => {
    if (typeof client.begin !== "function") {
      refuse("G-04 schema changes require a database transaction.");
    }
    const state = await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_catalog.pg_advisory_xact_lock(1212, 17)");
      const prior = await readG04CalendarPreviewState(transaction);
      if (prior === "current") return "already-current";
      for (const statement of plan.statements) {
        await transaction.unsafe(statement);
      }
      if (await readG04CalendarPreviewState(transaction) !== "current") {
        refuse("G-04 post-migration schema check failed; rolling back.");
      }
      return "applied";
    });
    return { state, schemaVersion: 17, productionChanged: false };
  });
}

export async function verifyG04CalendarPreview(input, options = {}) {
  const result = await inspectG04CalendarPreview(input, options);
  if (result.state !== "current") {
    refuse("G-04 v17 is not installed in isolated Preview.");
  }
  return result;
}

const isMainModule = typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    const cmd = process.argv[2];
    const input = {
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    };
    const output = cmd === "plan" ? await loadG04CalendarPreviewPlan()
      : cmd === "inspect" ? await inspectG04CalendarPreview(input)
      : cmd === "verify" ? await verifyG04CalendarPreview(input)
      : cmd === "apply" ? await migrateG04CalendarPreview({
        ...input,
        apply: process.env.APPBASIS_APPLY_MIGRATIONS === "1" &&
          process.env.APPBASIS_APPLY_G04_V17_PREVIEW === "1",
      }) : null;
    if (!output) refuse("Expected plan, inspect, verify or apply.");
    const { statements: _statements, ...summary } = output;
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    console.error(error instanceof UlcG04CalendarPreviewError
      ? error.message : "G-04 Preview migration was blocked.");
    process.exitCode = 1;
  }
}

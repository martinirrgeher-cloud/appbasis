import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  validateUlcLinzD4PreviewDatabaseCredentials,
} from "./ulc-linz-d4-preview-hyperdrive.mjs";

const SOURCE_TABLES = Object.freeze([
  "ulc_linz_exercise_catalog_item",
  "ulc_linz_exercise_parameter",
  "ulc_linz_exercise_group",
  "ulc_linz_exercise_favorite",
]);
const TARGET_TABLES = Object.freeze([
  "appbasis_exercise_catalog_item",
  "appbasis_exercise_catalog_parameter",
  "appbasis_exercise_catalog_audience",
  "appbasis_exercise_catalog_favorite",
]);
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const EXPECTED_APPLICATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_application";
const EXPECTED_SECURITY_LOG_PRINCIPAL =
  "appbasis_ulc_linz_preview_security_log";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export class UlcExerciseCatalogCutoverAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogCutoverAccessError";
  }
}

export async function inspectUlcExerciseCatalogCutoverAccess(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    databaseFactory = createPostgresDatabase,
  } = {},
) {
  const credentials = validatedCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  const database = databaseFactory(migrationDatabaseUrl);
  try {
    return await database.client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      await assertConnectedIdentity(transaction);
      return readAccessState(transaction, credentials.application.user);
    });
  } catch (error) {
    if (error instanceof UlcExerciseCatalogCutoverAccessError) throw error;
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C cutover ACL inspection failed.",
    );
  } finally {
    await database.client.end();
  }
}

export async function applyUlcExerciseCatalogCutoverAccess(
  {
    mode,
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply,
  } = {},
  {
    databaseFactory = createPostgresDatabase,
  } = {},
) {
  if (mode !== "quiesce" && mode !== "standard") {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C ACL mode must be quiesce or standard.",
    );
  }
  if (apply !== true) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C ACL mutation requires explicit apply approval.",
    );
  }

  const credentials = validatedCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  const role = quotedIdentifier(credentials.application.user);
  const database = databaseFactory(migrationDatabaseUrl);

  try {
    return await database.client.begin(async (transaction) => {
      await assertConnectedIdentity(transaction);
      await assertRelationsExist(transaction);

      if (mode === "quiesce") {
        await transaction.unsafe(
          "GRANT SELECT ON TABLE " +
            SOURCE_TABLES.map(qualifiedTable).join(", ") +
            " TO " +
            role,
        );
        await transaction.unsafe(
          "REVOKE INSERT, UPDATE, DELETE ON TABLE " +
            SOURCE_TABLES.map(qualifiedTable).join(", ") +
            " FROM " +
            role,
        );
        await transaction.unsafe(
          "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE " +
            TARGET_TABLES.map(qualifiedTable).join(", ") +
            " FROM " +
            role,
        );
      } else {
        const before = await readAccessState(
          transaction,
          credentials.application.user,
        );
        if (
          !before.source.every(
            (entry) =>
              entry.select === true &&
              entry.insert === false &&
              entry.update === false &&
              entry.delete === false,
          )
        ) {
          throw new UlcExerciseCatalogCutoverAccessError(
            "E6G-C3C standard access requires Source DML to be quiesced first.",
          );
        }
        await transaction.unsafe(
          "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE " +
            TARGET_TABLES.map(qualifiedTable).join(", ") +
            " TO " +
            role,
        );
      }

      const state = await readAccessState(
        transaction,
        credentials.application.user,
      );
      assertExpectedState(state, mode);
      return Object.freeze({
        ...state,
        mutation: mode,
        applied: true,
      });
    });
  } catch (error) {
    if (error instanceof UlcExerciseCatalogCutoverAccessError) throw error;
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C cutover ACL mutation failed and was rolled back.",
    );
  } finally {
    await database.client.end();
  }
}

function validatedCredentials(input) {
  let credentials;
  try {
    credentials = validateUlcLinzD4PreviewDatabaseCredentials({
      migrationDatabaseUrl: input.migrationDatabaseUrl,
      applicationDatabaseUrl: input.applicationDatabaseUrl,
      securityLogDatabaseUrl: input.securityLogDatabaseUrl,
    });
  } catch {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C requires the exact separated ULC preview credentials.",
    );
  }
  if (
    credentials.migration.database !== EXPECTED_DATABASE ||
    credentials.migration.user !== EXPECTED_MIGRATION_PRINCIPAL ||
    credentials.application.user !== EXPECTED_APPLICATION_PRINCIPAL ||
    credentials.securityLog.user !== EXPECTED_SECURITY_LOG_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C requires the exact ULC preview database roles.",
    );
  }
  assertIdentifier(credentials.application.user);
  return credentials;
}

async function assertConnectedIdentity(sql) {
  const rows = await sql.unsafe(
    "SELECT current_database()::text AS database_name, " +
      "current_user::text AS principal_name",
  );
  if (
    rows.length !== 1 ||
    rows[0]?.database_name !== EXPECTED_DATABASE ||
    rows[0]?.principal_name !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C connected database identity is not the approved migration target.",
    );
  }
}

async function assertRelationsExist(sql) {
  const rows = await sql.unsafe(
    "SELECT " +
      [...SOURCE_TABLES, ...TARGET_TABLES]
        .map(
          (table, index) =>
            "to_regclass('public." +
            table +
            "')::text AS r" +
            String(index),
        )
        .join(", "),
  );
  if (
    rows.length !== 1 ||
    Object.values(rows[0]).some((value) => value === null)
  ) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C ACL transition requires all Source and Target tables.",
    );
  }
}

async function readAccessState(sql, applicationRole) {
  assertIdentifier(applicationRole);
  const source = [];
  for (const table of SOURCE_TABLES) {
    source.push(
      await tablePrivileges(sql, applicationRole, table),
    );
  }
  const target = [];
  for (const table of TARGET_TABLES) {
    target.push(
      await tablePrivileges(sql, applicationRole, table),
    );
  }
  return deepFreeze({
    schemaVersion: 1,
    operation: "ulc-exercise-catalog-cutover-access",
    applicationRole,
    source,
    target,
  });
}

async function tablePrivileges(sql, role, table) {
  const rows = await sql.unsafe(
    "SELECT " +
      "has_table_privilege($1, $2, 'SELECT') AS select, " +
      "has_table_privilege($1, $2, 'INSERT') AS insert, " +
      "has_table_privilege($1, $2, 'UPDATE') AS update, " +
      "has_table_privilege($1, $2, 'DELETE') AS delete",
    [role, "public." + table],
  );
  if (rows.length !== 1) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C ACL inspection returned an invalid result.",
    );
  }
  const row = rows[0];
  for (const key of ["select", "insert", "update", "delete"]) {
    if (typeof row[key] !== "boolean") {
      throw new UlcExerciseCatalogCutoverAccessError(
        "E6G-C3C ACL inspection returned an invalid privilege shape.",
      );
    }
  }
  return Object.freeze({
    table,
    select: row.select,
    insert: row.insert,
    update: row.update,
    delete: row.delete,
  });
}

function assertExpectedState(state, mode) {
  const sourceQuiesced = state.source.every(
    (entry) =>
      entry.select === true &&
      entry.insert === false &&
      entry.update === false &&
      entry.delete === false,
  );
  if (!sourceQuiesced) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C Source DML was not fully quiesced.",
    );
  }

  const targetReady = state.target.every(
    (entry) =>
      entry.select === true &&
      entry.insert === true &&
      entry.update === true &&
      entry.delete === true,
  );
  const targetBlocked = state.target.every(
    (entry) =>
      entry.select === false &&
      entry.insert === false &&
      entry.update === false &&
      entry.delete === false,
  );

  if (
    (mode === "quiesce" && !targetBlocked) ||
    (mode === "standard" && !targetReady)
  ) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C Target ACL does not match the requested cutover phase.",
    );
  }
}

function qualifiedTable(value) {
  assertIdentifier(value);
  return '"public".' + quotedIdentifier(value);
}

function quotedIdentifier(value) {
  assertIdentifier(value);
  return '"' + value + '"';
}

function assertIdentifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new UlcExerciseCatalogCutoverAccessError(
      "E6G-C3C credential contains an invalid SQL identifier.",
    );
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const command = process.argv[2] ?? "inspect";
  const input = {
    migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl:
      process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  };
  try {
    const result =
      command === "inspect"
        ? await inspectUlcExerciseCatalogCutoverAccess(input)
        : await applyUlcExerciseCatalogCutoverAccess(
            {
              ...input,
              mode: command,
              apply:
                process.env
                  .APPBASIS_APPLY_EXERCISE_CATALOG_CUTOVER_ACCESS ===
                "1",
            },
          );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC E6G-C3C cutover ACL operation failed.",
    );
    process.exitCode = 1;
  }
}

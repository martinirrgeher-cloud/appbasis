import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { loadUlcExerciseCatalogPreviewCutoverPlan } from "./ulc-linz-exercise-catalog-preview-cutover.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_MIGRATION_PRINCIPAL =
  "appbasis_ulc_linz_preview_migration";
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const ROLE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export class UlcExerciseCatalogPreviewQuiescenceConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewQuiescenceConfigurationError";
  }
}

export class UlcExerciseCatalogPreviewQuiescenceExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewQuiescenceExecutionError";
  }
}

export async function applyUlcExerciseCatalogPreviewSourceWriteQuiescence(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcExerciseCatalogPreviewCutoverPlan,
  } = {},
) {
  if (apply !== true) {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C source-write quiescence requires explicit apply=true.",
    );
  }
  if (typeof databaseFactory !== "function" || typeof loadPlan !== "function") {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C source-write quiescence dependencies are unavailable.",
    );
  }

  const credentials = validatedCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  const applicationRole = requiredRoleName(credentials.application.user);
  const plan = await loadPlan({ repositoryRoot });
  assertCutoverPlan(plan);
  await verifyApplicationCredential({
    databaseFactory,
    applicationDatabaseUrl,
    expectedRole: applicationRole,
  });

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
  } catch {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C migration connection could not be created.",
    );
  }

  let primaryError;
  try {
    return await database.client.begin(async (transaction) => {
      await verifyMigrationIdentity(transaction);
      await assertApplicationRoleBoundary(transaction, applicationRole);
      await assertRelationsExist(transaction, plan.tables);

      const app = quoteIdentifier(applicationRole);
      for (const table of plan.tables) {
        const source = qualifiedTable(table.sourceTable);
        const target = qualifiedTable(table.targetTable);
        await transaction.unsafe(
          "GRANT SELECT ON TABLE " + source + " TO " + app,
        );
        await transaction.unsafe(
          "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN " +
            "ON TABLE " + source + " FROM " + app,
        );
        await transaction.unsafe(
          "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE " +
            target + " TO " + app,
        );
        await transaction.unsafe(
          "REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE " +
            target + " FROM " + app,
        );
      }

      const guard = await verifyEffectiveGuard(
        transaction,
        applicationRole,
        plan.tables,
      );
      return deepFreeze({
        state: "preview-source-writes-quiesced",
        application: "ulc-linz",
        moduleId: "exercise-catalog",
        preview: {
          environment: "generated-preview-ulc-linz",
          database: EXPECTED_DATABASE,
          migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
          applicationPrincipal: applicationRole,
        },
        sourceReadsAllowed: true,
        sourceWritesBlocked: true,
        targetRuntimeDmlReady: true,
        tables: guard,
        runtimeCutoverPerformed: false,
      });
    });
  } catch (error) {
    primaryError = error;
    if (
      error instanceof UlcExerciseCatalogPreviewQuiescenceConfigurationError ||
      error instanceof UlcExerciseCatalogPreviewQuiescenceExecutionError
    ) {
      throw error;
    }
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C source-write quiescence transaction failed and was rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
          "E6G-C3C migration connection could not be closed cleanly.",
        );
      }
    }
  }
}

export async function verifyUlcExerciseCatalogPreviewSourceWriteQuiescence(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
    loadPlan = loadUlcExerciseCatalogPreviewCutoverPlan,
  } = {},
) {
  if (typeof databaseFactory !== "function" || typeof loadPlan !== "function") {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C quiescence verification dependencies are unavailable.",
    );
  }

  const credentials = validatedCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  const applicationRole = requiredRoleName(credentials.application.user);
  const plan = await loadPlan({ repositoryRoot });
  assertCutoverPlan(plan);
  await verifyApplicationCredential({
    databaseFactory,
    applicationDatabaseUrl,
    expectedRole: applicationRole,
  });

  let database;
  try {
    database = databaseFactory(migrationDatabaseUrl);
  } catch {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C migration connection could not be created.",
    );
  }

  try {
    await verifyMigrationIdentity(database.client);
    await assertApplicationRoleBoundary(database.client, applicationRole);
    await assertRelationsExist(database.client, plan.tables);
    const tables = await verifyEffectiveGuard(
      database.client,
      applicationRole,
      plan.tables,
    );
    return deepFreeze({
      state: "preview-source-write-quiescence-verified",
      application: "ulc-linz",
      moduleId: "exercise-catalog",
      preview: {
        environment: "generated-preview-ulc-linz",
        database: EXPECTED_DATABASE,
        migrationPrincipal: EXPECTED_MIGRATION_PRINCIPAL,
        applicationPrincipal: applicationRole,
      },
      sourceReadsAllowed: true,
      sourceWritesBlocked: true,
      targetRuntimeDmlReady: true,
      tables,
    });
  } finally {
    await database.client.end();
  }
}

async function verifyApplicationCredential({
  databaseFactory,
  applicationDatabaseUrl,
  expectedRole,
}) {
  let database;
  try {
    database = databaseFactory(applicationDatabaseUrl);
    const rows = await database.client.unsafe(
      "SELECT current_database()::text AS database_name, " +
        "current_user::text AS principal_name",
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.database_name !== EXPECTED_DATABASE ||
      rows[0]?.principal_name !== expectedRole
    ) {
      throw new Error("identity mismatch");
    }
  } catch {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C application runtime credential authentication failed.",
    );
  } finally {
    if (database !== undefined) {
      await database.client.end().catch(() => {});
    }
  }
}

function validatedCredentials({
  migrationDatabaseUrl,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
}) {
  let credentials;
  try {
    credentials = validateUlcLinzD4PreviewDatabaseCredentials({
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    });
  } catch {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C requires the separated direct ULC preview database credentials.",
    );
  }
  if (
    credentials.migration.database !== EXPECTED_DATABASE ||
    credentials.migration.user !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C requires the exact ULC preview migration database and principal.",
    );
  }
  return credentials;
}

function assertCutoverPlan(plan) {
  if (
    plan?.state !== "ready-for-explicit-preview-cutover-gates" ||
    plan?.tables?.length !== 4 ||
    plan?.preview?.database !== EXPECTED_DATABASE
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C quiescence plan is invalid.",
    );
  }
}

async function verifyMigrationIdentity(sql) {
  const rows = await sql.unsafe(
    "SELECT current_database()::text AS database_name, " +
      "current_user::text AS principal_name",
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0]?.database_name !== EXPECTED_DATABASE ||
    rows[0]?.principal_name !== EXPECTED_MIGRATION_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C connected PostgreSQL identity does not match the approved preview migration target.",
    );
  }
}

async function assertApplicationRoleBoundary(sql, applicationRole) {
  const roleRows = await sql.unsafe(
    "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, " +
      "rolreplication, rolbypassrls FROM pg_catalog.pg_roles " +
      "WHERE rolname = $1",
    [applicationRole],
  );
  if (
    !Array.isArray(roleRows) ||
    roleRows.length !== 1 ||
    roleRows[0]?.rolcanlogin !== true ||
    roleRows[0]?.rolsuper !== false ||
    roleRows[0]?.rolcreatedb !== false ||
    roleRows[0]?.rolcreaterole !== false ||
    roleRows[0]?.rolreplication !== false ||
    roleRows[0]?.rolbypassrls !== false
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C application runtime role boundary is invalid.",
    );
  }

  const membershipRows = await sql.unsafe(
    "SELECT count(*)::int AS count FROM pg_catalog.pg_auth_members AS membership " +
      "INNER JOIN pg_catalog.pg_roles AS member " +
      "ON member.oid = membership.member WHERE member.rolname = $1",
    [applicationRole],
  );
  if (
    !Array.isArray(membershipRows) ||
    membershipRows.length !== 1 ||
    membershipRows[0]?.count !== 0
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C application runtime role must not inherit another database role.",
    );
  }

  const capabilityRows = await sql.unsafe(
    "SELECT " +
      "has_database_privilege($1, current_database(), 'CREATE') AS database_create, " +
      "has_schema_privilege($1, 'public', 'USAGE') AS schema_usage, " +
      "has_schema_privilege($1, 'public', 'CREATE') AS schema_create",
    [applicationRole],
  );
  if (
    !Array.isArray(capabilityRows) ||
    capabilityRows.length !== 1 ||
    capabilityRows[0]?.database_create !== false ||
    capabilityRows[0]?.schema_usage !== true ||
    capabilityRows[0]?.schema_create !== false
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C application runtime database/schema boundary is invalid.",
    );
  }

  const ownershipRows = await sql.unsafe(
    "SELECT " +
      "(SELECT count(*)::int FROM pg_catalog.pg_database " +
      " WHERE datname = current_database() " +
      " AND pg_catalog.pg_get_userbyid(datdba) = $1) AS database_count, " +
      "(SELECT count(*)::int FROM pg_catalog.pg_namespace " +
      " WHERE nspname = 'public' " +
      " AND pg_catalog.pg_get_userbyid(nspowner) = $1) AS schema_count, " +
      "(SELECT count(*)::int FROM pg_catalog.pg_class AS relation " +
      " INNER JOIN pg_catalog.pg_namespace AS namespace " +
      " ON namespace.oid = relation.relnamespace " +
      " WHERE namespace.nspname = 'public' " +
      " AND pg_catalog.pg_get_userbyid(relation.relowner) = $1) AS relation_count",
    [applicationRole],
  );
  if (
    !Array.isArray(ownershipRows) ||
    ownershipRows.length !== 1 ||
    ownershipRows[0]?.database_count !== 0 ||
    ownershipRows[0]?.schema_count !== 0 ||
    ownershipRows[0]?.relation_count !== 0
  ) {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C application runtime role must not own preview database objects.",
    );
  }
}

async function assertRelationsExist(sql, tables) {
  for (const table of tables) {
    for (const relation of [table.sourceTable, table.targetTable]) {
      assertIdentifier(relation);
      const rows = await sql.unsafe(
        "SELECT to_regclass('public." + relation + "')::text AS relation_name",
      );
      if (
        !Array.isArray(rows) ||
        rows.length !== 1 ||
        rows[0]?.relation_name === null
      ) {
        throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
          "E6G-C3C required cutover relation is missing: " + relation + ".",
        );
      }
    }
  }
}

async function verifyEffectiveGuard(sql, applicationRole, tables) {
  const result = [];
  for (const table of tables) {
    const source = await effectiveTablePrivileges(
      sql,
      applicationRole,
      table.sourceTable,
    );
    const target = await effectiveTablePrivileges(
      sql,
      applicationRole,
      table.targetTable,
    );

    if (
      source.select !== true ||
      source.insert !== false ||
      source.update !== false ||
      source.delete !== false ||
      source.truncate !== false ||
      source.references !== false ||
      source.trigger !== false ||
      source.maintain !== false
    ) {
      throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
        "E6G-C3C source-write quiescence is not effective for " +
          table.sourceTable + ".",
      );
    }
    if (
      target.select !== true ||
      target.insert !== true ||
      target.update !== true ||
      target.delete !== true ||
      target.truncate !== false ||
      target.references !== false ||
      target.trigger !== false ||
      target.maintain !== false
    ) {
      throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
        "E6G-C3C standard-module runtime privileges are incomplete for " +
          table.targetTable + ".",
      );
    }

    result.push({
      sourceTable: table.sourceTable,
      targetTable: table.targetTable,
      source: {
        select: true,
        writesBlocked: true,
      },
      target: {
        select: true,
        insert: true,
        update: true,
        delete: true,
      },
    });
  }
  return deepFreeze(result);
}

async function effectiveTablePrivileges(sql, role, tableName) {
  assertIdentifier(tableName);
  const relation = "public." + tableName;
  const rows = await sql.unsafe(
    "SELECT " +
      "has_table_privilege($1, $2, 'SELECT') AS select, " +
      "has_table_privilege($1, $2, 'INSERT') AS insert, " +
      "has_table_privilege($1, $2, 'UPDATE') AS update, " +
      "has_table_privilege($1, $2, 'DELETE') AS delete, " +
      "has_table_privilege($1, $2, 'TRUNCATE') AS truncate, " +
      "has_table_privilege($1, $2, 'REFERENCES') AS references, " +
      "has_table_privilege($1, $2, 'TRIGGER') AS trigger, " +
      "has_table_privilege($1, $2, 'MAINTAIN') AS maintain",
    [role, relation],
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new UlcExerciseCatalogPreviewQuiescenceExecutionError(
      "E6G-C3C effective table privilege query returned an invalid result.",
    );
  }
  return rows[0];
}

function requiredRoleName(value) {
  if (typeof value !== "string" || !ROLE_IDENTIFIER.test(value)) {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C application runtime role name is invalid.",
    );
  }
  return value;
}

function qualifiedTable(value) {
  assertIdentifier(value);
  return '"public".' + quoteIdentifier(value);
}

function quoteIdentifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C SQL identifier is invalid.",
    );
  }
  return '"' + value + '"';
}

function assertIdentifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new UlcExerciseCatalogPreviewQuiescenceConfigurationError(
      "E6G-C3C reviewed SQL identifier is invalid.",
    );
  }
}

function safeErrorMessage(error) {
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

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const command = process.argv[2];
    const input = {
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl:
        process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    };
    const result =
      command === "apply"
        ? await applyUlcExerciseCatalogPreviewSourceWriteQuiescence({
            ...input,
            apply:
              process.env
                .APPBASIS_APPLY_EXERCISE_CATALOG_QUIESCENCE === "1",
          })
        : command === "verify"
          ? await verifyUlcExerciseCatalogPreviewSourceWriteQuiescence(input)
          : null;
    if (result === null) {
      throw new Error("Expected command apply or verify.");
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  }
}

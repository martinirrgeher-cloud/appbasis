import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const SECURITY_GROUP = "ulc_linz_security_event_ingest";
const SECURITY_TABLE = "public.ulc_linz_security_event_log";
const SECURITY_SEQUENCE = "public.ulc_linz_security_event_log_id_seq";
const SECURITY_PURGE_FUNCTION =
  "public.appbasis_ulc_linz_purge_expired_security_events()";

export async function reconcileUlcLinzD4PreviewDatabaseAccess(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
    apply = false,
  } = {},
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (apply !== true) {
    throw new Error("ULC D4 preview database access requires explicit apply=true.");
  }
  if (typeof databaseFactory !== "function") {
    throw new Error("ULC D4 preview database factory is invalid.");
  }

  const credentials = validateUlcLinzD4PreviewDatabaseCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  const applicationRole = requiredRoleName(credentials.application.user);
  const securityRole = requiredRoleName(credentials.securityLog.user);

  const ownerDatabase = databaseFactory(migrationDatabaseUrl);
  try {
    await requireRuntimeRoleInventory(
      ownerDatabase.client,
      applicationRole,
      securityRole,
    );
    await requireApplicationMembershipBoundary(
      ownerDatabase.client,
      applicationRole,
    );

    if (typeof ownerDatabase.client.begin !== "function") {
      throw new Error("ULC D4 preview database access transaction is unavailable.");
    }
    await ownerDatabase.client.begin(async (transaction) => {
      if (transaction == null || typeof transaction.unsafe !== "function") {
        throw new Error("ULC D4 preview database access transaction is invalid.");
      }

      const app = quoteIdentifier(applicationRole);
      const security = quoteIdentifier(securityRole);
      const statements = [
        "REVOKE CREATE ON SCHEMA public FROM " + app,
        "GRANT USAGE ON SCHEMA public TO " + app,
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO " + app,
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO " + app,
        "REVOKE ALL ON TABLE " + SECURITY_TABLE + " FROM " + app,
        "REVOKE ALL ON SEQUENCE " + SECURITY_SEQUENCE + " FROM " + app,
        "REVOKE ALL ON FUNCTION " + SECURITY_PURGE_FUNCTION + " FROM " + app,
      ];
      for (const statement of statements) {
        await transaction.unsafe(statement);
      }

      const memberships = await readMemberships(ownerDatabase.client, securityRole);
      validateSecurityMemberships(memberships, securityRole, true);
      const effective = memberships.some(
        (edge) =>
          edge.parent === SECURITY_GROUP &&
          edge.member === securityRole &&
          edge.admin_option === false &&
          edge.inherit_option === true &&
          edge.set_option === true,
      );
      if (!effective) {
        await transaction.unsafe(
          "GRANT " +
            quoteIdentifier(SECURITY_GROUP) +
            " TO " +
            security +
            " WITH INHERIT TRUE, SET TRUE",
        );
      }
    });

    const memberships = await readMemberships(ownerDatabase.client, securityRole);
    validateSecurityMemberships(memberships, securityRole, false);
  } finally {
    await ownerDatabase.client.end().catch(() => {});
  }

  await verifyApplicationRuntimeAccess({
    applicationDatabaseUrl,
    applicationRole,
    databaseFactory,
  });
  await verifySecurityRuntimeAccess({
    securityLogDatabaseUrl,
    securityRole,
    databaseFactory,
  });

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    migrationPrincipalSeparated: true,
    applicationRuntimeAccessVerified: true,
    securityLogRuntimeAccessVerified: true,
  });
}

async function requireRuntimeRoleInventory(client, applicationRole, securityRole) {
  const rows = await client.unsafe(
    "SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, " +
      "rolreplication, rolbypassrls " +
      "FROM pg_catalog.pg_roles " +
      "WHERE rolname = ANY($1::text[]) ORDER BY rolname",
    [[SECURITY_GROUP, applicationRole, securityRole]],
  );
  if (!Array.isArray(rows)) {
    throw new Error("ULC D4 preview database role inventory is invalid.");
  }
  const byName = new Map(rows.map((row) => [row?.rolname, row]));
  const group = byName.get(SECURITY_GROUP);
  if (byName.size !== 3 || group?.rolcanlogin !== false || elevated(group)) {
    throw new Error("ULC D4 protected security-log group role is unsafe.");
  }
  for (const roleName of [applicationRole, securityRole]) {
    const role = byName.get(roleName);
    if (role?.rolcanlogin !== true || elevated(role)) {
      throw new Error("ULC D4 runtime database role is unavailable or privileged.");
    }
  }
}

function elevated(role) {
  return (
    role?.rolsuper !== false ||
    role?.rolcreatedb !== false ||
    role?.rolcreaterole !== false ||
    role?.rolreplication !== false ||
    role?.rolbypassrls !== false
  );
}

async function requireApplicationMembershipBoundary(client, applicationRole) {
  const memberships = await readMemberships(client, applicationRole);
  if (!Array.isArray(memberships) || memberships.length !== 0) {
    throw new Error(
      "ULC D4 application runtime database role must not inherit another database role.",
    );
  }
}

async function verifyApplicationRuntimeAccess({
  applicationDatabaseUrl,
  applicationRole,
  databaseFactory,
}) {
  const database = databaseFactory(applicationDatabaseUrl);
  try {
    const rows = await database.client.unsafe(
      "WITH table_access AS (" +
        " SELECT bool_and(" +
        " has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'SELECT')" +
        " AND has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'INSERT')" +
        " AND has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'UPDATE')" +
        " AND has_table_privilege(current_user, format('%I.%I', schemaname, tablename), 'DELETE')" +
        " ) AS all_runtime_table_dml" +
        " FROM pg_catalog.pg_tables" +
        " WHERE schemaname = 'public'" +
        " AND tablename <> 'ulc_linz_security_event_log'" +
        "), sequence_access AS (" +
        " SELECT COALESCE(bool_and(" +
        " has_sequence_privilege(current_user, format('%I.%I', sequence_schema, sequence_name), 'USAGE')" +
        " AND has_sequence_privilege(current_user, format('%I.%I', sequence_schema, sequence_name), 'SELECT')" +
        " ), true) AS all_runtime_sequence_access" +
        " FROM information_schema.sequences" +
        " WHERE sequence_schema = 'public'" +
        " AND sequence_name <> 'ulc_linz_security_event_log_id_seq'" +
        "), ownership AS (" +
        " SELECT count(*)::integer AS owned_relations" +
        " FROM pg_catalog.pg_class relation" +
        " JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace" +
        " WHERE namespace.nspname = 'public'" +
        " AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')" +
        " AND pg_catalog.pg_get_userbyid(relation.relowner) = current_user" +
        ") SELECT current_user AS current_user," +
        " has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage," +
        " has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create," +
        " (SELECT all_runtime_table_dml FROM table_access) AS all_runtime_table_dml," +
        " (SELECT all_runtime_sequence_access FROM sequence_access) AS all_runtime_sequence_access," +
        " (SELECT owned_relations FROM ownership) AS owned_relations," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'SELECT') AS security_select," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'INSERT') AS security_insert," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'UPDATE') AS security_update," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'DELETE') AS security_delete," +
        " has_sequence_privilege(current_user, '" + SECURITY_SEQUENCE + "', 'USAGE') AS security_sequence_usage",
    );
    const access = rows?.[0];
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      access?.current_user !== applicationRole ||
      access?.schema_usage !== true ||
      access?.schema_create !== false ||
      access?.all_runtime_table_dml !== true ||
      access?.all_runtime_sequence_access !== true ||
      Number(access?.owned_relations) !== 0 ||
      access?.security_select !== false ||
      access?.security_insert !== false ||
      access?.security_update !== false ||
      access?.security_delete !== false ||
      access?.security_sequence_usage !== false
    ) {
      throw new Error("ULC D4 application runtime database ACL is not exact.");
    }
  } finally {
    await database.client.end().catch(() => {});
  }
}

async function verifySecurityRuntimeAccess({
  securityLogDatabaseUrl,
  securityRole,
  databaseFactory,
}) {
  const database = databaseFactory(securityLogDatabaseUrl);
  try {
    const rows = await database.client.unsafe(
      "SELECT current_user AS current_user," +
        " pg_has_role(current_user, '" + SECURITY_GROUP + "', 'USAGE') AS has_ingest_role," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'INSERT') AS has_table_insert," +
        " (SELECT bool_and(has_column_privilege(current_user, '" + SECURITY_TABLE + "', column_name, 'INSERT'))" +
        " FROM (VALUES ('schema_version'),('app_id'),('category'),('event_type'),('occurred_at')," +
        " ('actor_principal_id'),('organization_id'),('action'),('target_type'),('target_id')," +
        " ('operation'),('http_status'),('error_code'),('reason_code'),('retained_until'))" +
        " AS allowed_columns(column_name)) AS can_insert_allowed_columns," +
        " has_column_privilege(current_user, '" + SECURITY_TABLE + "', 'recorded_at', 'INSERT') AS can_insert_recorded_at," +
        " has_sequence_privilege(current_user, '" + SECURITY_SEQUENCE + "', 'USAGE') AS can_use_sequence," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'SELECT') AS can_select," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'UPDATE') AS can_update," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'DELETE') AS can_delete," +
        " has_table_privilege(current_user, '" + SECURITY_TABLE + "', 'TRUNCATE') AS can_truncate," +
        " has_sequence_privilege(current_user, '" + SECURITY_SEQUENCE + "', 'SELECT') AS can_select_sequence," +
        " has_sequence_privilege(current_user, '" + SECURITY_SEQUENCE + "', 'UPDATE') AS can_update_sequence",
    );
    const access = rows?.[0];
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      access?.current_user !== securityRole ||
      access?.has_ingest_role !== true ||
      access?.has_table_insert !== false ||
      access?.can_insert_allowed_columns !== true ||
      access?.can_insert_recorded_at !== false ||
      access?.can_use_sequence !== true ||
      access?.can_select !== false ||
      access?.can_update !== false ||
      access?.can_delete !== false ||
      access?.can_truncate !== false ||
      access?.can_select_sequence !== false ||
      access?.can_update_sequence !== false
    ) {
      throw new Error("ULC D4 security-log ingest ACL is not exact.");
    }
  } finally {
    await database.client.end().catch(() => {});
  }
}

async function readMemberships(client, member) {
  return client.unsafe(
    "SELECT parent.rolname AS parent, child.rolname AS member," +
      " membership.admin_option, membership.inherit_option, membership.set_option" +
      " FROM pg_catalog.pg_auth_members AS membership" +
      " JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid" +
      " JOIN pg_catalog.pg_roles AS child ON child.oid = membership.member" +
      " WHERE child.rolname = $1 ORDER BY parent.rolname",
    [member],
  );
}

function validateSecurityMemberships(rows, securityRole, allowRepairable) {
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new Error("ULC D4 security-log role membership is not exact.");
  }
  for (const edge of rows) {
    if (
      edge?.member !== securityRole ||
      edge?.parent !== SECURITY_GROUP ||
      edge?.admin_option !== false ||
      (!allowRepairable && edge?.inherit_option !== true) ||
      (!allowRepairable && edge?.set_option !== true) ||
      (allowRepairable &&
        edge?.inherit_option !== true &&
        edge?.inherit_option !== false) ||
      (allowRepairable &&
        edge?.set_option !== true &&
        edge?.set_option !== false)
    ) {
      throw new Error("ULC D4 security-log role membership is unsafe.");
    }
  }
  if (!allowRepairable && rows.length !== 1) {
    throw new Error("ULC D4 security-log role membership is missing.");
  }
}

function requiredRoleName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 63 ||
    value !== value.trim() ||
    value.includes("\u0000")
  ) {
    throw new Error("ULC D4 database role name is invalid.");
  }
  return value;
}

function quoteIdentifier(value) {
  return '"' + requiredRoleName(value).replaceAll('"', '""') + '"';
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const result = await reconcileUlcLinzD4PreviewDatabaseAccess({
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
      apply: process.env.APPBASIS_APPLY_DATABASE_ACCESS === "1",
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC D4 preview database access reconciliation failed.",
    );
    process.exitCode = 1;
  }
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const SECURITY_GROUP = "appbasis_ulc_linz_preview_security_ingest";
const SHARED_SECURITY_ROLES = Object.freeze([
  "ulc_linz_security_event_ingest",
  "ulc_linz_security_event_cleanup",
  "ulc_linz_security_event_read",
]);
const SECURITY_TABLE = "public.ulc_linz_security_event_log";
const SECURITY_SEQUENCE = "public.ulc_linz_security_event_log_id_seq";
const SECURITY_PURGE_FUNCTION =
  "public.appbasis_ulc_linz_purge_expired_security_events()";
const SECURITY_INGEST_COLUMNS = Object.freeze([
  "schema_version",
  "app_id",
  "category",
  "event_type",
  "occurred_at",
  "actor_principal_id",
  "organization_id",
  "action",
  "target_type",
  "target_id",
  "operation",
  "http_status",
  "error_code",
  "reason_code",
  "retained_until",
]);

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
    await requireSecurityGroupMembershipBoundary(ownerDatabase.client);
    await requireSecurityGroupMemberBoundary(
      ownerDatabase.client,
      securityRole,
      true,
    );
    await requireSecurityLoginCatalogBoundary(
      ownerDatabase.client,
      securityRole,
    );
    await requireSecurityGroupCatalogBoundary(ownerDatabase.client);
    await requireSharedSecurityRolesNeutralInPreviewDatabase(
      ownerDatabase.client,
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
    await requireSecurityGroupMemberBoundary(
      ownerDatabase.client,
      securityRole,
      false,
    );
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
    securityLogDatabaseIsolationVerified: true,
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

async function requireSecurityGroupMembershipBoundary(client) {
  const memberships = await readMemberships(client, SECURITY_GROUP);
  if (!Array.isArray(memberships) || memberships.length !== 0) {
    throw new Error(
      "ULC D4 security-log ingest group must not inherit another database role.",
    );
  }
}

async function requireSecurityGroupMemberBoundary(
  client,
  securityRole,
  allowMissing,
) {
  const members = await readMembers(client, SECURITY_GROUP);
  if (!Array.isArray(members) || members.length > 1) {
    throw new Error(
      "ULC D4 preview security-log group has unexpected cluster-wide members.",
    );
  }
  if (members.length === 0) {
    if (allowMissing) return;
    throw new Error(
      "ULC D4 preview security-log group membership is missing.",
    );
  }
  const edge = members[0];
  if (
    edge?.parent !== SECURITY_GROUP ||
    edge?.member !== securityRole ||
    edge?.admin_option !== false ||
    edge?.inherit_option !== true ||
    edge?.set_option !== true
  ) {
    throw new Error(
      "ULC D4 preview security-log group member is unsafe.",
    );
  }
}

async function requireSecurityLoginCatalogBoundary(client, securityRole) {
  const rows = await client.unsafe(
    `WITH target AS (
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
     ),
     direct_grants AS (
       SELECT acl.grantee
       FROM pg_catalog.pg_database object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.datacl) acl
       WHERE object.datname = current_database()
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_namespace object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.nspacl) acl
       WHERE object.nspname !~ '^pg_'
         AND object.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_class object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.relacl) acl
       WHERE namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_attribute attribute
       JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
       WHERE attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_proc object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.proacl) acl
       WHERE namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_type object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.typacl) acl
       WHERE namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_default_acl object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.defaclacl) acl
     )
     SELECT
       (SELECT count(*)::integer
          FROM pg_catalog.pg_database object
         WHERE object.datname = current_database()
           AND object.datdba = (SELECT oid FROM target)) AS owned_database_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_namespace object
         WHERE object.nspname !~ '^pg_'
           AND object.nspname <> 'information_schema'
           AND object.nspowner = (SELECT oid FROM target)) AS owned_schema_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.relnamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.relowner = (SELECT oid FROM target)) AS owned_relation_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_proc object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.pronamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.proowner = (SELECT oid FROM target)) AS owned_function_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_type object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.typowner = (SELECT oid FROM target)) AS owned_type_count,
       (SELECT count(*)::integer
          FROM direct_grants
         WHERE grantee = (SELECT oid FROM target)) AS direct_grant_count`,
    [securityRole],
  );
  const boundary = rows?.[0];
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    Number(boundary?.owned_database_count) !== 0 ||
    Number(boundary?.owned_schema_count) !== 0 ||
    Number(boundary?.owned_relation_count) !== 0 ||
    Number(boundary?.owned_function_count) !== 0 ||
    Number(boundary?.owned_type_count) !== 0 ||
    Number(boundary?.direct_grant_count) !== 0
  ) {
    throw new Error(
      "ULC D4 security-log login owns database objects or has direct grants.",
    );
  }
}

async function requireSharedSecurityRolesNeutralInPreviewDatabase(client) {
  const rows = await client.unsafe(
    `WITH targets AS (
       SELECT oid
       FROM pg_catalog.pg_roles
       WHERE rolname = ANY($1::text[])
     ),
     direct_grants AS (
       SELECT acl.grantee
       FROM pg_catalog.pg_database object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.datacl) acl
       WHERE object.datname = current_database()
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_namespace object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.nspacl) acl
       WHERE object.nspname !~ '^pg_'
         AND object.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_class object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.relacl) acl
       WHERE namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_attribute attribute
       JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
       WHERE attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_proc object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.proacl) acl
       WHERE namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_type object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.typacl) acl
       WHERE namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
       UNION ALL
       SELECT acl.grantee
       FROM pg_catalog.pg_default_acl object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.defaclacl) acl
     )
     SELECT
       (SELECT count(*)::integer FROM targets) AS shared_role_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_database object
         WHERE object.datname = current_database()
           AND object.datdba IN (SELECT oid FROM targets)) AS shared_owned_database_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_namespace object
         WHERE object.nspname !~ '^pg_'
           AND object.nspname <> 'information_schema'
           AND object.nspowner IN (SELECT oid FROM targets)) AS shared_owned_schema_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.relnamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.relowner IN (SELECT oid FROM targets)) AS shared_owned_relation_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_proc object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.pronamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.proowner IN (SELECT oid FROM targets)) AS shared_owned_function_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_type object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.typowner IN (SELECT oid FROM targets)) AS shared_owned_type_count,
       (SELECT count(*)::integer
          FROM direct_grants
         WHERE grantee IN (SELECT oid FROM targets)) AS shared_direct_grant_count`,
    [SHARED_SECURITY_ROLES],
  );
  const boundary = rows?.[0];
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    Number(boundary?.shared_role_count) !== SHARED_SECURITY_ROLES.length ||
    Number(boundary?.shared_owned_database_count) !== 0 ||
    Number(boundary?.shared_owned_schema_count) !== 0 ||
    Number(boundary?.shared_owned_relation_count) !== 0 ||
    Number(boundary?.shared_owned_function_count) !== 0 ||
    Number(boundary?.shared_owned_type_count) !== 0 ||
    Number(boundary?.shared_direct_grant_count) !== 0
  ) {
    throw new Error(
      "ULC D4 shared security roles are not neutral in the preview database.",
    );
  }
}

async function requireSecurityGroupCatalogBoundary(client) {
  const ownershipRows = await client.unsafe(
    `WITH target AS (
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
     )
     SELECT
       (SELECT count(*)::integer
          FROM pg_catalog.pg_database object
         WHERE object.datname = current_database()
           AND object.datdba = (SELECT oid FROM target)) AS group_owned_database_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_namespace object
         WHERE object.nspname !~ '^pg_'
           AND object.nspname <> 'information_schema'
           AND object.nspowner = (SELECT oid FROM target)) AS group_owned_schema_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_class object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.relnamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.relowner = (SELECT oid FROM target)) AS group_owned_relation_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_proc object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.pronamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.proowner = (SELECT oid FROM target)) AS group_owned_function_count,
       (SELECT count(*)::integer
          FROM pg_catalog.pg_type object
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND object.typowner = (SELECT oid FROM target)) AS group_owned_type_count`,
    [SECURITY_GROUP],
  );
  const ownership = ownershipRows?.[0];
  if (
    !Array.isArray(ownershipRows) ||
    ownershipRows.length !== 1 ||
    Number(ownership?.group_owned_database_count) !== 0 ||
    Number(ownership?.group_owned_schema_count) !== 0 ||
    Number(ownership?.group_owned_relation_count) !== 0 ||
    Number(ownership?.group_owned_function_count) !== 0 ||
    Number(ownership?.group_owned_type_count) !== 0
  ) {
    throw new Error("ULC D4 security-log ingest group owns database objects.");
  }

  const grants = await client.unsafe(
    `WITH target AS (
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
     )
     SELECT 'database'::text AS object_kind, NULL::text AS schema_name,
            object.datname::text AS object_name, NULL::text AS column_name,
            acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_database object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.datacl) acl
      WHERE object.datname = current_database()
        AND acl.grantee = (SELECT oid FROM target)
     UNION ALL
     SELECT 'schema'::text, NULL::text, object.nspname::text, NULL::text,
            acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_namespace object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.nspacl) acl
      WHERE object.nspname !~ '^pg_'
        AND object.nspname <> 'information_schema'
        AND acl.grantee = (SELECT oid FROM target)
     UNION ALL
     SELECT CASE WHEN object.relkind = 'S' THEN 'sequence'::text ELSE 'relation'::text END,
            namespace.nspname::text, object.relname::text, NULL::text,
            acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_class object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.relacl) acl
      WHERE namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
        AND acl.grantee = (SELECT oid FROM target)
     UNION ALL
     SELECT 'column'::text, namespace.nspname::text, relation.relname::text,
            attribute.attname::text, acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_attribute attribute
       JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      WHERE attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
        AND acl.grantee = (SELECT oid FROM target)
     UNION ALL
     SELECT 'function'::text, namespace.nspname::text, object.proname::text,
            NULL::text, acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_proc object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.proacl) acl
      WHERE namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
        AND acl.grantee = (SELECT oid FROM target)
     UNION ALL
     SELECT 'type'::text, namespace.nspname::text, object.typname::text,
            NULL::text, acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_type object
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.typacl) acl
      WHERE namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
        AND acl.grantee = (SELECT oid FROM target)
     UNION ALL
     SELECT 'default'::text, NULL::text, object.defaclobjtype::text,
            NULL::text, acl.privilege_type, acl.is_grantable
       FROM pg_catalog.pg_default_acl object
       CROSS JOIN LATERAL pg_catalog.aclexplode(object.defaclacl) acl
      WHERE acl.grantee = (SELECT oid FROM target)
     ORDER BY object_kind, schema_name, object_name, column_name, privilege_type`,
    [SECURITY_GROUP],
  );
  if (!Array.isArray(grants)) {
    throw new Error("ULC D4 security-log ingest group ACL inventory is invalid.");
  }

  const expected = new Set(
    SECURITY_INGEST_COLUMNS.map(
      (column) =>
        `column:public:ulc_linz_security_event_log:${column}:INSERT`,
    ),
  );
  expected.add(
    "sequence:public:ulc_linz_security_event_log_id_seq::USAGE",
  );

  const actual = new Set();
  for (const row of grants) {
    if (row?.is_grantable !== false) {
      throw new Error("ULC D4 security-log ingest group grant option is forbidden.");
    }
    const key = [
      String(row?.object_kind ?? ""),
      String(row?.schema_name ?? ""),
      String(row?.object_name ?? ""),
      String(row?.column_name ?? ""),
      String(row?.privilege_type ?? ""),
    ].join(":");
    if (actual.has(key)) {
      throw new Error("ULC D4 security-log ingest group ACL is duplicated.");
    }
    actual.add(key);
  }
  if (
    actual.size !== expected.size ||
    [...expected].some((key) => !actual.has(key))
  ) {
    throw new Error("ULC D4 security-log ingest group ACL is not exact.");
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
      "WITH user_schemas AS (" +
        " SELECT oid, nspname" +
        " FROM pg_catalog.pg_namespace" +
        " WHERE nspname !~ '^pg_'" +
        " AND nspname <> 'information_schema'" +
        "), non_security_schema_create AS (" +
        " SELECT count(*)::integer AS access_count" +
        " FROM user_schemas" +
        " WHERE has_schema_privilege(current_user, oid, 'CREATE')" +
        "), non_security_tables AS (" +
        " SELECT count(*)::integer AS access_count" +
        " FROM pg_catalog.pg_class relation" +
        " JOIN user_schemas namespace ON namespace.oid = relation.relnamespace" +
        " WHERE relation.relkind IN ('r','p','v','m','f')" +
        " AND NOT (" +
        " namespace.nspname = 'public'" +
        " AND relation.relname = 'ulc_linz_security_event_log'" +
        " )" +
        " AND (" +
        " has_table_privilege(current_user, relation.oid, 'SELECT')" +
        " OR has_table_privilege(current_user, relation.oid, 'INSERT')" +
        " OR has_table_privilege(current_user, relation.oid, 'UPDATE')" +
        " OR has_table_privilege(current_user, relation.oid, 'DELETE')" +
        " OR has_table_privilege(current_user, relation.oid, 'TRUNCATE')" +
        " OR has_table_privilege(current_user, relation.oid, 'REFERENCES')" +
        " OR has_table_privilege(current_user, relation.oid, 'TRIGGER')" +
        " OR has_any_column_privilege(current_user, relation.oid, 'SELECT')" +
        " OR has_any_column_privilege(current_user, relation.oid, 'INSERT')" +
        " OR has_any_column_privilege(current_user, relation.oid, 'UPDATE')" +
        " OR has_any_column_privilege(current_user, relation.oid, 'REFERENCES')" +
        " )" +
        "), non_security_sequences AS (" +
        " SELECT count(*)::integer AS access_count" +
        " FROM pg_catalog.pg_class relation" +
        " JOIN user_schemas namespace ON namespace.oid = relation.relnamespace" +
        " WHERE relation.relkind = 'S'" +
        " AND NOT (" +
        " namespace.nspname = 'public'" +
        " AND relation.relname = 'ulc_linz_security_event_log_id_seq'" +
        " )" +
        " AND (" +
        " has_sequence_privilege(current_user, relation.oid, 'USAGE')" +
        " OR has_sequence_privilege(current_user, relation.oid, 'SELECT')" +
        " OR has_sequence_privilege(current_user, relation.oid, 'UPDATE')" +
        " )" +
        ") SELECT current_user AS current_user," +
        " has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create," +
        " (SELECT access_count FROM non_security_schema_create) AS non_security_schema_create_count," +
        " (SELECT access_count FROM non_security_tables) AS non_security_table_access_count," +
        " (SELECT access_count FROM non_security_sequences) AS non_security_sequence_access_count," +
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
      access?.schema_create !== false ||
      Number(access?.non_security_schema_create_count) !== 0 ||
      Number(access?.non_security_table_access_count) !== 0 ||
      Number(access?.non_security_sequence_access_count) !== 0 ||
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

async function readMembers(client, parent) {
  return client.unsafe(
    "SELECT parent.rolname AS parent, child.rolname AS member," +
      " membership.admin_option, membership.inherit_option, membership.set_option" +
      " FROM pg_catalog.pg_auth_members AS membership" +
      " JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid" +
      " JOIN pg_catalog.pg_roles AS child ON child.oid = membership.member" +
      " WHERE parent.rolname = $1 ORDER BY child.rolname",
    [parent],
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

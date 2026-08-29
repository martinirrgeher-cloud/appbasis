import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const GROUPS = Object.freeze({
  ingest: "ulc_linz_security_event_ingest",
  cleanup: "ulc_linz_security_event_cleanup",
  read: "ulc_linz_security_event_read",
});
const ALLOWED_INGEST_COLUMNS = Object.freeze([
  "schema_version", "app_id", "category", "event_type", "occurred_at",
  "actor_principal_id", "organization_id", "action", "target_type", "target_id",
  "operation", "http_status", "error_code", "reason_code", "retained_until",
]);

export async function collectUlcLinzM5AclSemanticDiagnostic(
  {
    ownerDatabaseUrl,
    applicationDatabaseUrl,
    ingestDatabaseUrl,
    cleanupDatabaseUrl,
    readDatabaseUrl,
  },
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof databaseFactory !== "function") throw new Error("ULC M5 ACL diagnostic database factory is invalid.");

  const credentials = Object.freeze({
    owner: parseCredential(ownerDatabaseUrl),
    application: parseCredential(applicationDatabaseUrl),
    ingest: parseCredential(ingestDatabaseUrl),
    cleanup: parseCredential(cleanupDatabaseUrl),
    read: parseCredential(readDatabaseUrl),
  });
  const target = credentials.owner;
  for (const credential of Object.values(credentials)) {
    if (credential.host !== target.host || credential.database !== target.database) {
      throw new Error("ULC M5 ACL diagnostic credentials must select one production database.");
    }
  }
  if (new Set(Object.values(credentials).map((entry) => entry.user)).size !== Object.keys(credentials).length) {
    throw new Error("ULC M5 ACL diagnostic principals must be distinct.");
  }

  const client = databaseFactory(ownerDatabaseUrl);
  try {
    const [grantRows, membershipRows, roleRows, ownerRows] = await Promise.all([
      readGrantRows(client.client),
      readMembershipRows(client.client, credentials),
      readRoleRows(client.client),
      readProtectedObjectOwners(client.client),
    ]);
    if (!Array.isArray(grantRows) || !Array.isArray(membershipRows) || !Array.isArray(roleRows) ||
        !Array.isArray(ownerRows) || ownerRows.length !== 1) {
      throw new Error("ULC M5 ACL diagnostic inventory is invalid.");
    }

    const roleKinds = new Map(roleRows.map((row) => [requiredRoleName(row.rolname), row.rolcanlogin === true ? "OTHER_LOGIN" : "OTHER_GROUP"]));
    const protectedOwner = requiredRoleName(ownerRows[0].owner_name);
    const classifyRole = (name) => roleClass(requiredRoleName(name), credentials, protectedOwner, roleKinds);
    const expectedGrants = expectedGrantKeys();

    const unexpectedGrants = [];
    for (const row of grantRows) {
      const grantee = row.grantee === "PUBLIC" ? "PUBLIC" : requiredRoleName(row.grantee);
      const key = grantKey(row.object_kind, row.object_name, row.column_name, grantee, row.privilege_type);
      const grantable = boolean(row.is_grantable);
      if (expectedGrants.has(key) && grantable === false) continue;
      unexpectedGrants.push(Object.freeze({
        objectKind: objectKind(row.object_kind),
        objectName: objectNameClass(row.object_name),
        columnName: columnNameClass(row.column_name),
        granteeClass: grantee === "PUBLIC" ? "PUBLIC" : classifyRole(grantee),
        privilege: privilege(row.privilege_type),
        grantable,
      }));
    }

    const expectedMembers = new Map(Object.entries(GROUPS).map(([key, group]) => [group, credentials[key].user]));
    const membershipDiagnostics = membershipRows.map((row) => {
      const parent = requiredRoleName(row.group_role);
      const member = requiredRoleName(row.member_role);
      const expectedMember = expectedMembers.get(parent);
      const operational = expectedMember !== undefined && member === expectedMember &&
        row.admin_option === false && row.inherit_option === true && row.set_option === true;
      const safeCreatorBackReference = member === protectedOwner && expectedMember !== undefined &&
        row.grantor_superuser === true && row.admin_option === true &&
        row.inherit_option === false && row.set_option === false;
      return Object.freeze({
        parentClass: classifyRole(parent),
        memberClass: classifyRole(member),
        grantorClass: row.grantor_superuser === true ? "SUPERUSER" : classifyRole(row.grantor_role),
        adminOption: boolean(row.admin_option),
        inheritOption: boolean(row.inherit_option),
        setOption: boolean(row.set_option),
        expectedOperational: operational,
        safeCreatorBackReference,
      });
    });

    return Object.freeze({
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      unexpectedGrantCount: unexpectedGrants.length,
      unexpectedGrants: Object.freeze(unexpectedGrants),
      protectedMembershipCount: membershipDiagnostics.length,
      protectedMemberships: Object.freeze(membershipDiagnostics),
      productionReleaseAuthorized: false,
    });
  } finally {
    await client.client.end().catch(() => {});
  }
}

function parseCredential(value) {
  const parsed = parseUlcLinzProductionDatabaseUrl(value);
  return Object.freeze({ host: parsed.host, database: parsed.database, user: requiredRoleName(parsed.user) });
}

async function readGrantRows(client) {
  return client.unsafe(`WITH acl_rows AS (
    SELECT 'table'::text AS object_kind, relation.relname::text AS object_name,
           NULL::text AS column_name, relation.relowner AS owner_oid,
           acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) acl
     WHERE namespace.nspname = 'public' AND relation.relname = 'ulc_linz_security_event_log'
    UNION ALL
    SELECT 'sequence'::text, relation.relname::text, NULL::text, relation.relowner,
           acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('S', relation.relowner))) acl
     WHERE namespace.nspname = 'public' AND relation.relname = 'ulc_linz_security_event_log_id_seq'
    UNION ALL
    SELECT 'column'::text, relation.relname::text, attribute.attname::text, relation.relowner,
           acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_attribute attribute
      JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
     WHERE namespace.nspname = 'public' AND relation.relname = 'ulc_linz_security_event_log'
       AND attribute.attnum > 0 AND NOT attribute.attisdropped
    UNION ALL
    SELECT 'function'::text, procedure.proname::text, NULL::text, procedure.proowner,
           acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) acl
     WHERE namespace.nspname = 'public' AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
       AND procedure.pronargs = 0
  )
  SELECT object_kind, object_name, column_name,
         CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(grantee) END AS grantee,
         privilege_type, is_grantable
    FROM acl_rows
   WHERE grantee = 0 OR grantee <> owner_oid
   ORDER BY object_kind, object_name, column_name, grantee, privilege_type`);
}

async function readMembershipRows(client, credentials) {
  const protectedRoles = [
    credentials.application.user,
    credentials.ingest.user,
    credentials.cleanup.user,
    credentials.read.user,
    ...Object.values(GROUPS),
  ];
  return client.unsafe(`SELECT parent.rolname AS group_role, member.rolname AS member_role,
         grantor.rolname AS grantor_role, grantor.rolsuper AS grantor_superuser,
         membership.admin_option AS admin_option, membership.inherit_option AS inherit_option,
         membership.set_option AS set_option
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
   WHERE parent.rolname = ANY($1::text[]) OR member.rolname = ANY($1::text[])
   ORDER BY parent.rolname, member.rolname`, [protectedRoles]);
}

async function readRoleRows(client) {
  return client.unsafe(`SELECT rolname, rolcanlogin FROM pg_catalog.pg_roles ORDER BY rolname`);
}

async function readProtectedObjectOwners(client) {
  return client.unsafe(`WITH protected_objects AS (
    SELECT relation.relowner AS owner_oid
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relname IN ('ulc_linz_security_event_log', 'ulc_linz_security_event_log_id_seq')
    UNION ALL
    SELECT procedure.proowner AS owner_oid
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'public'
       AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events' AND procedure.pronargs = 0
  )
  SELECT min(owner.rolname)::text AS owner_name,
         count(*)::integer AS object_count,
         count(DISTINCT owner.rolname)::integer AS distinct_owner_count
    FROM protected_objects object
    JOIN pg_catalog.pg_roles owner ON owner.oid = object.owner_oid`);
}

function expectedGrantKeys() {
  const keys = new Set();
  for (const column of ALLOWED_INGEST_COLUMNS) {
    keys.add(grantKey("column", "ulc_linz_security_event_log", column, GROUPS.ingest, "INSERT"));
  }
  keys.add(grantKey("sequence", "ulc_linz_security_event_log_id_seq", null, GROUPS.ingest, "USAGE"));
  keys.add(grantKey("column", "ulc_linz_security_event_log", "retained_until", GROUPS.cleanup, "SELECT"));
  keys.add(grantKey("function", "appbasis_ulc_linz_purge_expired_security_events", null, GROUPS.cleanup, "EXECUTE"));
  keys.add(grantKey("table", "ulc_linz_security_event_log", null, GROUPS.read, "SELECT"));
  return keys;
}

function grantKey(kind, name, column, grantee, right) {
  return `${objectKind(kind)}:${requiredRoleName(name)}:${column === null || column === undefined ? "" : requiredColumnName(column)}:${requiredRoleName(grantee)}:${privilege(right)}`;
}

function roleClass(name, credentials, protectedOwner, roleKinds) {
  if (name === credentials.owner.user) return "OWNER_LOGIN";
  if (name === credentials.application.user) return "APPLICATION_LOGIN";
  if (name === credentials.ingest.user) return "INGEST_LOGIN";
  if (name === credentials.cleanup.user) return "CLEANUP_LOGIN";
  if (name === credentials.read.user) return "READ_LOGIN";
  if (name === GROUPS.ingest) return "INGEST_GROUP";
  if (name === GROUPS.cleanup) return "CLEANUP_GROUP";
  if (name === GROUPS.read) return "READ_GROUP";
  if (name === protectedOwner) return "PROTECTED_OBJECT_OWNER";
  return roleKinds.get(name) ?? "UNKNOWN_ROLE";
}

function objectKind(value) {
  const text = String(value ?? "");
  if (!["table", "column", "sequence", "function"].includes(text)) throw new Error("ULC M5 ACL diagnostic object kind is invalid.");
  return text;
}

function objectNameClass(value) {
  const text = requiredRoleName(value);
  if (text === "ulc_linz_security_event_log") return "SECURITY_LOG_TABLE";
  if (text === "ulc_linz_security_event_log_id_seq") return "SECURITY_LOG_SEQUENCE";
  if (text === "appbasis_ulc_linz_purge_expired_security_events") return "SECURITY_LOG_PURGE_FUNCTION";
  return "UNKNOWN_PROTECTED_OBJECT";
}

function columnNameClass(value) {
  if (value === null || value === undefined) return null;
  const text = requiredColumnName(value);
  if (ALLOWED_INGEST_COLUMNS.includes(text)) return `INGEST_COLUMN:${text}`;
  if (text === "id") return "IDENTITY_COLUMN";
  if (text === "recorded_at") return "RECORDED_AT_COLUMN";
  return "OTHER_COLUMN";
}

function privilege(value) {
  const text = String(value ?? "");
  if (!/^[A-Z][A-Z_ ]{0,31}$/.test(text)) throw new Error("ULC M5 ACL diagnostic privilege is invalid.");
  return text;
}

function requiredRoleName(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(value)) {
    throw new Error("ULC M5 ACL diagnostic role identity is invalid.");
  }
  return value;
}

function requiredColumnName(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error("ULC M5 ACL diagnostic column identity is invalid.");
  }
  return value;
}

function boolean(value) {
  if (value !== true && value !== false) throw new Error("ULC M5 ACL diagnostic boolean is invalid.");
  return value;
}

async function main() {
  const result = await collectUlcLinzM5AclSemanticDiagnostic({
    ownerDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_OWNER_DATABASE_URL,
    applicationDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    ingestDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL,
    cleanupDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL,
    readDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC M5 ACL semantic diagnostic failed.");
    process.exitCode = 1;
  });
}

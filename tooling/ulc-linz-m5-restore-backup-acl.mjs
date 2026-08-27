import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const CANONICAL_ROLE = /^[a-z_][a-z0-9_]*$/;
const CANONICAL_OBJECT = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/;

export function deriveBackupRole(databaseUrl) {
  let role;
  try {
    role = new URL(requiredText(databaseUrl, "backup database URL")).username;
  } catch {
    throw new Error("ULC M5 backup database URL is invalid.");
  }
  if (!CANONICAL_ROLE.test(role)) {
    throw new Error("ULC M5 backup principal is not a canonical PostgreSQL role name.");
  }
  return role;
}

export async function prepareInertRestoreBackupAclPrincipal(
  { restoreDatabaseUrl, backupDatabaseUrl },
  { databaseFactory = createPostgresDatabase } = {},
) {
  const role = deriveBackupRole(backupDatabaseUrl);
  const database = databaseFactory(requiredText(restoreDatabaseUrl, "restore database URL"));
  try {
    const sql = database.client;
    const existing = await sql.unsafe(`
      SELECT rolname
      FROM pg_catalog.pg_roles
      WHERE rolname = '${role}'
    `);
    if (!Array.isArray(existing) || existing.length > 1) {
      throw new Error("Isolated restore backup ACL principal inventory is invalid.");
    }
    if (existing.length === 0) {
      await sql.unsafe(`
        CREATE ROLE ${role}
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
      `);
    }

    const [roleRecord] = await sql.unsafe(`
      SELECT
        role.oid,
        current_user AS current_user,
        role.rolcanlogin,
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolinherit,
        role.rolreplication,
        role.rolbypassrls,
        (
          (SELECT count(*) FROM pg_catalog.pg_database database_record WHERE database_record.datdba = role.oid) +
          (SELECT count(*) FROM pg_catalog.pg_namespace namespace
             WHERE namespace.nspowner = role.oid
               AND namespace.nspname !~ '^pg_'
               AND namespace.nspname <> 'information_schema')
        ) AS protected_ownership_count
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = '${role}'
    `);
    if (!roleRecord) {
      throw new Error("Isolated restore backup ACL principal is missing.");
    }

    const memberships = await sql.unsafe(`
      SELECT
        granted.rolname AS granted_role,
        member.rolname AS member_name,
        grantor.rolname AS grantor_name,
        grantor.rolsuper AS grantor_superuser,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
      JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
      WHERE membership.roleid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = '${role}')
         OR membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = '${role}')
      ORDER BY granted.rolname, member.rolname, grantor.rolname
    `);

    assertInertRole(role, roleRecord, memberships);
    return { role, created: existing.length === 0 };
  } finally {
    await database.client.end().catch(() => {});
  }
}

export async function verifyAndCleanupRestoredBackupAuditAcl(
  {
    restoreDatabaseUrl,
    backupDatabaseUrl,
    auditTable = "public.ulc_linz_security_event_log",
    auditSequence = "public.ulc_linz_security_event_log_id_seq",
  },
  { databaseFactory = createPostgresDatabase } = {},
) {
  const role = deriveBackupRole(backupDatabaseUrl);
  const table = canonicalObject(auditTable, "audit table");
  const sequence = canonicalObject(auditSequence, "audit sequence");
  const database = databaseFactory(requiredText(restoreDatabaseUrl, "restore database URL"));
  try {
    const sql = database.client;
    const [privileges] = await sql.unsafe(`
      SELECT
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'SELECT') AS table_select,
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'INSERT') AS table_insert,
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'UPDATE') AS table_update,
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'DELETE') AS table_delete,
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'TRUNCATE') AS table_truncate,
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'TRIGGER') AS table_trigger,
        pg_catalog.has_table_privilege('${role}', '${table.literal}', 'REFERENCES') AS table_references,
        pg_catalog.has_sequence_privilege('${role}', '${sequence.literal}', 'SELECT') AS sequence_select,
        pg_catalog.has_sequence_privilege('${role}', '${sequence.literal}', 'USAGE') AS sequence_usage,
        pg_catalog.has_sequence_privilege('${role}', '${sequence.literal}', 'UPDATE') AS sequence_update
    `);
    if (!privileges || !exactReadOnlyAuditAcl(privileges)) {
      throw new Error("Restored production backup audit ACL is missing or unsafe.");
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(`REVOKE SELECT ON TABLE ${table.identifier} FROM ${role}`);
      await transaction.unsafe(`REVOKE SELECT ON SEQUENCE ${sequence.identifier} FROM ${role}`);
    });
    return { role, verified: true, cleaned: true };
  } finally {
    await database.client.end().catch(() => {});
  }
}

function assertInertRole(role, record, memberships) {
  const elevated =
    record.rolcanlogin ||
    record.rolsuper ||
    record.rolcreatedb ||
    record.rolcreaterole ||
    record.rolinherit ||
    record.rolreplication ||
    record.rolbypassrls ||
    Number(record.protected_ownership_count) !== 0;
  if (elevated || !Array.isArray(memberships) || memberships.length > 1) {
    throw new Error("Isolated restore backup ACL principal is missing or unsafe.");
  }
  if (memberships.length === 0) return;
  const membership = memberships[0];
  const safeCreatorBackReference =
    membership.granted_role === role &&
    membership.member_name === record.current_user &&
    membership.grantor_superuser === true &&
    membership.admin_option === true &&
    membership.inherit_option === false &&
    membership.set_option === false;
  if (!safeCreatorBackReference) {
    throw new Error("Isolated restore backup ACL principal is missing or unsafe.");
  }
}

function exactReadOnlyAuditAcl(value) {
  return (
    value.table_select === true &&
    value.table_insert === false &&
    value.table_update === false &&
    value.table_delete === false &&
    value.table_truncate === false &&
    value.table_trigger === false &&
    value.table_references === false &&
    value.sequence_select === true &&
    value.sequence_usage === false &&
    value.sequence_update === false
  );
}

function canonicalObject(value, label) {
  const text = requiredText(value, label);
  const match = CANONICAL_OBJECT.exec(text);
  if (!match) throw new Error(`ULC M5 ${label} is not canonical.`);
  return {
    literal: `${match[1]}.${match[2]}`,
    identifier: `"${match[1]}"."${match[2]}"`,
  };
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`ULC M5 ${label} is required.`);
  }
  return value.trim();
}

async function main() {
  const command = process.argv[2];
  const input = {
    restoreDatabaseUrl: process.env.APPBASIS_M4_RESTORE_DATABASE_URL,
    backupDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
  };
  if (command === "prepare") {
    await prepareInertRestoreBackupAclPrincipal(input);
    return;
  }
  if (command === "verify-cleanup") {
    await verifyAndCleanupRestoredBackupAuditAcl(input);
    return;
  }
  throw new Error("ULC M5 restore backup ACL command must be prepare or verify-cleanup.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  });
}

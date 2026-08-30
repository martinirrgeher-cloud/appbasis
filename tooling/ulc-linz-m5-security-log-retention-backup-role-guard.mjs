import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const BACKUP_ROLE_SQL = `
WITH protected_owner AS (
  SELECT owner_oid
  FROM (
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
      AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
      AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
  ) protected_objects
  GROUP BY owner_oid
  HAVING count(*) = 3
)
SELECT
  backup.rolcanlogin AS login,
  backup.rolsuper AS superuser,
  backup.rolcreatedb AS create_db,
  backup.rolcreaterole AS create_role,
  backup.rolreplication AS replication,
  backup.rolbypassrls AS bypass_rls,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = backup.oid
  ) AS membership_count,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.roleid = backup.oid
  ) AS reverse_membership_count,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
    JOIN protected_owner owner ON owner.owner_oid = member.oid
    WHERE membership.roleid = backup.oid
      AND grantor.rolsuper = true
      AND membership.admin_option = true
      AND membership.inherit_option = false
      AND membership.set_option = false
  ) AS safe_creator_back_reference_count,
  (SELECT count(*)::integer FROM protected_owner) AS protected_owner_count
FROM pg_catalog.pg_roles backup
WHERE backup.rolname = $1
`;

export async function verifyUlcLinzM5RetentionBackupRole(client, backupUsername) {
  if (client === null || typeof client !== "object" || typeof client.unsafe !== "function") {
    throw new Error("ULC M5-F retention SQL client is invalid.");
  }
  if (typeof backupUsername !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(backupUsername)) {
    throw new Error("ULC M5-F backup role name is invalid.");
  }

  const rows = await client.unsafe(BACKUP_ROLE_SQL, [backupUsername]);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F backup role evidence is invalid.");
  }
  const row = rows[0];
  const membershipCount = Number(row?.membership_count);
  const reverseMembershipCount = Number(row?.reverse_membership_count);
  const safeCreatorBackReferenceCount = Number(row?.safe_creator_back_reference_count);
  const protectedOwnerCount = Number(row?.protected_owner_count);
  if (
    row === null || typeof row !== "object" ||
    row.login !== true ||
    row.superuser !== false ||
    row.create_db !== false ||
    row.create_role !== false ||
    row.replication !== false ||
    row.bypass_rls !== false ||
    !Number.isInteger(membershipCount) || membershipCount !== 0 ||
    !Number.isInteger(reverseMembershipCount) || reverseMembershipCount < 0 ||
    !Number.isInteger(safeCreatorBackReferenceCount) || safeCreatorBackReferenceCount < 0 || safeCreatorBackReferenceCount > 1 ||
    protectedOwnerCount !== 1 ||
    reverseMembershipCount !== safeCreatorBackReferenceCount
  ) {
    throw new Error("ULC M5-F backup role is not least privilege at retention delete time.");
  }

  return true;
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  let connection;
  try {
    const cleanupDatabaseUrl = process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL;
    const sanitizedBackupDatabaseUrl = process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL;
    const cleanup = parseUlcLinzProductionDatabaseUrl(cleanupDatabaseUrl);
    const backup = parseUlcLinzProductionDatabaseUrl(sanitizedBackupDatabaseUrl);
    if (cleanup.host !== backup.host || cleanup.database !== backup.database || cleanup.user === backup.user) {
      throw new Error("ULC M5-F retention backup identity is not bound to the cleanup database.");
    }

    const { createPostgresDatabase } = await import("../packages/database/src/client.ts");
    connection = createPostgresDatabase(cleanupDatabaseUrl);
    await verifyUlcLinzM5RetentionBackupRole(connection.client, backup.user);
  } catch {
    console.error("ULC Linz M5-F backup role delete-time guard failed.");
    process.exitCode = 1;
  } finally {
    if (connection?.client !== undefined) {
      try {
        await connection.client.end();
      } catch {
        process.exitCode = 1;
      }
    }
  }
}

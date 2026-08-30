import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const BACKUP_ROLE_SQL = `
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
  ) AS reverse_membership_count
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
  if (
    row === null || typeof row !== "object" ||
    row.login !== true ||
    row.superuser !== false ||
    row.create_db !== false ||
    row.create_role !== false ||
    row.replication !== false ||
    row.bypass_rls !== false ||
    Number(row.membership_count) !== 0 ||
    Number(row.reverse_membership_count) !== 0
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

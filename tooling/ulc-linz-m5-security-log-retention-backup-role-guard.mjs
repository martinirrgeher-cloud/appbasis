import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const BACKUP_ROLE_SQL = `
WITH current_database_record AS (
  SELECT datdba
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), reverse_memberships AS (
  SELECT
    membership.member,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option,
    grantor.rolsuper AS grantor_superuser
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
  JOIN pg_catalog.pg_roles backup_role ON backup_role.oid = membership.roleid
  WHERE backup_role.rolname = $1
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
    FROM reverse_memberships
  ) AS reverse_membership_count,
  (
    SELECT count(*)::integer
    FROM reverse_memberships membership
    CROSS JOIN current_database_record database_record
    WHERE membership.member = database_record.datdba
      AND membership.grantor_superuser = true
      AND membership.admin_option = true
      AND membership.inherit_option = false
      AND membership.set_option = false
  ) AS safe_creator_back_reference_count,
  (
    SELECT count(*)::integer
    FROM reverse_memberships membership
    CROSS JOIN current_database_record database_record
    WHERE NOT (
      membership.member = database_record.datdba
      AND membership.grantor_superuser = true
      AND membership.admin_option = true
      AND membership.inherit_option = false
      AND membership.set_option = false
    )
  ) AS unsafe_reverse_membership_count,
  (SELECT count(*)::integer FROM current_database_record) AS database_record_count
FROM pg_catalog.pg_roles backup
WHERE backup.rolname = $1
`;

export async function collectUlcLinzM5RetentionBackupRoleSnapshot(client, backupUsername) {
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
  return Object.freeze({
    login: row?.login,
    superuser: row?.superuser,
    createDb: row?.create_db,
    createRole: row?.create_role,
    replication: row?.replication,
    bypassRls: row?.bypass_rls,
    membershipCount: Number(row?.membership_count),
    reverseMembershipCount: Number(row?.reverse_membership_count),
    safeCreatorBackReferenceCount: Number(row?.safe_creator_back_reference_count),
    unsafeReverseMembershipCount: Number(row?.unsafe_reverse_membership_count),
    databaseRecordCount: Number(row?.database_record_count),
  });
}

export function classifyUlcLinzM5RetentionBackupRoleSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return "invalid-observation";
  if (
    snapshot.login !== true || snapshot.superuser !== false || snapshot.createDb !== false ||
    snapshot.createRole !== false || snapshot.replication !== false || snapshot.bypassRls !== false
  ) return "role-attributes";
  if (!Number.isInteger(snapshot.membershipCount) || snapshot.membershipCount !== 0) return "incoming-membership";
  if (!Number.isInteger(snapshot.databaseRecordCount) || snapshot.databaseRecordCount !== 1) return "database-record";
  if (!Number.isInteger(snapshot.reverseMembershipCount) || snapshot.reverseMembershipCount < 0) return "reverse-membership-count";
  if (
    !Number.isInteger(snapshot.safeCreatorBackReferenceCount) ||
    snapshot.safeCreatorBackReferenceCount < 0 || snapshot.safeCreatorBackReferenceCount > 1
  ) return "safe-creator-back-reference";
  if (!Number.isInteger(snapshot.unsafeReverseMembershipCount) || snapshot.unsafeReverseMembershipCount !== 0) {
    return "unsafe-reverse-membership";
  }
  if (snapshot.reverseMembershipCount !== snapshot.safeCreatorBackReferenceCount) return "reverse-membership-mismatch";
  return "ok";
}

export async function verifyUlcLinzM5RetentionBackupRole(client, backupUsername) {
  const snapshot = await collectUlcLinzM5RetentionBackupRoleSnapshot(client, backupUsername);
  if (classifyUlcLinzM5RetentionBackupRoleSnapshot(snapshot) !== "ok") {
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
    const snapshot = await collectUlcLinzM5RetentionBackupRoleSnapshot(connection.client, backup.user);
    const classification = classifyUlcLinzM5RetentionBackupRoleSnapshot(snapshot);
    if (process.argv.includes("--diagnostic")) {
      process.stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        evidenceSource: "read-only-backup-role-diagnostic",
        classification,
        productionMutationPerformed: false,
        productionReleaseAuthorized: false,
      })}\n`);
    } else if (classification !== "ok") {
      throw new Error("ULC M5-F backup role is not least privilege at retention delete time.");
    }
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

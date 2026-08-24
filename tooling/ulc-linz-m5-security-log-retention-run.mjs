import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const ACCESS_SQL = `
SELECT
  pg_has_role(current_user, 'ulc_linz_security_event_cleanup', 'member') AS cleanup_member,
  current_role.rolsuper AS superuser,
  current_role.rolcreatedb AS create_db,
  current_role.rolcreaterole AS create_role,
  current_role.rolreplication AS replication,
  current_role.rolbypassrls AS bypass_rls,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    WHERE member.rolname = current_user
  ) AS membership_count,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    WHERE member.rolname = current_user
      AND parent.rolname = 'ulc_linz_security_event_cleanup'
      AND membership.admin_option
  ) AS cleanup_admin_option,
  has_function_privilege(current_user, 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) acl
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
      AND procedure.pronargs = 0
      AND acl.grantee = current_role.oid
      AND acl.privilege_type = 'EXECUTE'
      AND acl.is_grantable
  ) AS cleanup_execute_grant_option,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'SELECT') AS direct_select,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'DELETE') AS direct_delete,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'INSERT') AS direct_insert,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'UPDATE') AS direct_update,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'TRUNCATE') AS direct_truncate,
  has_column_privilege(current_user, 'public.ulc_linz_security_event_log', 'retained_until', 'SELECT') AS retention_read,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(attribute.attacl, ARRAY[]::aclitem[])) acl
    WHERE attribute.attrelid = 'public.ulc_linz_security_event_log'::regclass
      AND attribute.attname = 'retained_until'
      AND acl.grantee = current_role.oid
      AND acl.privilege_type = 'SELECT'
      AND acl.is_grantable
  ) AS retention_read_grant_option,
  has_column_privilege(current_user, 'public.ulc_linz_security_event_log', 'target_id', 'SELECT') AS event_read,
  has_sequence_privilege(current_user, 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS sequence_usage,
  has_sequence_privilege(current_user, 'public.ulc_linz_security_event_log_id_seq', 'SELECT') AS sequence_select,
  has_sequence_privilege(current_user, 'public.ulc_linz_security_event_log_id_seq', 'UPDATE') AS sequence_update
FROM pg_catalog.pg_roles current_role
WHERE current_role.rolname = current_user
`;

const SNAPSHOT_SQL = `
SELECT
  statement_timestamp() AS observed_at,
  COUNT(retained_until) FILTER (WHERE retained_until < statement_timestamp())::text AS expired_rows
FROM ulc_linz_security_event_log
`;

export async function runUlcLinzM5SecurityLogRetention(
  client,
  purgeExpiredSecurityEvents,
) {
  if (client === null || typeof client !== "object" || typeof client.unsafe !== "function") {
    throw new Error("ULC M5-F retention SQL client is invalid.");
  }
  if (typeof purgeExpiredSecurityEvents !== "function") {
    throw new Error("ULC M5-F retention cleanup executor is invalid.");
  }

  await verifyCleanupPrincipal(client);
  await readSnapshot(client);
  await purgeExpiredSecurityEvents(client);
  const after = await readSnapshot(client);
  if (after.expiredRows !== 0n) {
    throw new Error("ULC M5-F retention cleanup left expired security events behind.");
  }

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "controlled-production-retention-run",
    observedAt: after.observedAt,
    cleanupAccessVerified: true,
    cleanupSucceeded: true,
    cleanupResultVerified: true,
    expiredRowsRemaining: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
    productionReleaseAuthorized: false,
  });
}

async function verifyCleanupPrincipal(client) {
  const rows = await client.unsafe(ACCESS_SQL);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F cleanup access evidence is invalid.");
  }
  const row = rows[0];
  if (
    row === null || typeof row !== "object" ||
    row.cleanup_member !== true ||
    row.superuser !== false ||
    row.create_db !== false ||
    row.create_role !== false ||
    row.replication !== false ||
    row.bypass_rls !== false ||
    Number(row.membership_count) !== 1 ||
    row.cleanup_admin_option !== false ||
    row.cleanup_execute !== true ||
    row.cleanup_execute_grant_option !== false ||
    row.direct_select !== false ||
    row.direct_delete !== false ||
    row.direct_insert !== false ||
    row.direct_update !== false ||
    row.direct_truncate !== false ||
    row.retention_read !== true ||
    row.retention_read_grant_option !== false ||
    row.event_read !== false ||
    row.sequence_usage !== false ||
    row.sequence_select !== false ||
    row.sequence_update !== false
  ) {
    throw new Error("ULC M5-F cleanup principal is not least privilege.");
  }
}

async function readSnapshot(client) {
  const rows = await client.unsafe(SNAPSHOT_SQL);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F retention snapshot is invalid.");
  }
  const row = rows[0];
  if (row === null || typeof row !== "object") {
    throw new Error("ULC M5-F retention snapshot is invalid.");
  }
  const observedAt = new Date(row.observed_at);
  if (!Number.isFinite(observedAt.getTime())) {
    throw new Error("ULC M5-F retention database clock is invalid.");
  }
  let expiredRows;
  try {
    expiredRows = BigInt(row.expired_rows);
  } catch {
    throw new Error("ULC M5-F retention expired-row count is invalid.");
  }
  if (expiredRows < 0n) {
    throw new Error("ULC M5-F retention expired-row count is invalid.");
  }
  return Object.freeze({
    observedAt: observedAt.toISOString(),
    expiredRows,
  });
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  let connection;
  try {
    const databaseUrl = process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL;
    parseUlcLinzProductionDatabaseUrl(databaseUrl);

    const [{ createPostgresDatabase }, { purgeExpiredUlcLinzSecurityEvents }] = await Promise.all([
      import("../packages/database/src/client.ts"),
      import("../apps/ulc-linz/worker/security-events-postgres.ts"),
    ]);
    connection = createPostgresDatabase(databaseUrl);
    const result = await runUlcLinzM5SecurityLogRetention(
      connection.client,
      purgeExpiredUlcLinzSecurityEvents,
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    console.error("ULC Linz M5-F production retention cleanup failed.");
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

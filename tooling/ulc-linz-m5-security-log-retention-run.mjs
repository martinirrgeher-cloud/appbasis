import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const ACCESS_SQL = `
WITH protected_acl AS (
  SELECT
    'table'::text AS object_kind,
    relation.relname::text AS object_name,
    NULL::text AS column_name,
    relation.relowner AS owner_oid,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) acl
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'ulc_linz_security_event_log'
  UNION ALL
  SELECT
    'sequence'::text,
    relation.relname::text,
    NULL::text,
    relation.relowner,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('S', relation.relowner))
  ) acl
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'ulc_linz_security_event_log_id_seq'
  UNION ALL
  SELECT
    'column'::text,
    relation.relname::text,
    attribute.attname::text,
    relation.relowner,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_attribute attribute
  JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(attribute.attacl, ARRAY[]::aclitem[])) acl
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'ulc_linz_security_event_log'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
  UNION ALL
  SELECT
    'function'::text,
    procedure.proname::text,
    NULL::text,
    procedure.proowner,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) acl
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
    AND procedure.pronargs = 0
), protected_object_owner AS (
  SELECT CASE
    WHEN count(*) = 3 AND count(DISTINCT owner_oid) = 1 THEN min(owner_oid)
    ELSE NULL
  END AS owner_oid
  FROM (
    SELECT relation.relowner AS owner_oid
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('ulc_linz_security_event_log', 'ulc_linz_security_event_log_id_seq')
    UNION ALL
    SELECT procedure.proowner
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
      AND procedure.pronargs = 0
  ) protected_owner
), protected_group_membership AS (
  SELECT
    parent.rolname AS group_role,
    count(*) FILTER (
      WHERE membership.admin_option = false
        AND membership.inherit_option = true
        AND membership.set_option = true
    )::integer AS operational_member_count,
    count(*) FILTER (
      WHERE protected_object_owner.owner_oid IS NOT NULL
        AND member.oid = protected_object_owner.owner_oid
        AND grantor.rolsuper = true
        AND membership.admin_option = true
        AND membership.inherit_option = false
        AND membership.set_option = false
    )::integer AS creator_back_reference_count,
    count(*) FILTER (
      WHERE NOT (
        (
          membership.admin_option = false
          AND membership.inherit_option = true
          AND membership.set_option = true
        ) OR (
          protected_object_owner.owner_oid IS NOT NULL
          AND member.oid = protected_object_owner.owner_oid
          AND grantor.rolsuper = true
          AND membership.admin_option = true
          AND membership.inherit_option = false
          AND membership.set_option = false
        )
      )
    )::integer AS unexpected_member_count
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = membership.member
  JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
  CROSS JOIN protected_object_owner
  WHERE parent.rolname IN (
    'ulc_linz_security_event_ingest',
    'ulc_linz_security_event_cleanup',
    'ulc_linz_security_event_read'
  )
  GROUP BY parent.rolname
), protected_group_parent_membership AS (
  SELECT
    member.rolname AS group_role,
    count(*)::integer AS parent_membership_count
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles member ON member.oid = membership.member
  WHERE member.rolname IN (
    'ulc_linz_security_event_ingest',
    'ulc_linz_security_event_cleanup',
    'ulc_linz_security_event_read'
  )
  GROUP BY member.rolname
)
SELECT
  pg_has_role(current_user, 'ulc_linz_security_event_cleanup', 'member') AS cleanup_member,
  current_role.rolcanlogin AS login,
  current_role.rolsuper AS superuser,
  current_role.rolcreatedb AS create_db,
  current_role.rolcreaterole AS create_role,
  current_role.rolreplication AS replication,
  current_role.rolbypassrls AS bypass_rls,
  cleanup_group.rolcanlogin AS cleanup_group_login,
  cleanup_group.rolsuper AS cleanup_group_superuser,
  cleanup_group.rolcreatedb AS cleanup_group_create_db,
  cleanup_group.rolcreaterole AS cleanup_group_create_role,
  cleanup_group.rolreplication AS cleanup_group_replication,
  cleanup_group.rolbypassrls AS cleanup_group_bypass_rls,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = current_role.oid
  ) AS membership_count,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = current_role.oid
      AND membership.roleid = cleanup_group.oid
      AND membership.admin_option
  ) AS cleanup_admin_option,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.roleid = current_role.oid
  ) AS reverse_membership_count,
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = cleanup_group.oid
  ) AS cleanup_group_membership_count,
  COALESCE((
    SELECT operational_member_count
    FROM protected_group_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) AS cleanup_group_operational_member_count,
  COALESCE((
    SELECT creator_back_reference_count
    FROM protected_group_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) AS cleanup_group_creator_back_reference_count,
  COALESCE((
    SELECT unexpected_member_count
    FROM protected_group_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) AS cleanup_group_unexpected_member_count,
  has_function_privilege(current_user, 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'SELECT') AS direct_select,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'DELETE') AS direct_delete,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'INSERT') AS direct_insert,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'UPDATE') AS direct_update,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'TRUNCATE') AS direct_truncate,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'TRIGGER') AS direct_trigger,
  has_table_privilege(current_user, 'public.ulc_linz_security_event_log', 'REFERENCES') AS direct_references,
  has_column_privilege(current_user, 'public.ulc_linz_security_event_log', 'retained_until', 'SELECT') AS retention_read,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.ulc_linz_security_event_log'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attname <> 'retained_until'
      AND pg_catalog.has_column_privilege(
        current_user,
        'public.ulc_linz_security_event_log',
        attribute.attname,
        'SELECT'
      )
  ) AS forbidden_column_select,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.ulc_linz_security_event_log'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        pg_catalog.has_column_privilege(
          current_user,
          'public.ulc_linz_security_event_log',
          attribute.attname,
          'INSERT'
        ) OR
        pg_catalog.has_column_privilege(
          current_user,
          'public.ulc_linz_security_event_log',
          attribute.attname,
          'UPDATE'
        ) OR
        pg_catalog.has_column_privilege(
          current_user,
          'public.ulc_linz_security_event_log',
          attribute.attname,
          'REFERENCES'
        )
      )
  ) AS forbidden_column_mutation,
  has_sequence_privilege(current_user, 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS sequence_usage,
  has_sequence_privilege(current_user, 'public.ulc_linz_security_event_log_id_seq', 'SELECT') AS sequence_select,
  has_sequence_privilege(current_user, 'public.ulc_linz_security_event_log_id_seq', 'UPDATE') AS sequence_update,
  (
    SELECT count(*)::integer
    FROM (
      SELECT relation.relowner AS owner_oid
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('ulc_linz_security_event_log', 'ulc_linz_security_event_log_id_seq')
      UNION ALL
      SELECT procedure.proowner
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
        AND procedure.pronargs = 0
    ) protected_owner
    WHERE protected_owner.owner_oid IN (current_role.oid, cleanup_group.oid)
  ) AS protected_object_owner_count,
  (
    SELECT count(*)::integer
    FROM protected_acl acl
    WHERE acl.grantee = cleanup_group.oid
      AND acl.is_grantable = false
      AND (
        (
          acl.object_kind = 'column'
          AND acl.object_name = 'ulc_linz_security_event_log'
          AND acl.column_name = 'retained_until'
          AND acl.privilege_type = 'SELECT'
        ) OR
        (
          acl.object_kind = 'function'
          AND acl.object_name = 'appbasis_ulc_linz_purge_expired_security_events'
          AND acl.column_name IS NULL
          AND acl.privilege_type = 'EXECUTE'
        )
      )
  ) AS expected_cleanup_acl_count,
  (
    SELECT CASE
      WHEN count(*) FILTER (
        WHERE acl.grantee <> acl.owner_oid
          AND acl.is_grantable = false
          AND (
            (
              acl.grantee = ingest_group.oid
              AND acl.object_kind = 'column'
              AND acl.object_name = 'ulc_linz_security_event_log'
              AND acl.column_name IN (
                'schema_version', 'app_id', 'category', 'event_type', 'occurred_at',
                'actor_principal_id', 'organization_id', 'action', 'target_type',
                'target_id', 'operation', 'http_status', 'error_code', 'reason_code',
                'retained_until'
              )
              AND acl.privilege_type = 'INSERT'
            ) OR
            (
              acl.grantee = ingest_group.oid
              AND acl.object_kind = 'sequence'
              AND acl.object_name = 'ulc_linz_security_event_log_id_seq'
              AND acl.column_name IS NULL
              AND acl.privilege_type = 'USAGE'
            ) OR
            (
              acl.grantee = cleanup_group.oid
              AND acl.object_kind = 'column'
              AND acl.object_name = 'ulc_linz_security_event_log'
              AND acl.column_name = 'retained_until'
              AND acl.privilege_type = 'SELECT'
            ) OR
            (
              acl.grantee = cleanup_group.oid
              AND acl.object_kind = 'function'
              AND acl.object_name = 'appbasis_ulc_linz_purge_expired_security_events'
              AND acl.column_name IS NULL
              AND acl.privilege_type = 'EXECUTE'
            ) OR
            (
              acl.grantee = read_group.oid
              AND acl.object_kind = 'table'
              AND acl.object_name = 'ulc_linz_security_event_log'
              AND acl.column_name IS NULL
              AND acl.privilege_type = 'SELECT'
            ) OR
            (
              acl.grantee = backup_role.oid
              AND acl.object_kind = 'table'
              AND acl.object_name = 'ulc_linz_security_event_log'
              AND acl.column_name IS NULL
              AND acl.privilege_type = 'SELECT'
            ) OR
            (
              acl.grantee = backup_role.oid
              AND acl.object_kind = 'sequence'
              AND acl.object_name = 'ulc_linz_security_event_log_id_seq'
              AND acl.column_name IS NULL
              AND acl.privilege_type = 'SELECT'
            )
          )
      ) = 21
      AND count(*) FILTER (
        WHERE acl.grantee <> acl.owner_oid
          AND NOT (
            acl.is_grantable = false
            AND (
              (
                acl.grantee = ingest_group.oid
                AND acl.object_kind = 'column'
                AND acl.object_name = 'ulc_linz_security_event_log'
                AND acl.column_name IN (
                  'schema_version', 'app_id', 'category', 'event_type', 'occurred_at',
                  'actor_principal_id', 'organization_id', 'action', 'target_type',
                  'target_id', 'operation', 'http_status', 'error_code', 'reason_code',
                  'retained_until'
                )
                AND acl.privilege_type = 'INSERT'
              ) OR
              (
                acl.grantee = ingest_group.oid
                AND acl.object_kind = 'sequence'
                AND acl.object_name = 'ulc_linz_security_event_log_id_seq'
                AND acl.column_name IS NULL
                AND acl.privilege_type = 'USAGE'
              ) OR
              (
                acl.grantee = cleanup_group.oid
                AND acl.object_kind = 'column'
                AND acl.object_name = 'ulc_linz_security_event_log'
                AND acl.column_name = 'retained_until'
                AND acl.privilege_type = 'SELECT'
              ) OR
              (
                acl.grantee = cleanup_group.oid
                AND acl.object_kind = 'function'
                AND acl.object_name = 'appbasis_ulc_linz_purge_expired_security_events'
                AND acl.column_name IS NULL
                AND acl.privilege_type = 'EXECUTE'
              ) OR
              (
                acl.grantee = read_group.oid
                AND acl.object_kind = 'table'
                AND acl.object_name = 'ulc_linz_security_event_log'
                AND acl.column_name IS NULL
                AND acl.privilege_type = 'SELECT'
              ) OR
              (
                acl.grantee = backup_role.oid
                AND acl.object_kind = 'table'
                AND acl.object_name = 'ulc_linz_security_event_log'
                AND acl.column_name IS NULL
                AND acl.privilege_type = 'SELECT'
              ) OR
              (
                acl.grantee = backup_role.oid
                AND acl.object_kind = 'sequence'
                AND acl.object_name = 'ulc_linz_security_event_log_id_seq'
                AND acl.column_name IS NULL
                AND acl.privilege_type = 'SELECT'
              )
            )
          )
      ) = 0
      THEN 0
      ELSE 1
    END::integer
    FROM protected_acl acl
  ) AS unexpected_cleanup_acl_count
FROM pg_catalog.pg_roles current_role
CROSS JOIN pg_catalog.pg_roles cleanup_group
CROSS JOIN pg_catalog.pg_roles ingest_group
CROSS JOIN pg_catalog.pg_roles read_group
CROSS JOIN pg_catalog.pg_roles backup_role
WHERE current_role.rolname = current_user
  AND cleanup_group.rolname = 'ulc_linz_security_event_cleanup'
  AND ingest_group.rolname = 'ulc_linz_security_event_ingest'
  AND read_group.rolname = 'ulc_linz_security_event_read'
  AND backup_role.rolname = $1
  AND COALESCE((
    SELECT operational_member_count
    FROM protected_group_membership
    WHERE group_role = ingest_group.rolname
  ), 0) = 1
  AND COALESCE((
    SELECT creator_back_reference_count
    FROM protected_group_membership
    WHERE group_role = ingest_group.rolname
  ), 0) <= 1
  AND COALESCE((
    SELECT unexpected_member_count
    FROM protected_group_membership
    WHERE group_role = ingest_group.rolname
  ), 0) = 0
  AND COALESCE((
    SELECT parent_membership_count
    FROM protected_group_parent_membership
    WHERE group_role = ingest_group.rolname
  ), 0) = 0
  AND COALESCE((
    SELECT operational_member_count
    FROM protected_group_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) = 1
  AND COALESCE((
    SELECT creator_back_reference_count
    FROM protected_group_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) <= 1
  AND COALESCE((
    SELECT unexpected_member_count
    FROM protected_group_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) = 0
  AND COALESCE((
    SELECT parent_membership_count
    FROM protected_group_parent_membership
    WHERE group_role = cleanup_group.rolname
  ), 0) = 0
  AND COALESCE((
    SELECT operational_member_count
    FROM protected_group_membership
    WHERE group_role = read_group.rolname
  ), 0) = 1
  AND COALESCE((
    SELECT creator_back_reference_count
    FROM protected_group_membership
    WHERE group_role = read_group.rolname
  ), 0) <= 1
  AND COALESCE((
    SELECT unexpected_member_count
    FROM protected_group_membership
    WHERE group_role = read_group.rolname
  ), 0) = 0
  AND COALESCE((
    SELECT parent_membership_count
    FROM protected_group_parent_membership
    WHERE group_role = read_group.rolname
  ), 0) = 0
`;

const VERIFY_PURGE_SQL = `
SELECT COUNT(retained_until)::text AS expired_rows
FROM ulc_linz_security_event_log
WHERE retained_until < $1::timestamptz
`;

export async function runUlcLinzM5SecurityLogRetention(
  client,
  purgeExpiredSecurityEvents,
  backupUsername,
) {
  if (client === null || typeof client !== "object" || typeof client.unsafe !== "function") {
    throw new Error("ULC M5-F retention SQL client is invalid.");
  }
  if (typeof purgeExpiredSecurityEvents !== "function") {
    throw new Error("ULC M5-F retention cleanup executor is invalid.");
  }

  await verifyCleanupPrincipal(client, backupUsername);
  const purge = parsePurgeResult(await purgeExpiredSecurityEvents(client));
  const expiredRows = await countExpiredRowsAtCutoff(client, purge.cutoff);
  if (expiredRows !== 0n) {
    throw new Error("ULC M5-F retention cleanup left expired security events behind.");
  }

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "controlled-production-retention-run",
    observedAt: purge.cutoff,
    cleanupAccessVerified: true,
    cleanupSucceeded: true,
    cleanupResultVerified: true,
    expiredRowsRemaining: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
    productionReleaseAuthorized: false,
  });
}

async function verifyCleanupPrincipal(client, backupUsername) {
  const rows = await client.unsafe(ACCESS_SQL, [backupUsername ?? null]);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F cleanup access evidence is invalid.");
  }
  const row = rows[0];
  if (
    row === null || typeof row !== "object" ||
    row.cleanup_member !== true ||
    row.login !== true ||
    row.superuser !== false ||
    row.create_db !== false ||
    row.create_role !== false ||
    row.replication !== false ||
    row.bypass_rls !== false ||
    row.cleanup_group_login !== false ||
    row.cleanup_group_superuser !== false ||
    row.cleanup_group_create_db !== false ||
    row.cleanup_group_create_role !== false ||
    row.cleanup_group_replication !== false ||
    row.cleanup_group_bypass_rls !== false ||
    Number(row.membership_count) !== 1 ||
    row.cleanup_admin_option !== false ||
    Number(row.reverse_membership_count) !== 0 ||
    Number(row.cleanup_group_membership_count) !== 0 ||
    Number(row.cleanup_group_operational_member_count) !== 1 ||
    ![0, 1].includes(Number(row.cleanup_group_creator_back_reference_count)) ||
    Number(row.cleanup_group_unexpected_member_count) !== 0 ||
    row.cleanup_execute !== true ||
    row.direct_select !== false ||
    row.direct_delete !== false ||
    row.direct_insert !== false ||
    row.direct_update !== false ||
    row.direct_truncate !== false ||
    row.direct_trigger !== false ||
    row.direct_references !== false ||
    row.retention_read !== true ||
    row.forbidden_column_select !== false ||
    row.forbidden_column_mutation !== false ||
    row.sequence_usage !== false ||
    row.sequence_select !== false ||
    row.sequence_update !== false ||
    Number(row.protected_object_owner_count) !== 0 ||
    Number(row.expected_cleanup_acl_count) !== 2 ||
    Number(row.unexpected_cleanup_acl_count) !== 0
  ) {
    throw new Error("ULC M5-F cleanup principal is not least privilege.");
  }
}

function parsePurgeResult(value) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "cutoff") || !Object.hasOwn(value, "deletedRows")
  ) {
    throw new Error("ULC M5-F retention purge result is invalid.");
  }
  const cutoff = new Date(value.cutoff);
  if (typeof value.cutoff !== "string" || !Number.isFinite(cutoff.getTime()) || cutoff.toISOString() !== value.cutoff) {
    throw new Error("ULC M5-F retention purge cutoff is invalid.");
  }
  let deletedRows;
  try {
    deletedRows = BigInt(value.deletedRows);
  } catch {
    throw new Error("ULC M5-F retention purge count is invalid.");
  }
  if (deletedRows < 0n) {
    throw new Error("ULC M5-F retention purge count is invalid.");
  }
  return Object.freeze({ cutoff: cutoff.toISOString(), deletedRows });
}

async function countExpiredRowsAtCutoff(client, cutoff) {
  const rows = await client.unsafe(VERIFY_PURGE_SQL, [cutoff]);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F retention verification is invalid.");
  }
  const row = rows[0];
  if (row === null || typeof row !== "object") {
    throw new Error("ULC M5-F retention verification is invalid.");
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
  return expiredRows;
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  let connection;
  try {
    const databaseUrl = process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL;
    const backupDatabaseUrl = process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL;
    const cleanup = parseUlcLinzProductionDatabaseUrl(databaseUrl);
    const backup = parseUlcLinzProductionDatabaseUrl(backupDatabaseUrl);
    if (cleanup.host !== backup.host || cleanup.database !== backup.database || cleanup.user === backup.user) {
      throw new Error("ULC M5-F retention backup credential is not bound to the cleanup database.");
    }

    const [{ createPostgresDatabase }, { purgeExpiredUlcLinzSecurityEvents }] = await Promise.all([
      import("../packages/database/src/client.ts"),
      import("../apps/ulc-linz/worker/security-events-postgres.ts"),
    ]);
    connection = createPostgresDatabase(databaseUrl);
    const result = await runUlcLinzM5SecurityLogRetention(
      connection.client,
      purgeExpiredUlcLinzSecurityEvents,
      backup.user,
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

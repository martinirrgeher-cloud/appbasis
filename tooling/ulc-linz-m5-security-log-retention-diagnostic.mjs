import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const DIAGNOSTIC_SQL = `
WITH protected_objects AS (
  SELECT
    to_regclass('public.ulc_linz_security_event_log') AS event_log,
    to_regclass('public.ulc_linz_security_event_log_id_seq') AS event_sequence,
    to_regprocedure('public.appbasis_ulc_linz_purge_expired_security_events()') AS purge_function
), metadata AS (
  SELECT
    protected_objects.event_log IS NOT NULL AS event_log_exists,
    protected_objects.event_sequence IS NOT NULL AS event_sequence_exists,
    protected_objects.purge_function IS NOT NULL AS purge_function_exists,
    procedure.prosecdef AS purge_security_definer,
    procedure.proconfig = ARRAY['search_path=pg_catalog']::text[] AS purge_search_path_pinned,
    table_class.relowner = sequence_class.relowner
      AND table_class.relowner = procedure.proowner AS protected_owner_aligned
  FROM protected_objects
  LEFT JOIN pg_catalog.pg_class table_class
    ON table_class.oid = protected_objects.event_log
  LEFT JOIN pg_catalog.pg_class sequence_class
    ON sequence_class.oid = protected_objects.event_sequence
  LEFT JOIN pg_catalog.pg_proc procedure
    ON procedure.oid = protected_objects.purge_function
)
SELECT
  metadata.event_log_exists,
  metadata.event_sequence_exists,
  metadata.purge_function_exists,
  metadata.purge_security_definer,
  metadata.purge_search_path_pinned,
  metadata.protected_owner_aligned,
  has_function_privilege(
    current_user,
    'public.appbasis_ulc_linz_purge_expired_security_events()',
    'EXECUTE'
  ) AS cleanup_execute,
  has_column_privilege(
    current_user,
    'public.ulc_linz_security_event_log',
    'retained_until',
    'SELECT'
  ) AS retention_read,
  has_table_privilege(
    current_user,
    'public.ulc_linz_security_event_log',
    'DELETE'
  ) AS direct_delete,
  EXISTS (
    SELECT 1
    FROM public.ulc_linz_security_event_log
    WHERE retained_until < statement_timestamp()
  ) AS expired_rows_present,
  statement_timestamp()::text AS observed_at
FROM metadata
`;

export function evaluateUlcLinzM5RetentionDiagnostic(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return Object.freeze({ classification: "invalid-observation" });
  }

  const requiredTrue = [
    "event_log_exists",
    "event_sequence_exists",
    "purge_function_exists",
    "purge_security_definer",
    "purge_search_path_pinned",
    "protected_owner_aligned",
    "cleanup_execute",
    "retention_read",
  ];
  if (requiredTrue.some((key) => row[key] !== true) || row.direct_delete !== false) {
    return Object.freeze({ classification: "contract-drift" });
  }
  if (row.expired_rows_present === true) {
    return Object.freeze({ classification: "expired-rows-present" });
  }
  if (row.expired_rows_present !== false) {
    return Object.freeze({ classification: "invalid-observation" });
  }
  return Object.freeze({ classification: "read-only-preconditions-ok" });
}

export async function collectUlcLinzM5RetentionDiagnostic(client) {
  if (client === null || typeof client !== "object" || typeof client.unsafe !== "function") {
    throw new Error("ULC M5-F retention diagnostic client is invalid.");
  }
  const rows = await client.unsafe(DIAGNOSTIC_SQL);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F retention diagnostic observation is invalid.");
  }
  const evaluated = evaluateUlcLinzM5RetentionDiagnostic(rows[0]);
  if (evaluated.classification === "invalid-observation") {
    throw new Error("ULC M5-F retention diagnostic observation is invalid.");
  }
  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "read-only-retention-diagnostic",
    classification: evaluated.classification,
    productionMutationPerformed: false,
    productionReleaseAuthorized: false,
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
    const { createPostgresDatabase } = await import("../packages/database/src/client.ts");
    connection = createPostgresDatabase(databaseUrl);
    const result = await collectUlcLinzM5RetentionDiagnostic(connection.client);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    console.error("ULC Linz M5-F retention diagnostic failed.");
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

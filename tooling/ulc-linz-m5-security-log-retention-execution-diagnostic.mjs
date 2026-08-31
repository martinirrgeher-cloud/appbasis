import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const PURGE_CONTRACT_SQL = `
SELECT
  procedure.prosecdef AS security_definer,
  procedure.provolatile = 'v' AS volatile,
  procedure.prokind = 'f' AS ordinary_function,
  procedure.proconfig AS config,
  pg_catalog.pg_get_functiondef(procedure.oid) AS definition,
  has_function_privilege(current_user, procedure.oid, 'EXECUTE') AS executable
FROM pg_catalog.pg_proc procedure
JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
  AND procedure.pronargs = 0
`;

const DATABASE_CLOCK_SQL = `
SELECT statement_timestamp() AS cutoff
`;

const RESIDUAL_ROWS_ERROR = "ULC M5-F retention cleanup left expired security events behind.";

const FAILURE_PHASES = Object.freeze({
  "ULC M5-F retention execution diagnostic client is invalid.": "client",
  "ULC M5-F retention execution diagnostic backup principal is invalid.": "backup-principal",
  "ULC M5-F retention execution diagnostic purge contract failed.": "purge-contract",
  "ULC M5-F retention execution diagnostic database clock failed.": "database-clock",
  "ULC M5-F retention execution diagnostic cleanup path failed.": "cleanup-path",
  "ULC M5-F retention execution diagnostic database client import failed.": "database-client-import",
  "ULC M5-F retention execution diagnostic database client creation failed.": "database-client-create",
});

export function classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error) {
  if (error === null || typeof error !== "object" || typeof error.message !== "string") {
    return "unknown";
  }
  return Object.hasOwn(FAILURE_PHASES, error.message) ? FAILURE_PHASES[error.message] : "unknown";
}

export async function collectUlcLinzM5RetentionExecutionDiagnostic(client, backupUsername) {
  const clientType = typeof client;
  if (
    client === null ||
    (clientType !== "object" && clientType !== "function") ||
    typeof client.unsafe !== "function"
  ) {
    throw new Error("ULC M5-F retention execution diagnostic client is invalid.");
  }
  if (typeof backupUsername !== "string" || backupUsername.length === 0) {
    throw new Error("ULC M5-F retention execution diagnostic backup principal is invalid.");
  }

  try {
    const rows = await client.unsafe(PURGE_CONTRACT_SQL);
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    const config = row !== null && typeof row === "object" && Array.isArray(row.config) ? row.config : [];
    const definition = row !== null && typeof row === "object"
      ? String(row.definition ?? "").replaceAll(/\s+/gu, " ")
      : "";
    if (
      row === null ||
      typeof row !== "object" ||
      row.security_definer !== true ||
      row.volatile !== true ||
      row.ordinary_function !== true ||
      row.executable !== true ||
      !config.some((entry) => String(entry).replaceAll(" ", "") === "search_path=pg_catalog") ||
      !definition.includes("DELETE FROM public.ulc_linz_security_event_log") ||
      !definition.includes("retained_until < statement_timestamp()")
    ) {
      throw new Error("invalid purge contract");
    }
  } catch {
    throw new Error("ULC M5-F retention execution diagnostic purge contract failed.");
  }

  let cutoff;
  try {
    const rows = await client.unsafe(DATABASE_CLOCK_SQL);
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== "object") {
      throw new Error("invalid clock");
    }
    const parsed = new Date(rows[0].cutoff);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error("invalid clock");
    }
    cutoff = parsed.toISOString();
  } catch {
    throw new Error("ULC M5-F retention execution diagnostic database clock failed.");
  }

  let residualExpiredRowsPresent = false;
  try {
    const result = await runUlcLinzM5SecurityLogRetention(
      client,
      async () => Object.freeze({ cutoff, deletedRows: "0" }),
      backupUsername,
    );
    if (
      result?.cleanupAccessVerified !== true ||
      result?.cleanupSucceeded !== true ||
      result?.cleanupResultVerified !== true ||
      result?.expiredRowsRemaining !== false ||
      result?.productionReleaseAuthorized !== false
    ) {
      throw new Error("invalid result");
    }
  } catch (error) {
    if (error !== null && typeof error === "object" && error.message === RESIDUAL_ROWS_ERROR) {
      residualExpiredRowsPresent = true;
    } else {
      throw new Error("ULC M5-F retention execution diagnostic cleanup path failed.");
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    classification: residualExpiredRowsPresent
      ? "read-only-cleanup-path-reachable-with-residual-rows"
      : "read-only-cleanup-path-ok",
    purgeContractVerified: true,
    cleanupAccessVerified: true,
    cleanupResultVerificationReachable: true,
    residualExpiredRowsPresent,
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
    const backupDatabaseUrl = process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL;
    const cleanup = parseUlcLinzProductionDatabaseUrl(databaseUrl);
    const backup = parseUlcLinzProductionDatabaseUrl(backupDatabaseUrl);
    if (cleanup.host !== backup.host || cleanup.database !== backup.database || cleanup.user === backup.user) {
      throw new Error("ULC M5-F retention execution diagnostic backup principal is invalid.");
    }

    let createPostgresDatabase;
    try {
      ({ createPostgresDatabase } = await import("../packages/database/src/client.ts"));
    } catch {
      throw new Error("ULC M5-F retention execution diagnostic database client import failed.");
    }

    try {
      connection = createPostgresDatabase(databaseUrl);
    } catch {
      throw new Error("ULC M5-F retention execution diagnostic database client creation failed.");
    }

    const result = await collectUlcLinzM5RetentionExecutionDiagnostic(connection.client, backup.user);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const phase = classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error);
    process.stderr.write(`${JSON.stringify({ classification: "failed", phase })}\n`);
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

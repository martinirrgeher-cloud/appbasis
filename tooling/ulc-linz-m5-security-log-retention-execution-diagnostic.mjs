import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const PURGE_PLAN_SQL = `
EXPLAIN (FORMAT JSON)
SELECT public.appbasis_ulc_linz_purge_expired_security_events()
`;

const DATABASE_CLOCK_SQL = `
SELECT statement_timestamp() AS cutoff
`;

const FAILURE_PHASES = Object.freeze({
  "ULC M5-F retention execution diagnostic client is invalid.": "client",
  "ULC M5-F retention execution diagnostic backup principal is invalid.": "backup-principal",
  "ULC M5-F retention execution diagnostic purge plan failed.": "purge-plan",
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
    const plan = await client.unsafe(PURGE_PLAN_SQL);
    if (!Array.isArray(plan) || plan.length !== 1) {
      throw new Error("invalid plan");
    }
  } catch {
    throw new Error("ULC M5-F retention execution diagnostic purge plan failed.");
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
  } catch {
    throw new Error("ULC M5-F retention execution diagnostic cleanup path failed.");
  }

  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    classification: "read-only-cleanup-path-ok",
    purgePlanVerified: true,
    cleanupAccessVerified: true,
    cleanupResultVerificationVerified: true,
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

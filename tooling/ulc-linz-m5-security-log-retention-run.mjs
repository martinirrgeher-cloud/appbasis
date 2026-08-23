import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const SNAPSHOT_SQL = `
SELECT
  statement_timestamp() AS observed_at,
  COUNT(*) FILTER (WHERE retained_until < statement_timestamp())::text AS expired_rows
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
    cleanupSucceeded: true,
    cleanupResultVerified: true,
    expiredRowsRemaining: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
    productionReleaseAuthorized: false,
  });
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
    const databaseUrl = process.env.ULC_LINZ_PRODUCTION_DATABASE_URL;
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

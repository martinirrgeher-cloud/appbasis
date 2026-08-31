import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

export const ULC_LINZ_M5_RETENTION_FAILURE_PHASES = Object.freeze([
  "database-binding",
  "database-client-import",
  "database-client-create",
  "cleanup-principal",
  "purge-execution",
  "post-verification",
  "database-client-close",
]);

export async function runControlledUlcLinzM5SecurityLogRetention({
  databaseUrl,
  backupDatabaseUrl,
  createPostgresDatabase,
  purgeExpiredSecurityEvents,
  onPhase = () => {},
}) {
  onPhase("database-binding");
  const cleanup = parseUlcLinzProductionDatabaseUrl(databaseUrl);
  const backup = parseUlcLinzProductionDatabaseUrl(backupDatabaseUrl);
  if (cleanup.host !== backup.host || cleanup.database !== backup.database || cleanup.user === backup.user) {
    throw new Error("ULC M5-F retention backup credential is not bound to the cleanup database.");
  }

  onPhase("database-client-create");
  const connection = createPostgresDatabase(databaseUrl);
  let completed = false;
  try {
    onPhase("cleanup-principal");
    const result = await runUlcLinzM5SecurityLogRetention(
      connection.client,
      async (client) => {
        onPhase("purge-execution");
        const purge = await purgeExpiredSecurityEvents(client);
        onPhase("post-verification");
        return purge;
      },
      backup.user,
    );
    completed = true;
    return result;
  } finally {
    if (connection?.client !== undefined) {
      if (completed) onPhase("database-client-close");
      await connection.client.end();
    }
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  let failurePhase = "database-binding";
  try {
    failurePhase = "database-client-import";
    const [{ createPostgresDatabase }, { purgeExpiredUlcLinzSecurityEvents }] = await Promise.all([
      import("../packages/database/src/client.ts"),
      import("../apps/ulc-linz/worker/security-events-postgres.ts"),
    ]);
    const result = await runControlledUlcLinzM5SecurityLogRetention({
      databaseUrl: process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL,
      backupDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
      createPostgresDatabase,
      purgeExpiredSecurityEvents: purgeExpiredUlcLinzSecurityEvents,
      onPhase: (phase) => {
        if (ULC_LINZ_M5_RETENTION_FAILURE_PHASES.includes(phase)) failurePhase = phase;
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    console.error(`ULC Linz M5-F production retention cleanup failed at phase ${failurePhase}.`);
    process.exitCode = 1;
  }
}

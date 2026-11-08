import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

// Preflight deliberately does not open a database, create dumps or change evidence.
const RESTORE_DATABASE = /^appbasis_ulc_linz_[a-z0-9_]*restore[a-z0-9_]*$/;
const DIRECT_NEON = /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/i;
const STRONG_SSL = new Set(["require", "verify-ca", "verify-full"]);

export class G04PreviewRecoveryPreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "G04PreviewRecoveryPreflightError";
  }
}

function deny() {
  throw new G04PreviewRecoveryPreflightError(
    "G-04.3 blocked: invalid Preview source or isolated restore target.",
  );
}

function parseRecoveryUrl(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) deny();
  let url;
  try {
    url = new URL(value);
  } catch {
    deny();
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !DIRECT_NEON.test(url.hostname) || /-pooler(?:\.|$)/i.test(url.hostname) ||
      url.port !== "" && url.port !== "5432" ||
      !url.username || !url.password || url.hash ||
      url.searchParams.size !== 1 ||
      url.searchParams.getAll("sslmode").length !== 1 ||
      !STRONG_SSL.has(url.searchParams.get("sslmode"))) {
    deny();
  }
  let database;
  let username;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
    if (!username || !decodeURIComponent(url.password)) deny();
  } catch {
    deny();
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database)) deny();
  return Object.freeze({
    host: url.hostname.toLowerCase(),
    port: 5432,
    database,
    username,
    sslmode: url.searchParams.get("sslmode"),
  });
}

export function validateG04V17PreviewRecoveryPreflight({
  migrationDatabaseUrl,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
  restoreDatabaseUrl,
} = {}) {
  let source;
  try {
    source = validateUlcLinzD4PreviewDatabaseCredentials({
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    });
  } catch {
    // Never expose credentials or original connection-string parser errors.
    deny();
  }
  const migration = parseRecoveryUrl(migrationDatabaseUrl);
  const application = parseRecoveryUrl(applicationDatabaseUrl);
  const security = parseRecoveryUrl(securityLogDatabaseUrl);
  const restore = parseRecoveryUrl(restoreDatabaseUrl);

  if (source.migration.database !== "appbasis_ulc_linz_preview" ||
      source.migration.user !== "appbasis_ulc_linz_preview_migration" ||
      migration.database !== "appbasis_ulc_linz_preview" ||
      application.database !== migration.database ||
      security.database !== migration.database ||
      migration.host !== application.host ||
      security.host !== migration.host ||
      !RESTORE_DATABASE.test(restore.database) ||
      restore.database === migration.database ||
      restore.host === migration.host ||
      new Set([migration.username, application.username,
        security.username, restore.username]).size !== 4) {
    deny();
  }
  // An explicit *different direct Neon origin* is required; not merely
  // distinct credentials or the same database under a pooled hostname.
  return Object.freeze({
    status: "preflight-only-requires-operator-and-controller-approval",
    environment: "generated-preview-ulc-linz",
    sourceDatabase: migration.database,
    restoreDatabase: restore.database,
    sourceAndRestoreOriginsDistinct: true,
    sourceSchemaRequired: 16,
    targetSchemaProposed: 17,
    authorizedToBackup: false,
    authorizedToRestore: false,
    authorizedToMigrate: false,
    authorizedToDeploy: false,
    productionChanged: false,
  });
}

if (typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateG04V17PreviewRecoveryPreflight({
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
      restoreDatabaseUrl: process.env.APPBASIS_G04_V17_RESTORE_DATABASE_URL,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch {
    // No connection URLs, username or password may enter CI logs.
    console.error("G-04.3 recovery preflight blocked.");
    process.exitCode = 1;
  }
}

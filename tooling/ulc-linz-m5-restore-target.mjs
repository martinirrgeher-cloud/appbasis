import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const STRONG_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const TARGET_DATABASE = "neondb";
const SOURCE_ROLE = "ulc_linz_application";
const SOURCE_REGION_SUFFIX = ".eu-central-1.aws.neon.tech";
const EMPTY_TARGET_QUERY = `
SELECT
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_namespace AS n
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
      AND n.nspname !~ '^pg_toast(?:_|$)'
      AND n.nspname !~ '^pg_temp_'
  ) AS extra_schema_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ) AS public_relation_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) AS public_routine_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_type AS t
    JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
  ) AS public_type_count
`;

export async function verifyUlcLinzM5IsolatedRestoreTargetEmpty({
  sourceUrl,
  restoreUrl,
  createDatabase = createPostgresDatabase,
} = {}) {
  const source = requiredUlcLinzProductionDatabaseUrl(sourceUrl);
  const restore = requiredEncryptedDatabaseUrl(restoreUrl, "ULC M5 restore database URL");
  if (databaseAliasIdentity(source) === databaseAliasIdentity(restore)) {
    throw new Error(
      "ULC M5 restore target must be a different database endpoint from production, including Neon pooler aliases.",
    );
  }
  if (typeof createDatabase !== "function") {
    throw new Error("ULC M5 restore target database dependency is invalid.");
  }

  let database;
  try {
    database = createDatabase(restoreUrl);
    if (!database?.client || typeof database.client.unsafe !== "function") {
      throw new Error("database client is invalid");
    }
    const rows = await database.client.unsafe(EMPTY_TARGET_QUERY);
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0] === null ||
      typeof rows[0] !== "object" ||
      rows[0].extra_schema_count !== 0 ||
      rows[0].public_relation_count !== 0 ||
      rows[0].public_routine_count !== 0 ||
      rows[0].public_type_count !== 0
    ) {
      throw new Error("restore target is not empty");
    }
    return Object.freeze({ status: "restore-target-empty", appId: "ulc-linz" });
  } catch {
    throw new Error(
      "ULC M5 restore target is not empty or could not be inspected; use a fresh isolated target.",
    );
  } finally {
    if (database?.client && typeof database.client.end === "function") {
      await database.client.end().catch(() => {});
    }
  }
}

function requiredUlcLinzProductionDatabaseUrl(value) {
  const url = requiredEncryptedDatabaseUrl(value, "ULC production database URL");
  if (
    url.username !== SOURCE_ROLE ||
    url.pathname !== `/${TARGET_DATABASE}` ||
    !normalizeProviderHostname(url.hostname).endsWith(SOURCE_REGION_SUFFIX)
  ) {
    throw new Error("ULC M5 source database URL is not the dedicated Frankfurt production application database.");
  }
  return url;
}

function requiredEncryptedDatabaseUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must be PostgreSQL.`);
  }
  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || !STRONG_SSL_MODES.has(sslModes[0])) {
    throw new Error(`${name} must require encrypted transport with exactly one strong sslmode.`);
  }
  if (!url.hostname || !url.username || url.pathname.length <= 1) {
    throw new Error(`${name} is invalid.`);
  }
  return url;
}

function databaseAliasIdentity(value) {
  const url = value instanceof URL ? value : new URL(value);
  const port = url.port === "" ? "5432" : url.port;
  return `${normalizeProviderHostname(url.hostname)}:${port}${url.pathname}`;
}

function normalizeProviderHostname(value) {
  const hostname = value.toLowerCase();
  if (!hostname.endsWith(".neon.tech")) return hostname;
  const labels = hostname.split(".");
  labels[0] = labels[0].replace(/-pooler$/, "");
  return labels.join(".");
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] !== "verify-empty") {
      throw new Error("Expected command mode verify-empty.");
    }
    const result = await verifyUlcLinzM5IsolatedRestoreTargetEmpty({
      sourceUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
      restoreUrl: process.env.APPBASIS_M4_RESTORE_DATABASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "ULC M5 restore target verification failed.",
    );
    process.exitCode = 1;
  }
}

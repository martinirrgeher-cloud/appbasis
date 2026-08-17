import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateM4RestoreDatabaseSeparation } from "./m4-r2-restore-plan.mjs";

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

export async function verifyM4IsolatedRestoreTargetEmpty({
  sourceUrl,
  restoreUrl,
  createDatabase = createPostgresDatabase,
} = {}) {
  validateM4RestoreDatabaseSeparation({ sourceUrl, restoreUrl });
  if (databaseAliasIdentity(sourceUrl) === databaseAliasIdentity(restoreUrl)) {
    throw new Error(
      "M4 restore target must be a different database endpoint from source, including Neon pooler aliases.",
    );
  }
  if (typeof createDatabase !== "function") {
    throw new Error("M4 restore target database dependency is invalid.");
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
    return Object.freeze({ status: "restore-target-empty", appId: "m3-preview" });
  } catch {
    throw new Error(
      "M4 restore target is not empty or could not be inspected; use a fresh isolated target.",
    );
  } finally {
    if (database?.client && typeof database.client.end === "function") {
      await database.client.end().catch(() => {});
    }
  }
}

function databaseAliasIdentity(value) {
  const url = new URL(value);
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
    const result = await verifyM4IsolatedRestoreTargetEmpty({
      sourceUrl: process.env.APPBASIS_M4_SOURCE_DATABASE_URL,
      restoreUrl: process.env.APPBASIS_M4_RESTORE_DATABASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "M4 restore target verification failed.",
    );
    process.exitCode = 1;
  }
}

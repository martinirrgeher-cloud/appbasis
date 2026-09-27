import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const SECURITY_GROUP = "appbasis_ulc_linz_preview_security_ingest";
const BASELINE_TABLES = Object.freeze([
  "appbasis_person",
  "appbasis_permission_principal",
  "ulc_linz_membership",
  "ulc_linz_security_event_log",
]);
const ATHLETES_TABLES = Object.freeze([
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_trainer",
  "appbasis_athlete_group_membership",
  "appbasis_trainer_group_membership",
  "appbasis_athletes_deletion",
]);

export async function resolveUlcLinzD4PreviewMigrationState(
  {
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  } = {},
  { databaseFactory = createPostgresDatabase } = {},
) {
  validateUlcLinzD4PreviewDatabaseCredentials({
    migrationDatabaseUrl,
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  });
  if (typeof databaseFactory !== "function") {
    throw new Error("ULC D4 preview migration-state database factory is invalid.");
  }

  const database = databaseFactory(migrationDatabaseUrl);
  try {
    const rows = await database.client.unsafe(
      `SELECT tablename
         FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename`,
    );
    const roles = await database.client.unsafe(
      `SELECT rolname
         FROM pg_catalog.pg_roles
        WHERE rolname = $1`,
      [SECURITY_GROUP],
    );
    if (!Array.isArray(rows) || !Array.isArray(roles)) {
      throw new Error("ULC D4 preview migration state is unavailable.");
    }

    const tables = new Set(rows.map((row) => row?.tablename).filter(Boolean));
    const securityGroupPresent = roles.length === 1;
    if (roles.length > 1) {
      throw new Error("ULC D4 preview security group inventory is ambiguous.");
    }

    if (tables.size === 0 && securityGroupPresent === false) {
      return Object.freeze({ mode: "initial" });
    }

    if (!BASELINE_TABLES.every((table) => tables.has(table))) {
      throw new Error("ULC D4 preview baseline is incomplete or drifted.");
    }
    if (!securityGroupPresent) {
      throw new Error("ULC D4 established preview security group is missing.");
    }

    const athletesPresent = ATHLETES_TABLES.filter((table) => tables.has(table));
    if (athletesPresent.length === 0) {
      return Object.freeze({ mode: "athletes-upgrade" });
    }
    if (athletesPresent.length === ATHLETES_TABLES.length) {
      return Object.freeze({ mode: "current" });
    }
    throw new Error("ULC D4 preview Stammdaten schema is partially applied.");
  } finally {
    await database.client.end().catch(() => {});
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const result = await resolveUlcLinzD4PreviewMigrationState({
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC D4 preview migration state resolution failed.",
    );
    process.exitCode = 1;
  }
}

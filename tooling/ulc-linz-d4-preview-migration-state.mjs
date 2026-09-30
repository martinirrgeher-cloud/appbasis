import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const SECURITY_GROUP = "appbasis_ulc_linz_preview_security_ingest";
const BASELINE_TABLES = Object.freeze([
  "appbasis_person",
  "appbasis_identity_operation",
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
const TRAINING_TABLES = Object.freeze([
  "ulc_linz_training_session",
  "ulc_linz_training_attendance",
]);
const TRAINER_IDENTITY_AUDIT_TABLE = "ulc_linz_trainer_identity_audit";
const IDENTITY_AUDIT_COLUMNS = Object.freeze([
  "provisioning_owner",
  "actor_principal_id",
  "reason",
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
    if (athletesPresent.length !== ATHLETES_TABLES.length) {
      throw new Error("ULC D4 preview Stammdaten schema is partially applied.");
    }

    const trainingPresent = TRAINING_TABLES.filter((table) => tables.has(table));
    const trainerIdentityAuditPresent = tables.has(TRAINER_IDENTITY_AUDIT_TABLE);
    if (trainingPresent.length === 0) {
      if (trainerIdentityAuditPresent) {
        throw new Error(
          "ULC D4 preview trainer identity audit exists before the training baseline.",
        );
      }
      return Object.freeze({ mode: "training-upgrade" });
    }
    if (trainingPresent.length !== TRAINING_TABLES.length) {
      throw new Error("ULC D4 preview training schema is partially applied.");
    }
    if (!trainerIdentityAuditPresent) {
      return Object.freeze({ mode: "trainer-identity-audit-upgrade" });
    }

    // A completed app-owned trainer audit does not imply identity schema v3.
    // Inspect the owning identity operation table before allowing deployment.
    const identityColumns = await database.client.unsafe(
      `SELECT attribute.attname AS column_name
         FROM pg_catalog.pg_attribute AS attribute
         JOIN pg_catalog.pg_class AS relation
           ON relation.oid = attribute.attrelid
         JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'appbasis_identity_operation'
          AND attribute.attname IN ('provisioning_owner', 'actor_principal_id', 'reason')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped`,
    );
    const identityConstraints = await database.client.unsafe(
      `SELECT pg_catalog.pg_get_constraintdef(guard.oid) AS definition
         FROM pg_catalog.pg_constraint AS guard
         JOIN pg_catalog.pg_class AS relation
           ON relation.oid = guard.conrelid
         JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'appbasis_identity_operation'
          AND guard.conname = 'appbasis_identity_operation_provisioning_audit_shape_check'
          AND guard.contype = 'c'`,
    );
    if (!Array.isArray(identityColumns) || !Array.isArray(identityConstraints)) {
      throw new Error("ULC D4 identity provisioning audit inventory is unavailable.");
    }
    const presentColumns = new Set(identityColumns.map((row) => row?.column_name));
    if (presentColumns.size === 0 && identityConstraints.length === 0) {
      return Object.freeze({ mode: "identity-provisioning-audit-upgrade" });
    }
    const definition = identityConstraints[0]?.definition;
    if (
      presentColumns.size !== IDENTITY_AUDIT_COLUMNS.length ||
      !IDENTITY_AUDIT_COLUMNS.every((column) => presentColumns.has(column)) ||
      identityConstraints.length !== 1 ||
      typeof definition !== "string" ||
      !IDENTITY_AUDIT_COLUMNS.every((column) => definition.includes(column)) ||
      !definition.includes("kind") ||
      !definition.includes("CHECK")
    ) {
      throw new Error("ULC D4 identity provisioning audit schema is partially applied or drifted.");
    }
    return Object.freeze({ mode: "current" });
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

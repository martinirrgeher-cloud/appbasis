import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  isAbsentUlcPreviewIdentityAuditShape,
  isCanonicalUlcPreviewIdentityAuditShape,
  readUlcPreviewIdentityAuditShape,
} from "./ulc-linz-d4-preview-identity-audit-shape.mjs";
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
const TRAINING_MODULE_GROUP_TABLE = "ulc_linz_training_module_group";
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

    // Inventory all migration markers before selecting an incremental route.
    // Otherwise a later identity-v3 state with missing older tables could be
    // misclassified as a safe earlier upgrade and silently mask schema drift.
    const athletesPresent = ATHLETES_TABLES.filter((table) => tables.has(table));
    const trainingPresent = TRAINING_TABLES.filter((table) => tables.has(table));
    const trainerIdentityAuditPresent = tables.has(TRAINER_IDENTITY_AUDIT_TABLE);
    const trainingModuleGroupPresent = tables.has(TRAINING_MODULE_GROUP_TABLE);
    const auditShape = await readUlcPreviewIdentityAuditShape(database.client);
    const identityAuditAbsent = isAbsentUlcPreviewIdentityAuditShape(auditShape);
    if (!identityAuditAbsent && !isCanonicalUlcPreviewIdentityAuditShape(auditShape)) {
      throw new Error(
        "ULC D4 identity provisioning audit schema is partially applied or drifted.",
      );
    }
    if (athletesPresent.length !== 0 && athletesPresent.length !== ATHLETES_TABLES.length) {
      throw new Error("ULC D4 preview Stammdaten schema is partially applied.");
    }
    if (trainingPresent.length !== 0 && trainingPresent.length !== TRAINING_TABLES.length) {
      throw new Error("ULC D4 preview training schema is partially applied.");
    }
    const athletesComplete = athletesPresent.length === ATHLETES_TABLES.length;
    const trainingComplete = trainingPresent.length === TRAINING_TABLES.length;
    if (!identityAuditAbsent && (!athletesComplete || !trainingComplete || !trainerIdentityAuditPresent)) {
      throw new Error("ULC D4 identity provisioning audit exists before the complete app baseline.");
    }
    if (
      trainingModuleGroupPresent &&
      (identityAuditAbsent || !athletesComplete || !trainingComplete || !trainerIdentityAuditPresent)
    ) {
      throw new Error(
        "ULC preview training module configuration exists before the complete identity-v3 app baseline.",
      );
    }
    if (!athletesComplete) {
      if (trainingPresent.length > 0 || trainerIdentityAuditPresent || trainingModuleGroupPresent) {
        throw new Error("ULC D4 training, trainer audit or module configuration exists before Stammdaten baseline.");
      }
      return Object.freeze({ mode: "athletes-upgrade" });
    }
    if (!trainingComplete) {
      if (trainerIdentityAuditPresent || trainingModuleGroupPresent) {
        throw new Error(
          "ULC D4 preview trainer identity audit or module configuration exists before the training baseline.",
        );
      }
      return Object.freeze({ mode: "training-upgrade" });
    }
    if (!trainerIdentityAuditPresent) {
      if (trainingModuleGroupPresent) {
        throw new Error(
          "ULC preview training module configuration exists before the trainer identity audit baseline.",
        );
      }
      return Object.freeze({ mode: "trainer-identity-audit-upgrade" });
    }
    if (identityAuditAbsent) {
      if (trainingModuleGroupPresent) {
        throw new Error(
          "ULC preview training module configuration exists before identity schema v3.",
        );
      }
      return Object.freeze({ mode: "identity-provisioning-audit-upgrade" });
    }
    if (!trainingModuleGroupPresent) {
      return Object.freeze({ mode: "training-module-config-upgrade" });
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

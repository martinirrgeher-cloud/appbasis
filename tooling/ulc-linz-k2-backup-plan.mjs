import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ULC_BACKUP_PREFIX = "appbasis/ulc-linz/pilot/db/daily/";
export const ULC_BACKUP_APP_ID = "ulc-linz";

export const ULC_REQUIRED_OWNER_TABLES = Object.freeze([
  "user",                           // Identity
  "appbasis_permission_principal",  // Permissions
  "appbasis_athlete",               // Athletes
  "appbasis_exercise_catalog_item", // Exercise catalog
  "appbasis_training_block",        // Training blocks
  "appbasis_training_documentation",// Training documentation
  "appbasis_training_plan",         // Training plans
  "ulc_linz_membership",            // ULC-owned attendance and lifecycle
]);

/**
 * Lightweight minimum installed-schema gate for all eight declared owners.
 * This is deliberately NOT a complete migration or restore fingerprint proof.
 */
export function ulcRequiredOwnerSchemaSql() {
  return "SELECT " + ULC_REQUIRED_OWNER_TABLES.map((table) =>
    "to_regclass('public." + table + "') IS NOT NULL"
  ).join(" AND ");
}

export function ulcBackupPlan(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Backup timestamp is invalid.");
  }
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  return Object.freeze({
    schemaVersion: 1,
    appId: ULC_BACKUP_APP_ID,
    kind: "daily",
    createdAt,
    date,
    key: ULC_BACKUP_PREFIX + date + ".tar.aesgcm",
  });
}

export function assertUlcNeonDatabaseUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("ULC database URL is missing or invalid.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ULC database URL is invalid.");
  }
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    !url.username ||
    url.pathname.length <= 1 ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))
  ) {
    throw new Error("ULC database URL must be a Neon PostgreSQL URL with TLS.");
  }
  return true;
}

export function assertIsolatedUlcRestoreTarget(source, restore) {
  assertUlcNeonDatabaseUrl(source);
  assertUlcNeonDatabaseUrl(restore);
  const a = new URL(source);
  const b = new URL(restore);
  // Never restore to a different database in the SAME Neon endpoint:
  // that can still share a role or a production project.
  if (a.hostname === b.hostname || a.href === b.href) {
    throw new Error("ULC restore target must be a separate Neon branch endpoint.");
  }
  return true;
}

export function ulcR2Endpoint(accountId, jurisdiction) {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/.test(accountId)) {
    throw new Error("Cloudflare account identifier is invalid.");
  }
  if (jurisdiction !== "eu") {
    throw new Error("ULC backup requires a dedicated EU-jurisdiction R2 bucket.");
  }
  return "https://" + accountId + ".eu.r2.cloudflarestorage.com";
}

export function assertUlcBackupBucket(value) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
  ) {
    throw new Error("ULC backup bucket name is invalid.");
  }
  return value;
}

export function assertUlcBackupKey(value) {
  if (typeof value !== "string" ||
      !/^appbasis\/ulc-linz\/pilot\/db\/daily\/\d{4}-\d{2}-\d{2}\.tar\.aesgcm$/.test(value)) {
    throw new Error("ULC backup object key is not in the isolated app prefix.");
  }
  const day = value.slice(ULC_BACKUP_PREFIX.length, ULC_BACKUP_PREFIX.length + 10);
  if (new Date(day + "T00:00:00.000Z").toISOString().slice(0, 10) !== day) {
    throw new Error("ULC backup object day is invalid.");
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (command === "plan") {
      process.stdout.write(JSON.stringify(ulcBackupPlan()) + "\n");
    } else if (command === "endpoint") {
      process.stdout.write(ulcR2Endpoint(
        process.env.CLOUDFLARE_ACCOUNT_ID,
        process.env.APPBASIS_ULC_R2_JURISDICTION,
      ) + "\n");
    } else if (command === "bucket") {
      process.stdout.write(assertUlcBackupBucket(process.env.APPBASIS_ULC_R2_BUCKET) + "\n");
    } else if (command === "schema-sql") {
      process.stdout.write(ulcRequiredOwnerSchemaSql() + "\n");
    } else if (command === "source") {
      assertUlcNeonDatabaseUrl(process.env.APPBASIS_ULC_SOURCE_DATABASE_URL);
      process.stdout.write("ok\n");
    } else if (command === "key") {
      process.stdout.write(assertUlcBackupKey(process.argv[3]) + "\n");
    } else if (command === "targets") {
      assertIsolatedUlcRestoreTarget(
        process.env.APPBASIS_ULC_SOURCE_DATABASE_URL,
        process.env.APPBASIS_ULC_RESTORE_DATABASE_URL,
      );
      process.stdout.write("ok\n");
    } else {
      throw new Error("Expected plan, endpoint, bucket, schema-sql, source, targets or key.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "ULC backup input error.");
    process.exitCode = 1;
  }
}

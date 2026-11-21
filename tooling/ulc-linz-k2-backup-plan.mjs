import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ULC_BACKUP_PREFIX = "appbasis/ulc-linz/pilot/db/";
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
    "to_regclass('public.\"" + table + "\"') IS NOT NULL"
  ).join(" AND ");
}


/**
 * Read-only structural integrity attestation for an isolated K2 restore.
 * It never scans or returns personal rows. For the actual 69-table neondb
 * production layout, require all eight app owners, all five published write
 * fences and no NOT VALID constraints. Any future intentional schema change
 * must be reviewed here explicitly. Historical preview archives retain the
 * existing minimal owner-presence check; they must not be represented as a
 * production-quality 69-table restore.
 *
 * This query is exclusively for the disconnected quarantine destination.
 * It is NOT a row-by-row/source snapshot, media, ACL or privacy proof.
 */
export function ulcRestoreIntegritySql(databaseName) {
  const name = assertUlcDatabaseName(databaseName);
  const owners = "(" + ulcRequiredOwnerSchemaSql().replace(/^SELECT\s+/, "") + ")";
  if (name !== "neondb") return "SELECT " + owners + " AS restored_integrity_ok";

  const expected = [
    ["ulc_linz_training_attendance", "ulc_linz_training_attendance_subject_fence", "ulc_linz_training_subject_write_fence"],
    ["ulc_linz_training_registration", "ulc_linz_training_registration_subject_fence", "ulc_linz_training_subject_write_fence"],
    ["ulc_linz_training_registration_change", "ulc_linz_training_registration_change_subject_fence", "ulc_linz_training_subject_write_fence"],
    ["appbasis_training_documentation", "appbasis_training_documentation_guard_root", "appbasis_training_documentation_guard_root_insert"],
    ["appbasis_training_documentation_revision", "appbasis_training_documentation_guard_revision", "appbasis_training_documentation_guard_revision_write"],
  ];
  const values = expected.map(row => "(" + row.map(value => "'" + value + "'").join(",") + ")").join(",\n      ");
  return [
    "WITH expected_fences(relation_name,trigger_name,function_name) AS (",
    "  VALUES " + values,
    ") SELECT ",
    "  (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')=69",
    "  AND " + owners,
    "  AND (SELECT count(*) FROM pg_catalog.pg_constraint x",
    "    JOIN pg_catalog.pg_class r ON r.oid=x.conrelid",
    "    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace",
    "    WHERE n.nspname='public' AND NOT x.convalidated)=0",
    "  AND (SELECT count(*) FROM expected_fences e",
    "    JOIN pg_catalog.pg_trigger t ON t.tgname=e.trigger_name",
    "      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')",
    "      AND (t.tgtype::integer & 23)=23",
    "    JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid AND r.relname=e.relation_name",
    "    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace AND n.nspname='public'",
    "    JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid AND p.proname=e.function_name",
    "      AND p.pronargs=0",
    "    JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace AND pn.nspname='public')=5 AS restored_integrity_ok",
  ].join("\n");
}

export function ulcBackupPlan(now = new Date(), databaseName) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Backup timestamp is invalid.");
  }
  const sourceDatabase = assertUlcDatabaseName(databaseName);
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  return Object.freeze({
    schemaVersion: 1,
    appId: ULC_BACKUP_APP_ID,
    kind: "daily",
    createdAt,
    date,
    databaseName: sourceDatabase,
    key: ULC_BACKUP_PREFIX + sourceDatabase + "/daily/" + date + ".tar.aesgcm",
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

/**
 * Pin the intended logical DB as well as the Neon endpoint. The default
 * Neon `neondb` may be empty even when the ULC app DB is correctly installed
 * next to it (as currently seen in the Preview project).
 */
export function assertUlcDatabaseName(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{2,62}$/.test(value)) {
    throw new Error("ULC expected source database name is missing or invalid.");
  }
  return value;
}

export function assertUlcBackupSourceDatabase(value, expectedDatabaseName) {
  assertUlcNeonDatabaseUrl(value);
  assertUlcDatabaseName(expectedDatabaseName);
  const databaseName = decodeURIComponent(new URL(value).pathname.slice(1));
  if (databaseName !== expectedDatabaseName) {
    throw new Error("ULC source database does not match the operator-approved app DB.");
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

/**
 * A backup upload is allowed only if Cloudflare R2 already has exactly
 * one enabled, prefix-scoped 30-day expiration. Reads an S3-compatible
 * GetBucketLifecycleConfiguration response; it never changes lifecycle
 * rules, deletes objects, or enables backups.
 *
 * Provider bucket locks are NOT visible in this S3 response and require
 * a separate operator check before the first real-data activation.
 */
export function assertUlcBackupR2Lifecycle(configuration, expectedDatabaseName) {
  const databaseName = assertUlcDatabaseName(expectedDatabaseName);
  const prefix = ULC_BACKUP_PREFIX + databaseName + "/daily/";
  if (!configuration || typeof configuration !== "object" ||
      !Array.isArray(configuration.Rules) || configuration.Rules.length === 0) {
    throw new Error("ULC backup retention: R2 lifecycle rules are missing.");
  }
  let matches = 0;
  for (const rule of configuration.Rules) {
    if (!rule || typeof rule !== "object" ||
        !["Enabled", "Disabled"].includes(rule.Status)) {
      throw new Error("ULC backup retention: invalid rule status.");
    }
    if (rule.Status !== "Enabled") continue;
    // Default incomplete-multipart cleanup needs no object-expiration proof.
    if (!Object.hasOwn(rule, "Expiration") &&
        !Object.hasOwn(rule, "NoncurrentVersionExpiration")) continue;
    if ((rule.Filter && typeof rule.Filter === "object" &&
         (Object.hasOwn(rule.Filter, "And") || Object.hasOwn(rule.Filter, "Tag") ||
          Object.hasOwn(rule.Filter, "ObjectSizeGreaterThan") ||
          Object.hasOwn(rule.Filter, "ObjectSizeLessThan"))) ||
        (rule.Prefix !== undefined && rule.Filter?.Prefix !== undefined &&
         rule.Prefix !== rule.Filter.Prefix)) {
      throw new Error("ULC backup retention: complex expiration rule needs review.");
    }
    const rulePrefix = rule.Filter?.Prefix ?? rule.Prefix ?? "";
    if (typeof rulePrefix !== "string") {
      throw new Error("ULC backup retention: invalid prefix.");
    }
    // Rules for an unrelated prefix must not affect our daily backup.
    if (!prefix.startsWith(rulePrefix) && !rulePrefix.startsWith(prefix)) continue;
    // Broad expiration or a more-specific exception can delete backups
    // at an unintended time; do not mistake either for the approved policy.
    if (rulePrefix !== prefix ||
        !rule.Expiration || !Number.isInteger(rule.Expiration.Days) ||
        rule.Expiration.Days !== 30 ||
        Object.keys(rule.Expiration).some(key => key !== "Days") ||
        Object.hasOwn(rule, "NoncurrentVersionExpiration")) {
      throw new Error("ULC backup retention: conflicting or broad expiration rule.");
    }
    matches++;
  }
  if (matches !== 1) {
    throw new Error("ULC backup retention: exactly one enabled 30-day daily-prefix rule is required.");
  }
  return Object.freeze({ prefix, days: 30, valid: true });
}

export function assertUlcBackupKey(value, expectedDatabaseName) {
  const databaseName = assertUlcDatabaseName(expectedDatabaseName);
  const prefix = ULC_BACKUP_PREFIX + databaseName + "/daily/";
  if (typeof value !== "string" || !value.startsWith(prefix) ||
      !/^\d{4}-\d{2}-\d{2}\.tar\.aesgcm$/.test(value.slice(prefix.length))) {
    throw new Error("ULC backup object key is not in the approved database scope.");
  }
  const day = value.slice(prefix.length, prefix.length + 10);
  if (new Date(day + "T00:00:00.000Z").toISOString().slice(0, 10) !== day) {
    throw new Error("ULC backup object day is invalid.");
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (command === "plan") {
      process.stdout.write(JSON.stringify(ulcBackupPlan(new Date(), process.env.APPBASIS_ULC_EXPECTED_DATABASE_NAME)) + "\n");
    } else if (command === "endpoint") {
      process.stdout.write(ulcR2Endpoint(
        process.env.CLOUDFLARE_ACCOUNT_ID,
        process.env.APPBASIS_ULC_R2_JURISDICTION,
      ) + "\n");
    } else if (command === "bucket") {
      process.stdout.write(assertUlcBackupBucket(process.env.APPBASIS_ULC_R2_BUCKET) + "\n");
    } else if (command === "schema-sql") {
      process.stdout.write(ulcRequiredOwnerSchemaSql() + "\n");
    } else if (command === "restore-integrity-sql") {
      process.stdout.write(ulcRestoreIntegritySql(process.env.APPBASIS_ULC_EXPECTED_DATABASE_NAME) + "\n");
    } else if (command === "source") {
      assertUlcBackupSourceDatabase(
        process.env.APPBASIS_ULC_SOURCE_DATABASE_URL,
        process.env.APPBASIS_ULC_EXPECTED_DATABASE_NAME,
      );
      process.stdout.write("ok\n");
    } else if (command === "lifecycle") {
      const policy = JSON.parse(readFileSync(process.argv[3], "utf8"));
      assertUlcBackupR2Lifecycle(policy, process.env.APPBASIS_ULC_EXPECTED_DATABASE_NAME);
      process.stdout.write("ok\n");
    } else if (command === "key") {
      process.stdout.write(assertUlcBackupKey(process.argv[3], process.env.APPBASIS_ULC_EXPECTED_DATABASE_NAME) + "\n");
    } else if (command === "targets") {
      assertUlcBackupSourceDatabase(
        process.env.APPBASIS_ULC_SOURCE_DATABASE_URL,
        process.env.APPBASIS_ULC_EXPECTED_DATABASE_NAME,
      );
      assertIsolatedUlcRestoreTarget(
        process.env.APPBASIS_ULC_SOURCE_DATABASE_URL,
        process.env.APPBASIS_ULC_RESTORE_DATABASE_URL,
      );
      process.stdout.write("ok\n");
    } else {
      throw new Error("Expected plan, endpoint, bucket, schema-sql, restore-integrity-sql, source, targets, key or lifecycle.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "ULC backup input error.");
    process.exitCode = 1;
  }
}

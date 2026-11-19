import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { assertUlcLifecyclePreviewScope } from "./ulc-linz-lifecycle-schema-preview.mjs";

/**
 * P02 pilot data admission: strict read-only inspection.
 *
 * SQL only returns aggregated numeric evidence. Neither row IDs, identities,
 * notes, media storage keys nor actual media bytes are read or logged.
 * Production eligibility is NEVER inferred from an empty synthetic Preview.
 */
const DATABASE = "appbasis_ulc_linz_preview";
const PRINCIPAL = "appbasis_ulc_linz_preview_migration";
const EXPECTED_PREVIEW_TABLES = 66;

export class UlcP02PilotAdmissionError extends Error {
  constructor(message) {
    super("ULC P02 pilot admission blocked: " + message);
    this.name = "UlcP02PilotAdmissionError";
  }
}
function fail(message) {
  throw new UlcP02PilotAdmissionError(message);
}
function count(value, field) {
  const normalized =
    typeof value === "string" && /^[0-9]+$/.test(value)
      ? Number(value)
      : value;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    fail("invalid aggregate count: " + field);
  }
  return normalized;
}

export const ULC_P02_COUNT_KEYS = Object.freeze([
  "catalog_items",
  "catalog_favorites",
  "catalog_usage",
  "catalog_private_media",
  "catalog_pending_media_delete",
  "blocks",
  "block_favorites",
  "block_usage",
  "block_usage_attributed",
  "block_usage_unattributed",
  "block_usage_notes",
  "block_usage_source_refs",
  "block_deleted_subject_markers",
  "documentation",
  "documentation_revisions",
  "documentation_deleted_subject_markers",
  "registrations",
  "registration_changes",
  "current_registration_notes",
  "historical_registration_notes",
]);

const COUNTS_SQL = `
  SELECT
    (SELECT COUNT(*)::int FROM public.appbasis_exercise_catalog_item) AS catalog_items,
    (SELECT COUNT(*)::int FROM public.appbasis_exercise_catalog_favorite) AS catalog_favorites,
    (SELECT COUNT(*)::int FROM public.appbasis_exercise_catalog_usage) AS catalog_usage,
    (SELECT COUNT(*)::int FROM public.appbasis_exercise_catalog_private_media) AS catalog_private_media,
    (SELECT COUNT(*)::int FROM public.appbasis_exercise_catalog_private_media
      WHERE deletion_requested_at IS NOT NULL) AS catalog_pending_media_delete,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block) AS blocks,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block_favorite) AS block_favorites,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block_usage) AS block_usage,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block_usage_subject) AS block_usage_attributed,
    (SELECT COUNT(*)::int
       FROM public.appbasis_training_block_usage AS u
       LEFT JOIN public.appbasis_training_block_usage_subject AS owner
         ON owner.organization_id = u.organization_id AND owner.usage_id = u.id
      WHERE owner.usage_id IS NULL) AS block_usage_unattributed,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block_usage
      WHERE note IS NOT NULL) AS block_usage_notes,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block_usage
      WHERE source_ref IS NOT NULL) AS block_usage_source_refs,
    (SELECT COUNT(*)::int FROM public.appbasis_training_block_usage_subject_deletion) AS block_deleted_subject_markers,
    (SELECT COUNT(*)::int FROM public.appbasis_training_documentation) AS documentation,
    (SELECT COUNT(*)::int FROM public.appbasis_training_documentation_revision) AS documentation_revisions,
    (SELECT COUNT(*)::int FROM public.appbasis_training_documentation_subject_deletion) AS documentation_deleted_subject_markers,
    (SELECT COUNT(*)::int FROM public.ulc_linz_training_registration) AS registrations,
    (SELECT COUNT(*)::int FROM public.ulc_linz_training_registration_change) AS registration_changes,
    (SELECT COUNT(*)::int FROM public.ulc_linz_training_registration WHERE note IS NOT NULL) AS current_registration_notes,
    (SELECT COUNT(*)::int FROM public.ulc_linz_training_registration_change WHERE note IS NOT NULL) AS historical_registration_notes
`;

const IDENTITY_SQL = `
  SELECT current_database() AS database_name, current_user AS principal_name,
    (SELECT COUNT(*)::int FROM pg_catalog.pg_tables
      WHERE schemaname = 'public') AS public_tables
`;

export function evaluateUlcP02PilotAdmission(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("missing or invalid aggregate evidence");
  }
  const normalized = {};
  for (const key of ULC_P02_COUNT_KEYS) {
    normalized[key] = count(raw[key], key);
  }
  if (
    normalized.block_usage_attributed + normalized.block_usage_unattributed !==
      normalized.block_usage ||
    normalized.catalog_pending_media_delete > normalized.catalog_private_media ||
    normalized.block_usage_notes > normalized.block_usage ||
    normalized.block_usage_source_refs > normalized.block_usage ||
    normalized.current_registration_notes > normalized.registrations ||
    normalized.historical_registration_notes > normalized.registration_changes ||
    normalized.documentation_revisions < normalized.documentation
  ) {
    fail("contradictory owner or privacy aggregate evidence");
  }

  const findings = [];
  if (normalized.block_usage_unattributed !== 0) {
    findings.push(Object.freeze({
      code: "BLOCK_USAGE_UNATTRIBUTED",
      count: normalized.block_usage_unattributed,
      disposition: "review-or-exclude-from-clean-pilot; never infer subject from source_ref/note",
    }));
  }
  if (normalized.block_usage_notes !== 0) {
    findings.push(Object.freeze({
      code: "BLOCK_USAGE_NOTES",
      count: normalized.block_usage_notes,
      disposition: "potentially personal; restrict and review before any historical import",
    }));
  }
  if (normalized.catalog_usage !== 0) {
    findings.push(Object.freeze({
      code: "CATALOG_USAGE_UNVERIFIED",
      count: normalized.catalog_usage,
      disposition: "do not treat text source_ref/note as verified personal ownership",
    }));
  }
  if (normalized.catalog_private_media !== 0) {
    findings.push(Object.freeze({
      code: "CATALOG_PRIVATE_MEDIA",
      count: normalized.catalog_private_media,
      disposition: "R2 object and privacy/processor evidence separately required; absent from PostgreSQL backup",
    }));
  }
  if (normalized.current_registration_notes + normalized.historical_registration_notes !== 0) {
    findings.push(Object.freeze({
      code: "REGISTRATION_NOTES",
      count: normalized.current_registration_notes + normalized.historical_registration_notes,
      disposition: "review both current and immutable history; current note deletion alone is insufficient",
    }));
  }
  // These are mandatory blockers even for an EMPTY database, since a clean
  // pilot must safely handle future writes, deletion and restore.
  findings.push(Object.freeze({
    code: "P01_LEGAL_AND_PROVIDER_GATE",
    disposition: "privacy controller decision, actual processor agreement and D2 backup/erasure authority are still open",
  }));
  findings.push(Object.freeze({
    code: "P02_WRITER_AND_RESTORE_GATE",
    disposition: "no proven exclusive subject guards across catalog, blocks, documentation, app-owned writers and media restore",
  }));

  return Object.freeze({
    status: "blocked",
    productionReady: false,
    mode: "aggregated-preview-readonly",
    counts: Object.freeze(normalized),
    findings: Object.freeze(findings),
    changesApplied: false,
    dataImported: false,
  });
}

export async function inspectUlcP02PilotAdmission(sql) {
  if (!sql || typeof sql.begin !== "function") {
    fail("read-only PostgreSQL transaction unavailable");
  }
  return sql.begin(async tx => {
    // This is first, so a misconfigured write-capable SQL client cannot
    // mutate data through this routine, even after an unexpected edit.
    await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const identity = await tx.unsafe(IDENTITY_SQL);
    if (
      !Array.isArray(identity) || identity.length !== 1 ||
      identity[0]?.database_name !== DATABASE ||
      identity[0]?.principal_name !== PRINCIPAL ||
      count(identity[0]?.public_tables, "public_tables") !== EXPECTED_PREVIEW_TABLES
    ) {
      fail("wrong Preview database, role or expected 66-table schema");
    }
    const records = await tx.unsafe(COUNTS_SQL);
    if (!Array.isArray(records) || records.length !== 1) {
      fail("unexpected Preview aggregate SQL result");
    }
    return evaluateUlcP02PilotAdmission(records[0]);
  });
}

/** Call the Preview credentials validator BEFORE opening any database socket. */
export async function runUlcP02PilotAdmissionPreview(credentials, options = {}) {
  assertUlcLifecyclePreviewScope(credentials);
  const factory = options.databaseFactory ?? createPostgresDatabase;
  if (typeof factory !== "function") fail("database factory unavailable");
  const database = factory(credentials.migrationDatabaseUrl);
  try {
    return await inspectUlcP02PilotAdmission(database.client);
  } finally {
    await database.client.end().catch(() => {});
  }
}

function isMainModule() {
  return typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "inspect") {
      fail("only the explicit inspect operation is supported");
    }
    const result = await runUlcP02PilotAdmissionPreview({
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    // No SQL details, connection strings or personal data in stdout/stderr.
    process.stderr.write(
      "ULC P02 read-only admission failed: " +
      (error instanceof UlcP02PilotAdmissionError
        ? error.message
        : "credential, connection or schema mismatch") + "\n",
    );
    process.exitCode = 1;
  }
}

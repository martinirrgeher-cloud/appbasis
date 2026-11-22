import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Read-only P04-B planning for three EXISTING owner migrations.
 * This module deliberately has no apply/dispatch/DDL function.
 * SQL is loaded for review and disposable PostgreSQL rehearsal only.
 */
export const ULC_LIFECYCLE_REPAIR_PATHS = Object.freeze([
  "modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql",
  "modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql",
  "modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql",
]);

export const ULC_LIFECYCLE_REPAIR_TABLES = Object.freeze([
  "appbasis_training_block_favorite_deletion",
  "appbasis_training_block_usage_subject",
  "appbasis_training_block_usage_subject_deletion",
  "appbasis_training_documentation_subject_deletion",
]);

const REQUIRED_BASELINE = Object.freeze([
  "appbasis_athletes_deletion",
  "appbasis_training_block_favorite",
  "appbasis_training_block_usage",
  "appbasis_training_documentation",
  "appbasis_training_documentation_revision",
]);

const EXPECTED_DOC_FUNCTIONS = Object.freeze([
  "appbasis_training_documentation_guard_subject",
  "appbasis_training_documentation_guard_root_insert",
  "appbasis_training_documentation_guard_revision_write",
]);

const EXPECTED_DOC_TRIGGERS = Object.freeze([
  "appbasis_training_documentation_guard_root",
  "appbasis_training_documentation_guard_revision",
]);

function fail(message) {
  throw new Error("ULC P04 lifecycle schema reconciliation blocked: " + message);
}

function requiredOwner(manifest, id, paths) {
  const owners = manifest.owners.filter(owner => owner?.id === id);
  if (owners.length !== 1 || !Array.isArray(owners[0].migrations)) {
    fail("canonical " + id + " owner missing or ambiguous");
  }
  for (const path of paths) {
    if (owners[0].migrations.filter(item => item === path).length !== 1) {
      fail("canonical " + id + " migration missing or duplicated");
    }
  }
}

/** Only an exact, currently declared owner manifest is allowed. */
export async function loadUlcLifecycleRepairPlan() {
  const manifest = JSON.parse(await readFile(
    new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url), "utf8",
  ));
  const migrationCount=manifest?.owners?.reduce((count, owner) =>
    count+(Array.isArray(owner?.migrations)?owner.migrations.length:0),0);
  const lifecycle=manifest?.owners?.find(owner=>owner.id==="ulc-linz-lifecycle");
  const catalog=manifest?.owners?.find(owner=>owner.id==="exercise-catalog");
  const blocks=manifest?.owners?.find(owner=>owner.id==="training-blocks");
  const publishedV18=(migrationCount===45 &&
    blocks?.schemaVersion===7 &&
    blocks?.migrations?.length===7 &&
    blocks.migrations[6]==="modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql" &&
    lifecycle?.schemaVersion===18 &&
    lifecycle?.migrations?.length===18 &&
    lifecycle.migrations[16]==="apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql" &&
    lifecycle.migrations[17]==="apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql" &&
    catalog?.schemaVersion===5 &&
    catalog?.migrations?.length===5 &&
    catalog.migrations[4]==="modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql");
  const publishedV19=(migrationCount===46 &&
    blocks?.schemaVersion===7 && blocks?.migrations?.length===7 &&
    blocks.migrations[6]==="modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql" &&
    lifecycle?.schemaVersion===19 && lifecycle?.migrations?.length===19 &&
    lifecycle.migrations[16]==="apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql" &&
    lifecycle.migrations[17]==="apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql" &&
    lifecycle.migrations[18]==="apps/ulc-linz/migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql" &&
    catalog?.schemaVersion===5 && catalog?.migrations?.length===5 &&
    catalog.migrations[4]==="modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql");
  const published=publishedV18 || publishedV19;
  if (manifest.application !== "ulc-linz" || !Array.isArray(manifest.owners) ||
      !(migrationCount===41 || published)) {
    fail("expected historical 41 or exact published 45/46-migration ULC owner manifest changed");
  }
  requiredOwner(manifest, "training-blocks", ULC_LIFECYCLE_REPAIR_PATHS.slice(0, 2));
  requiredOwner(manifest, "training-documentation", ULC_LIFECYCLE_REPAIR_PATHS.slice(2));
  const files = [];
  for (const path of ULC_LIFECYCLE_REPAIR_PATHS) {
    const sql = await readFile(new URL("../" + path, import.meta.url), "utf8");
    const statements = sql.split("--> statement-breakpoint")
      .map(value => value.trim()).filter(Boolean);
    if (statements.length === 0) fail("empty canonical migration " + path);
    files.push(Object.freeze({
      path,
      sha256: createHash("sha256").update(sql).digest("hex"),
      statementCount: statements.length,
      // Not exposed to deployed Worker or network; for synthetic test rehearsal.
      statements: Object.freeze(statements),
    }));
  }
  return Object.freeze(files);
}

/**
 * Inspect catalog metadata; never query personal table contents.
 * An entirely absent three-migration slice may be planned; partial,
 * unexpected or structurally incomplete states are ALWAYS rejected.
 */
export async function inspectUlcLifecycleSchema(sql) {
  if (!sql || typeof sql.unsafe !== "function") {
    fail("PostgreSQL metadata client unavailable");
  }
  const tableRows = await sql.unsafe(
    `SELECT tablename AS name
       FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'`,
  );
  const functionRows = await sql.unsafe(
    `SELECT p.proname AS name FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'`,
  );
  const triggerRows = await sql.unsafe(
    `SELECT t.tgname AS name FROM pg_catalog.pg_trigger t
       JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  );
  if (![tableRows, functionRows, triggerRows].every(Array.isArray)) {
    fail("PostgreSQL catalog inventory invalid");
  }
  function names(rows) {
    if (rows.some(row => typeof row?.name !== "string")) {
      fail("PostgreSQL catalog returned invalid identifiers");
    }
    return new Set(rows.map(row => row.name));
  }
  const tables = names(tableRows);
  const functions = names(functionRows);
  const triggers = names(triggerRows);

  const prerequisitesMissing = REQUIRED_BASELINE.filter(name => !tables.has(name));
  if (prerequisitesMissing.length) {
    fail("required baseline tables absent: " + prerequisitesMissing.join(", "));
  }

  const tableCount = ULC_LIFECYCLE_REPAIR_TABLES.filter(name => tables.has(name)).length;
  const functionCount = EXPECTED_DOC_FUNCTIONS.filter(name => functions.has(name)).length;
  const triggerCount = EXPECTED_DOC_TRIGGERS.filter(name => triggers.has(name)).length;
  const entirelyAbsent = tableCount === 0 && functionCount === 0 && triggerCount === 0;
  const complete = tableCount === ULC_LIFECYCLE_REPAIR_TABLES.length &&
    functionCount === EXPECTED_DOC_FUNCTIONS.length &&
    triggerCount === EXPECTED_DOC_TRIGGERS.length;
  if (!entirelyAbsent && !complete) {
    fail("partial or drifted module lifecycle DDL: tables=" + tableCount +
      "/4, functions=" + functionCount + "/3, triggers=" + triggerCount + "/2");
  }
  return Object.freeze({
    state: entirelyAbsent ? "migration-required" : "current",
    missingTables: Object.freeze(entirelyAbsent ? [...ULC_LIFECYCLE_REPAIR_TABLES] : []),
    // Deliberately no connection string, owner/principal, row contents or mutations.
    requiredMigrations: Object.freeze(entirelyAbsent ? [...ULC_LIFECYCLE_REPAIR_PATHS] : []),
  });
}

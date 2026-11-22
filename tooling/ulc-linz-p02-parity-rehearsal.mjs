import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * P2-E. Schema-inventory planner ONLY. Never accepts credentials or runs SQL.
 * The two catalog candidates remain test fixtures until a separately approved
 * module-owned, versioned migration + restore/erasure policy exists.
 */
export const PRODUCTION_MISSING_TABLES = Object.freeze([
  "appbasis_athlete_contact",
  "appbasis_training_block_favorite_deletion",
  "appbasis_training_block_usage_subject",
  "appbasis_training_block_usage_subject_deletion",
  "appbasis_training_documentation",
  "appbasis_training_documentation_revision",
  "appbasis_training_documentation_subject_deletion",
  "appbasis_training_plan_subject_deletion",
  "ulc_linz_registration_calendar_exception",
  "ulc_linz_registration_calendar_rule",
  "ulc_linz_training_registration",
  "ulc_linz_training_registration_change",
  "ulc_linz_training_trainer_attendance",
  "ulc_linz_youth_content_category",
  "ulc_linz_youth_group_category",
]);

export const CALENDAR_MIGRATION =
  "apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql";
export const CATALOG_CANDIDATES = Object.freeze([
  "apps/ulc-linz/test/fixtures/p02-g-catalog-favorite-erasure-marker.candidate.sql",
  "apps/ulc-linz/test/fixtures/p02-h-catalog-usage-subject.candidate.sql",
]);
export const CATALOG_GUARD_TABLES = Object.freeze([
  "appbasis_exercise_catalog_favorite_deletion",
  "appbasis_exercise_catalog_usage_subject",
]);

export const P02_SCHEMA_COUNTS = Object.freeze({
  production: 51,
  declaredManifest: 64,
  preview: 66,
  guardedCandidate: 68,
});

const EXPECTED_OWNER_ROOTS = Object.freeze({
  identity: "packages/identity",
  permissions: "packages/permissions",
  athletes: "modules/athletes",
  "exercise-catalog": "modules/exercise-catalog",
  "training-blocks": "modules/training-blocks",
  "training-documentation": "modules/training-documentation",
  "training-plans": "modules/training-plans",
  "ulc-linz-lifecycle": "apps/ulc-linz",
});

/**
 * Immutable file-level owner pins. A distinct migration creating the same
 * table is NOT an authorized substitute, even under the same module root.
 */
export const EXPECTED_MISSING_TABLE_CREATORS = Object.freeze({
  appbasis_athlete_contact: "modules/athletes/migrations/0002_appbasis_athlete_contacts.sql",
  appbasis_training_block_favorite_deletion: "modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql",
  appbasis_training_block_usage_subject: "modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql",
  appbasis_training_block_usage_subject_deletion: "modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql",
  appbasis_training_documentation: "modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
  appbasis_training_documentation_revision: "modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
  appbasis_training_documentation_subject_deletion: "modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql",
  appbasis_training_plan_subject_deletion: "modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql",
  ulc_linz_registration_calendar_exception: CALENDAR_MIGRATION,
  ulc_linz_registration_calendar_rule: CALENDAR_MIGRATION,
  ulc_linz_training_registration: "apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql",
  ulc_linz_training_registration_change: "apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql",
  ulc_linz_training_trainer_attendance: "apps/ulc-linz/migrations/0015_ulc_linz_training_trainer_attendance.sql",
  ulc_linz_youth_content_category: "apps/ulc-linz/migrations/0013_ulc_linz_youth_categories.sql",
  ulc_linz_youth_group_category: "apps/ulc-linz/migrations/0014_ulc_linz_youth_group_categories.sql",
});
const EXPECTED_GUARD_CREATORS = Object.freeze({
  appbasis_exercise_catalog_favorite_deletion: CATALOG_CANDIDATES[0],
  appbasis_exercise_catalog_usage_subject: CATALOG_CANDIDATES[1],
});

const APP_MANIFEST = "../apps/ulc-linz/appbasis.database.json";
const REQUIRED_OWNERS = [
  "identity", "permissions", "athletes", "exercise-catalog",
  "training-blocks", "training-documentation", "training-plans",
  "ulc-linz-lifecycle",
];

function block(reason) {
  throw new Error("ULC P2-E schema rehearsal blocked: " + reason);
}
function digest(source) {
  return "sha256:" + createHash("sha256").update(source).digest("hex");
}
function exactNames(value, name) {
  if (
    !Array.isArray(value) ||
    value.some(table => typeof table !== "string" ||
      !/^[a-z][a-z0-9_]{0,127}$/.test(table)) ||
    new Set(value).size !== value.length
  ) block(name + " table inventory invalid or duplicated");
  return new Set(value);
}
function createdTables(sql) {
  return [...sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z][a-z0-9_]*)\b/gi)]
    .map(match => match[1].toLowerCase());
}

/** Validate only non-personal, catalog-level metadata obtained externally. */
export function evaluateUlcP02ParityInventory({ productionTables, previewTables }) {
  const production = exactNames(productionTables, "production");
  const preview = exactNames(previewTables, "preview");
  const missing = [...preview].filter(table => !production.has(table)).sort();
  const unexpectedProduction = [...production].filter(table => !preview.has(table));
  if (
    production.size !== P02_SCHEMA_COUNTS.production ||
    preview.size !== P02_SCHEMA_COUNTS.preview ||
    unexpectedProduction.length !== 0 ||
    JSON.stringify(missing) !== JSON.stringify([...PRODUCTION_MISSING_TABLES].sort())
  ) block("production/Preview schema drift; fresh read-only inventory required");
  return Object.freeze({
    status: "blocked",
    productionTables: production.size,
    previewTables: preview.size,
    missingTables: Object.freeze(missing),
    unapprovedWritesAllowed: false,
    productionReady: false,
  });
}

/**
 * Exact owner/migration inventory, not an executable production migration.
 * Every missing production table must have ONE declared creator or the
 * separately staged calendar migration. The two guard candidates are
 * intentionally NOT part of the app's release manifest.
 */
export async function loadUlcP02ParityRehearsalPlan() {
  // This is intentionally a HISTORICAL 51→64→66→68 rehearsal.
  // The canonical repository now publishes 46 files, including the new
  // training-block tombstone guard that was NOT part of that old snapshot.
  // Verify and remove only the exact post-41 published additions before
  // evaluating the original 41-file historical inventory.
  // Do not reinterpret the old catalog counts as today's production state.
  const latest = JSON.parse(await readFile(new URL(APP_MANIFEST, import.meta.url), "utf8"));
  // Fail closed against an unrecognized live manifest. Project exactly the
  // appended v19 reconciliation back to the historic v18 publication before
  // deriving the older 41-file synthetic schema. Never execute that projection.
  const current = structuredClone(latest);
  const v19Owner = current.owners?.find(o=>o.id==="ulc-linz-lifecycle");
  const newest = "apps/ulc-linz/migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql";
  if (current?.owners?.flatMap(o=>o.migrations??[]).length!==46 ||
      v19Owner?.schemaVersion!==19 || v19Owner?.migrations?.length!==19 ||
      v19Owner.migrations.at(-1)!==newest) {
    block("v19 forward-reconciliation manifest drift");
  }
  v19Owner.schemaVersion=18;
  v19Owner.migrations.pop();
  const currentCatalog = current.owners?.find(o=>o.id==="exercise-catalog");
  const currentBlocks = current.owners?.find(o=>o.id==="training-blocks");
  const currentLifecycle = current.owners?.find(o=>o.id==="ulc-linz-lifecycle");
  const added = [
    "modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql",
    CALENDAR_MIGRATION,
    "apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql",
  ];
  if (current?.owners?.flatMap(o=>o.migrations??[]).length!==45 ||
      currentBlocks?.schemaVersion!==7 || currentBlocks?.migrations?.length!==7 ||
      currentBlocks.migrations[6]!=="modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql" ||
      currentCatalog?.schemaVersion!==5 || currentCatalog?.migrations?.length!==5 ||
      currentCatalog.migrations[4]!==added[0] ||
      currentLifecycle?.schemaVersion!==18 || currentLifecycle?.migrations?.length!==18 ||
      currentLifecycle.migrations[16]!==added[1] ||
      currentLifecycle.migrations[17]!==added[2]) {
    block("historical rehearsal cannot be derived from unexpected v18/v5 publication");
  }
  const manifest = structuredClone(current);
  const cat = manifest.owners.find(o=>o.id==="exercise-catalog");
  const blocks = manifest.owners.find(o=>o.id==="training-blocks");
  const life = manifest.owners.find(o=>o.id==="ulc-linz-lifecycle");
  // The DB-level replay fence did not exist in the historical 41-migration
  // rehearsal; never silently apply its 2026 owner delta to legacy snapshots.
  blocks.schemaVersion=6; blocks.migrations.pop();
  cat.schemaVersion=4; cat.migrations.pop();
  life.schemaVersion=16; life.migrations.splice(16,2);
  if (
    manifest.application !== "ulc-linz" ||
    !Array.isArray(manifest.owners) ||
    JSON.stringify(manifest.owners.map(owner => owner.id)) !==
      JSON.stringify(REQUIRED_OWNERS)
  ) block("owner manifest drift");
  // An owner cannot silently claim another module's migration file.
  for (const owner of manifest.owners) {
    if (
      owner.root !== EXPECTED_OWNER_ROOTS[owner.id] ||
      !Array.isArray(owner.migrations) ||
      owner.migrations.some(path => typeof path !== "string" ||
        !path.startsWith(owner.root + "/"))
    ) block("manifest owner root/migration ownership drift");
  }
  const migrations = manifest.owners.flatMap(owner => owner.migrations ?? []);
  if (
    migrations.length !== 41 ||
    new Set(migrations).size !== 41 ||
    migrations.includes(CALENDAR_MIGRATION) ||
    CATALOG_CANDIDATES.some(path => migrations.includes(path))
  ) block("registered schema or candidate migration drift");

  const expected = new Set([...PRODUCTION_MISSING_TABLES, ...CATALOG_GUARD_TABLES]);
  const creator = new Map();
  const files = [];
  for (const path of [...migrations, CALENDAR_MIGRATION, ...CATALOG_CANDIDATES]) {
    if (!/^(?:packages|modules|apps)\/[a-z0-9-]+\/(?:drizzle|migrations|test\/fixtures)\/[a-z0-9_-]+(?:\.candidate)?\.sql$/.test(path)) {
      block("unexpected migration path");
    }
    const sql = await readFile(new URL("../" + path, import.meta.url), "utf8");
    const definitions = createdTables(sql);
    if (definitions.length !== new Set(definitions).size) {
      block("duplicate table creator within migration");
    }
    for (const table of definitions) {
      if (!expected.has(table)) continue;
      if (creator.has(table)) block("table has ambiguous migration owner: " + table);
      creator.set(table, path);
    }
    const statements = sql.split("--> statement-breakpoint")
      .map(value => value.trim()).filter(Boolean);
    if (statements.length === 0) block("empty migration");
    files.push(Object.freeze({
      path,
      digest: digest(sql),
      creates: Object.freeze(definitions),
      statements: Object.freeze(statements),
    }));
  }
  if (
    Object.keys(EXPECTED_MISSING_TABLE_CREATORS).length !== PRODUCTION_MISSING_TABLES.length ||
    PRODUCTION_MISSING_TABLES.some(table => !Object.hasOwn(EXPECTED_MISSING_TABLE_CREATORS, table))
  ) block("expected table source inventory drift");
  for (const table of expected) {
    if (!creator.has(table)) block("missing source for table: " + table);
    const exactSource = EXPECTED_MISSING_TABLE_CREATORS[table] ??
      EXPECTED_GUARD_CREATORS[table];
    if (creator.get(table) !== exactSource) {
      block("wrong original migration for table: " + table);
    }
  }
  const manifestFiles = files.slice(0, 41);
  const calendar = files[41];
  const candidates = files.slice(42);
  if (!calendar || candidates.length !== 2 ||
    calendar.creates.filter(table => PRODUCTION_MISSING_TABLES.includes(table)).length !== 2 ||
    candidates.some(file => file.creates.length !== 1)) {
    block("calendar/catalog guard stage drift");
  }

  return Object.freeze({
    status: "review-only",
    migrationExecutionAuthorized: false,
    providerWritesAllowed: false,
    freshDatabaseInventoryRequired: true,
    registeredFiles: Object.freeze(manifestFiles),
    isolatedCalendarFile: calendar,
    isolatedCandidateFiles: Object.freeze(candidates),
    missingTableCreators: Object.freeze(Object.fromEntries(
      [...PRODUCTION_MISSING_TABLES, ...CATALOG_GUARD_TABLES].map(table => [table, creator.get(table)]),
    )),
    stages: Object.freeze([
      Object.freeze({ step: "existing-production", tables: 51, approvalRequired: true }),
      Object.freeze({ step: "full-manifest", tables: 64, approvalRequired: true }),
      Object.freeze({ step: "calendar-v17", tables: 66, approvalRequired: true }),
      Object.freeze({ step: "catalog-guard-candidates", tables: 68, approvalRequired: true }),
    ]),
  });
}

/**
 * Compare the FULL, authoritative catalog deletion-marker snapshot with an
 * isolated restored candidate, including expired markers. Empty inventories
 * do not authorize restore. IDs never appear in error messages or the result.
 * Source authenticity and cross-owner authority remain separate release gates.
 */
export function assessUlcP02CatalogRestoreMarkers(authoritativeRows, candidateRows) {
  function indexed(rows, source) {
    if (!Array.isArray(rows) || rows.length > 100000) {
      block(source + " marker inventory unavailable");
    }
    const result = new Map();
    for (const row of rows) {
      const org = row?.organization_id;
      const principal = row?.principal_id;
      const completed = row?.completed_at;
      const purgeAfter = row?.purge_after;
      if (
        typeof org !== "string" || !/^[^\u0000]{1,200}$/.test(org) || org.trim() !== org ||
        typeof principal !== "string" || !/^[^\u0000]{1,200}$/.test(principal) ||
        principal.trim() !== principal ||
        typeof completed !== "string" || typeof purgeAfter !== "string" ||
        !Number.isFinite(Date.parse(completed)) ||
        !Number.isFinite(Date.parse(purgeAfter)) ||
        new Date(completed).toISOString() !== completed ||
        new Date(purgeAfter).toISOString() !== purgeAfter ||
        Date.parse(purgeAfter) - Date.parse(completed) !== 840 * 60 * 60 * 1000
      ) block(source + " invalid marker contract");
      const key = JSON.stringify([org, principal]);
      if (result.has(key)) block(source + " duplicate marker");
      result.set(key, completed);
    }
    return result;
  }
  const source = indexed(authoritativeRows, "authoritative");
  const restored = indexed(candidateRows, "restored");
  if (
    source.size !== restored.size ||
    [...source].some(([key, when]) => restored.get(key) !== when)
  ) block("restored marker authority differs; candidate quarantined");
  return Object.freeze({
    markersMatch: true,
    markerCount: source.size,
    promotionAuthorized: false,
    providerWritesAllowed: false,
  });
}

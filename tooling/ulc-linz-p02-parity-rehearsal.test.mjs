import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCTION_MISSING_TABLES,
  EXPECTED_MISSING_TABLE_CREATORS,
  CATALOG_GUARD_TABLES,
  CATALOG_CANDIDATES,
  CALENDAR_MIGRATION,
  P02_SCHEMA_COUNTS,
  evaluateUlcP02ParityInventory,
  loadUlcP02ParityRehearsalPlan,
  assessUlcP02CatalogRestoreMarkers,
} from "./ulc-linz-p02-parity-rehearsal.mjs";

test("P2-E pins all 15 production gaps to their exact module/app owner files", async () => {
  const plan = await loadUlcP02ParityRehearsalPlan();
  assert.equal(plan.status, "review-only");
  assert.equal(plan.migrationExecutionAuthorized, false);
  assert.equal(plan.providerWritesAllowed, false);
  assert.equal(plan.freshDatabaseInventoryRequired, true);
  assert.equal(plan.registeredFiles.length, 41);
  assert.equal(new Set(plan.registeredFiles.map(file => file.path)).size, 41);
  assert.equal(plan.isolatedCalendarFile.path, CALENDAR_MIGRATION);
  assert.deepEqual(plan.isolatedCandidateFiles.map(file => file.path), CATALOG_CANDIDATES);
  assert.deepEqual(plan.stages.map(stage => stage.tables), [51, 64, 66, 68]);
  assert.ok(plan.stages.every(stage => stage.approvalRequired));
  assert.equal(PRODUCTION_MISSING_TABLES.length, 15);
  assert.equal(CATALOG_GUARD_TABLES.length, 2);
  assert.deepEqual(EXPECTED_MISSING_TABLE_CREATORS, {
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
  }, "each production gap must remain tied to its original migration file");
  for (const [table, filename] of Object.entries(EXPECTED_MISSING_TABLE_CREATORS)) {
    assert.equal(plan.missingTableCreators[table], filename, table);
  }
  assert.equal(plan.missingTableCreators.appbasis_exercise_catalog_favorite_deletion,
    CATALOG_CANDIDATES[0]);
  assert.equal(plan.missingTableCreators.appbasis_exercise_catalog_usage_subject,
    CATALOG_CANDIDATES[1]);
  for (const table of [...PRODUCTION_MISSING_TABLES, ...CATALOG_GUARD_TABLES]) {
    const creator = plan.missingTableCreators[table];
    assert.equal(typeof creator, "string", table);
    const matches = [...plan.registeredFiles, plan.isolatedCalendarFile,
      ...plan.isolatedCandidateFiles].filter(file => file.path === creator);
    assert.equal(matches.length, 1, table);
    assert.ok(matches[0].creates.includes(table), table);
  }
  for (const file of [...plan.registeredFiles, plan.isolatedCalendarFile,
    ...plan.isolatedCandidateFiles]) {
    assert.match(file.digest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(file.statements.length > 0);
  }
  assert.deepEqual([...plan.isolatedCalendarFile.creates].sort(), [
    "ulc_linz_registration_calendar_exception",
    "ulc_linz_registration_calendar_rule",
  ]);
});

test("P2-E evaluates only exact, private-data-free table inventories", () => {
  const all = [...PRODUCTION_MISSING_TABLES, ...Array.from(
    { length: P02_SCHEMA_COUNTS.production },
    (_, i) => "synthetic_base_" + i,
  )];
  const prod = all.filter(table => !PRODUCTION_MISSING_TABLES.includes(table));
  const report = evaluateUlcP02ParityInventory({
    productionTables: prod,
    previewTables: all,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.productionReady, false);
  assert.equal(report.unapprovedWritesAllowed, false);
  assert.equal(report.productionTables, 51);
  assert.equal(report.previewTables, 66);
  assert.deepEqual(report.missingTables, [...PRODUCTION_MISSING_TABLES].sort());

  for (const input of [
    { productionTables: [...prod, prod[0]], previewTables: all },
    { productionTables: [...prod, "unexpected"], previewTables: all },
    { productionTables: prod, previewTables: all.slice(1) },
    { productionTables: prod, previewTables: [...all.slice(0, -1), "unexpected"] },
    { productionTables: [...prod.slice(1), "rogue"], previewTables: all },
    { productionTables: null, previewTables: all },
  ]) {
    assert.throws(() => evaluateUlcP02ParityInventory(input), /schema rehearsal blocked:/);
  }
});

test("P2-E excludes stale erasure-marker restores, including expired markers", () => {
  const marker = {
    organization_id: "synthetic-org",
    principal_id: "synthetic-person",
    completed_at: "2026-01-01T12:00:00.000Z",
    purge_after: "2026-02-05T12:00:00.000Z",
  };
  const same = assessUlcP02CatalogRestoreMarkers([marker], [{ ...marker }]);
  assert.deepEqual(same, {
    markersMatch: true,
    markerCount: 1,
    promotionAuthorized: false,
    providerWritesAllowed: false,
  });
  assert.equal(assessUlcP02CatalogRestoreMarkers([], []).promotionAuthorized, false);
  // Principal IDs are arbitrary canonical text, including digit 0 and 'u'.
  const validId = { ...marker, organization_id: "ulc-0", principal_id: "user-007" };
  assert.equal(assessUlcP02CatalogRestoreMarkers(
    [validId], [validId],
  ).markerCount, 1);
  assert.throws(() => assessUlcP02CatalogRestoreMarkers(
    [{ ...marker, principal_id: "bad\u0000id" }], [],
  ), /invalid marker contract/);
  for (const candidate of [
    [],
    [{ ...marker, completed_at: "2026-01-02T12:00:00.000Z",
      purge_after: "2026-02-06T12:00:00.000Z" }],
    [{ ...marker, principal_id: "other" }],
    [{ ...marker }, { ...marker }],
    [{ ...marker, purge_after: "2026-02-04T12:00:00.000Z" }],
    [{ ...marker, completed_at: "invalid" }],
  ]) {
    assert.throws(() => assessUlcP02CatalogRestoreMarkers([marker], candidate),
      /schema rehearsal blocked:/);
  }
  assert.throws(() => assessUlcP02CatalogRestoreMarkers([], [marker]),
    /restored marker authority differs/);
  // Never reflect a personal identifier in an error message.
  assert.throws(() => assessUlcP02CatalogRestoreMarkers([marker], []),
    error => !error.message.includes(marker.principal_id));
});

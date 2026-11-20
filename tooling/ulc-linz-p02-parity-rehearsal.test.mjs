import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCTION_MISSING_TABLES,
  CATALOG_GUARD_TABLES,
  CATALOG_CANDIDATES,
  CALENDAR_MIGRATION,
  P02_SCHEMA_COUNTS,
  evaluateUlcP02ParityInventory,
  loadUlcP02ParityRehearsalPlan,
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyG04CalendarPreview,
  loadG04CalendarPreviewPlan,
  migrateG04CalendarPreview,
  UlcG04CalendarPreviewError,
} from "./ulc-linz-g04-calendar-v17-preview.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const prereq = [
  "ulc_linz_training_session",
  "ulc_linz_training_registration",
  "ulc_linz_training_trainer_attendance",
];
const rules = "ulc_linz_registration_calendar_rule";
const exceptions = "ulc_linz_registration_calendar_exception";
const ruleColumns = [
  "organization_id", "group_id", "weekdays_mask", "weeks_ahead",
  "deadline_days_before", "deadline_local_time", "late_mode",
  "revision", "updated_at",
];
const exceptionColumns = [
  "organization_id", "group_id", "session_date", "kind",
  "revision", "updated_at",
];
const base = {
  tables: prereq,
  columns: [], constraints: [], triggers: [], functions: [],
};
const current = {
  tables: [...prereq, rules, exceptions],
  columns: [
    ...ruleColumns.map((column_name) => ({ table_name: rules, column_name })),
    ...exceptionColumns.map((column_name) => ({ table_name: exceptions, column_name })),
  ],
  constraints: [
    { table_name: rules, contype: "p", convalidated: true },
    { table_name: exceptions, contype: "p", convalidated: true },
  ],
  triggers: [{
    tgname: "ulc_linz_registration_calendar_guard_trg",
    tgenabled: "O",
    table_name: "ulc_linz_training_registration",
  }],
  functions: [{
    proname: "ulc_linz_registration_calendar_guard", schema_name: "public",
  }],
};

test("G-04.2c plan is based on canonical v16 and an isolated additive v17 candidate", async () => {
  const plan = await loadG04CalendarPreviewPlan({ repositoryRoot: root });
  assert.equal(plan.schemaVersion, 17);
  assert.equal(plan.environment, "generated-preview-ulc-linz");
  assert.equal(plan.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.migrationRole, "appbasis_ulc_linz_preview_migration");
  assert.equal(plan.productionChanged, false);
  assert.equal(plan.statements.length, 5);
  assert.match(plan.statements[0], /CREATE TABLE ulc_linz_registration_calendar_rule/);
  assert.match(plan.statements[1], /CREATE TABLE ulc_linz_registration_calendar_exception/);
  assert.match(plan.statements[2], /CREATE FUNCTION ulc_linz_registration_calendar_guard/);
  assert.match(plan.statements[3], /REVOKE ALL ON FUNCTION/);
  assert.match(plan.statements[4], /CREATE TRIGGER ulc_linz_registration_calendar_guard_trg/);
  const manifest = JSON.parse(await readFile(resolve(
    root, "apps/ulc-linz/appbasis.database.json",
  ), "utf8"));
  const owner = manifest.owners.find((item) => item.id === "ulc-linz-lifecycle");
  assert.equal(owner.schemaVersion, 16);
  assert.equal(owner.migrations.length, 16);
  assert.ok(!owner.migrations.includes(plan.migrationPath));
  for (const statement of plan.statements) {
    assert.doesNotMatch(statement, /\b(?:DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b/i);
  }
});

test("G-04.2c rejects incomplete v16, partial v17, broken guard, or metadata drift", () => {
  assert.equal(classifyG04CalendarPreview(base), "migration-required");
  assert.equal(classifyG04CalendarPreview(current), "current");
  const broken = [
    { ...base, tables: [] },
    { ...current, tables: [rules, ...prereq] },
    { ...current, columns: current.columns.filter((x) =>
      !(x.table_name === exceptions && x.column_name === "kind")) },
    { ...current, constraints: current.constraints.slice(0, 1) },
    { ...current, triggers: [] },
    { ...current, triggers: current.triggers.map((x) => ({ ...x, tgenabled: "D" })) },
    { ...current, functions: [] },
    { ...current, functions: current.functions.map((x) => ({ ...x, schema_name: "pg_temp" })) },
  ];
  for (const state of broken) {
    assert.throws(() => classifyG04CalendarPreview(state), UlcG04CalendarPreviewError);
  }
});

test("G-04.2c refuses apply without approval before opening any database", async () => {
  let calls = 0;
  await assert.rejects(
    migrateG04CalendarPreview({ apply: false }, {
      databaseFactory() { calls++; throw Error("unreachable"); },
    }), UlcG04CalendarPreviewError,
  );
  assert.equal(calls, 0);
});

test("G-04.2c Preview workflow is manual, environment locked and requires explicit independent gates", async () => {
  const text = await readFile(resolve(
    root, ".github/workflows/ulc-linz-g04-v17-preview.yml",
  ), "utf8");
  for (const assertion of [
    /workflow_dispatch:/,
    /options: \[inspect, migrate\]/,
    /name: generated-preview-ulc-linz/,
    /refs\/heads\/main/,
    /APPBASIS_APPLY_G04_V17_PREVIEW: "1"/,
    /APPBASIS_APPLY_MIGRATIONS: "1"/,
    /G04_BACKUP_CONFIRMED/,
    /G04_RESTORE_CONFIRMED/,
    /ulc-linz-youth-trainers-preview\.mjs verify/,
    /ulc-linz-g04-calendar-v17-preview\.mjs inspect/,
    /ulc-linz-g04-calendar-v17-preview\.mjs apply/,
    /ulc-linz-g04-calendar-v17-preview\.mjs verify/,
    /ulc-linz-d4-preview-database-access\.mjs reconcile/,
  ]) assert.match(text, assertion);
  assert.doesNotMatch(text, /schedule:|push:|pull_request:|production-runtime|APPBASIS_REGISTRATION_CALENDAR_V17: "enabled"/);
});

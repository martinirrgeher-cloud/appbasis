import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyYouthContentPreviewSchema,
  loadYouthContentPreviewPlan,
  migrateYouthContentPreview,
  UlcYouthContentPreviewError,
} from "./ulc-linz-youth-content-preview.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tables = ["ulc_linz_training_session", "ulc_linz_training_attendance"];
const baselineColumns = [
  { table_name: tables[0], column_name: "training_content_titles",
    data_type: "ARRAY", udt_name: "_text" },
  { table_name: tables[1], column_name: "training_content_slots",
    data_type: "ARRAY", udt_name: "_int2" },
];
const baselineConstraints = [
  { table_name: tables[0], constraint_name: "ulc_linz_training_content_titles_check",
    convalidated: true },
  { table_name: tables[1], constraint_name: "ulc_linz_training_content_slots_check",
    convalidated: true },
];
const v13Column = {
  table_name: tables[0], column_name: "training_content_items",
  data_type: "jsonb", udt_name: "jsonb",
  is_nullable: "NO", column_default: "'[]'::jsonb",
};
const v13Constraint = {
  table_name: tables[0], constraint_name: "ulc_linz_training_content_items_check",
  convalidated: true,
  definition: "CHECK (jsonb_typeof(training_content_items) = 'array'::text " +
    "AND jsonb_array_length(training_content_items) <= 5 AND " +
    "jsonb_array_length(training_content_items) = cardinality(training_content_titles))",
};

test("v13 migration is pinned to the additive ULC lifecycle owner", async () => {
  const plan = await loadYouthContentPreviewPlan({ repositoryRoot });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.migrationRole, "appbasis_ulc_linz_preview_migration");
  assert.equal(plan.schemaVersion, 13);
  assert.equal(plan.migrationPath,
    "apps/ulc-linz/migrations/0012_ulc_linz_youth_training_catalog.sql");
  assert.equal(plan.statements.length, 2);
  assert.equal(plan.productionChanged, false);
  assert.ok(plan.statements.every((statement) => /ALTER TABLE ulc_linz_training_session/.test(statement)));
});

test("classifies complete v12 baseline as needing only the additive v13 migration", () => {
  assert.equal(classifyYouthContentPreviewSchema({
    tables, columns: baselineColumns, constraints: baselineConstraints,
  }), "migration-required");
  assert.equal(classifyYouthContentPreviewSchema({
    tables, columns: [...baselineColumns, v13Column],
    constraints: [...baselineConstraints, v13Constraint],
  }), "current");
});

test("rejects missing v12 baseline or a partially installed or drifted schema", () => {
  const valid = { tables, columns: [...baselineColumns, v13Column],
    constraints: [...baselineConstraints, v13Constraint] };
  const invalid = [
    { tables: [], columns: baselineColumns, constraints: baselineConstraints },
    { tables, columns: [], constraints: baselineConstraints },
    { tables, columns: baselineColumns, constraints: [] },
    { ...valid, columns: baselineColumns },
    { ...valid, constraints: baselineConstraints },
    { ...valid, columns: [...baselineColumns, { ...v13Column, is_nullable: "YES" }] },
    { ...valid, columns: [...baselineColumns, { ...v13Column, column_default: null }] },
    { ...valid, constraints: [...baselineConstraints, { ...v13Constraint, convalidated: false }] },
    { ...valid, constraints: [...baselineConstraints, { ...v13Constraint, definition: "CHECK (true)" }] },
  ];
  for (const schema of invalid) {
    assert.throws(() => classifyYouthContentPreviewSchema(schema), UlcYouthContentPreviewError);
  }
});

test("requires explicit opt-in before connecting to any database", async () => {
  let connections = 0;
  await assert.rejects(
    migrateYouthContentPreview({ apply: false }, {
      databaseFactory() { connections += 1; throw Error("should not connect"); },
    }),
    /requires explicit apply=true/,
  );
  assert.equal(connections, 0);
});

test("v13 is checked before either main-preview deployment workflow updates a Worker", async () => {
  const e7b9 = await readFile(resolve(repositoryRoot,
    ".github/workflows/ulc-linz-e7b9-preview.yml"), "utf8");
  const refresh = await readFile(resolve(repositoryRoot,
    ".github/workflows/ulc-linz-e6h-preview-runtime-refresh.yml"), "utf8");
  const migrate = e7b9.indexOf("Apply additive youth-content schema-v13 preview migration");
  const v12 = e7b9.indexOf("Apply additive U12 schema-v12 preview migration");
  const reconcile = e7b9.indexOf("Reconcile preview runtime database access after migration");
  const verify = e7b9.indexOf("Require current youth-content schema-v13 before preview deployment");
  const deploy = e7b9.indexOf("Validate and mask preview runtime inputs");
  assert.ok(v12 > 0 && v12 < migrate && migrate < reconcile);
  assert.ok(verify > reconcile && verify < deploy);
  assert.ok(e7b9.includes("inputs.operation == 'migrate' && steps.youth_content_schema.outputs.state == 'migration-required'"));
  assert.ok(e7b9.includes("APPBASIS_APPLY_YOUTH_CONTENT_PREVIEW: \"1\""));
  const refreshPreflight = refresh.indexOf("Require current youth-content schema-v13 before preview runtime refresh");
  const refreshDeploy = refresh.indexOf("Resolve preview worker and URL");
  assert.ok(refreshPreflight > 0 && refreshPreflight < refreshDeploy);
  assert.ok(refresh.includes("node ./tooling/ulc-linz-youth-content-preview.mjs verify"));
  assert.ok(!e7b9.includes("appbasis_ulc_linz_production"));
  assert.ok(!refresh.includes("appbasis_ulc_linz_production"));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  classifyYouthCategoriesPreview,
  loadYouthCategoriesPreviewPlan,
  migrateYouthCategoriesPreview,
  UlcYouthCategoriesPreviewError,
} from "./ulc-linz-youth-categories-preview.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = {
  tables: ["ulc_linz_training_session", "ulc_linz_training_attendance"],
  columns: [{
    table_name: "ulc_linz_training_session", column_name: "training_content_items",
    data_type: "jsonb", is_nullable: "NO",
  }],
  constraints: [{
    conname: "ulc_linz_training_content_items_check", convalidated: true,
  }],
  indexes: [],
};
const v14 = {
  tables: [...base.tables, "ulc_linz_youth_content_category"],
  columns: [...base.columns, ...[
    ["organization_id", "text", null],
    ["code", "text", null],
    ["label", "text", null],
    ["is_active", "boolean", "true"],
    ["revision", "integer", "1"],
    ["created_at", "timestamp with time zone", null],
    ["updated_at", "timestamp with time zone", null],
  ].map(([column_name, data_type, column_default]) => ({
    table_name: "ulc_linz_youth_content_category",
    column_name, data_type, column_default, is_nullable: "NO",
  }))],
  constraints: [...base.constraints, ...[
    "ulc_linz_youth_category_pk", "ulc_linz_youth_category_code_check",
    "ulc_linz_youth_category_label_check", "ulc_linz_youth_category_revision_check",
  ].map((conname) => ({ conname, convalidated: true }))],
  indexes: [
    { indexname: "ulc_linz_youth_category_name_unique" },
    { indexname: "ulc_linz_youth_category_active_idx" },
  ],
};

test("publishes exactly the reviewed additive youth-category table migration", async () => {
  const plan = await loadYouthCategoriesPreviewPlan({ repositoryRoot: root });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.environment, "generated-preview-ulc-linz");
  assert.equal(plan.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.migrationRole, "appbasis_ulc_linz_preview_migration");
  assert.equal(plan.schemaVersion, 14);
  assert.equal(plan.statements.length, 3);
  assert.equal(plan.productionChanged, false);
  assert.ok(plan.statements[0].includes("CREATE TABLE ulc_linz_youth_content_category"));
  assert.ok(plan.statements.slice(1).every((statement) => statement.startsWith("CREATE")));
});

test("refuses partial migration and validates v13 prerequisite", () => {
  assert.equal(classifyYouthCategoriesPreview(base), "migration-required");
  assert.equal(classifyYouthCategoriesPreview(v14), "current");
  for (const broken of [
    { ...base, tables: [] },
    { ...v14, columns: [...base.columns] },
    { ...v14, indexes: [] },
    { ...v14, constraints: [...base.constraints] },
    { ...v14, columns: v14.columns.map((c) => c.column_name === "revision"
      ? { ...c, column_default: "2" } : c) },
  ]) {
    assert.throws(() => classifyYouthCategoriesPreview(broken),
      UlcYouthCategoriesPreviewError);
  }
});

test("v14 apply refuses a call without explicit mutation approval", async () => {
  let connections = 0;
  await assert.rejects(migrateYouthCategoriesPreview({ apply: false }, {
    databaseFactory() { connections++; throw Error("unreachable"); },
  }), /explicit apply=true/);
  assert.equal(connections, 0);
});

test("both preview-deploy paths fail closed when v14 table is missing", async () => {
  const e7b9 = await readFile(resolve(root, ".github/workflows/ulc-linz-e7b9-preview.yml"), "utf8");
  const refresh = await readFile(resolve(root, ".github/workflows/ulc-linz-e6h-preview-runtime-refresh.yml"), "utf8");
  const v13 = e7b9.indexOf("Apply additive youth-content schema-v13 preview migration");
  const v14 = e7b9.indexOf("Apply shared youth categories schema-v14 preview migration");
  const reconcile = e7b9.indexOf("Reconcile preview runtime database access after migration");
  const verify = e7b9.indexOf("Require shared youth categories schema-v14 before preview deployment");
  const worker = e7b9.indexOf("Validate and mask preview runtime inputs");
  assert.ok(v13 > 0 && v13 < v14 && v14 < reconcile && reconcile < verify && verify < worker);
  assert.ok(e7b9.includes('APPBASIS_APPLY_YOUTH_CATEGORIES_PREVIEW: "1"'));
  const refreshGuard = refresh.indexOf("Require shared youth categories schema-v14 before preview runtime refresh");
  const refreshWorker = refresh.indexOf("Resolve preview worker and URL");
  assert.ok(refreshGuard > 0 && refreshGuard < refreshWorker);
  assert.ok(!e7b9.includes("appbasis_ulc_linz_production"));
  assert.ok(!refresh.includes("appbasis_ulc_linz_production"));
});

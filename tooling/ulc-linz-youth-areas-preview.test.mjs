import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyYouthAreasPreview,
  loadYouthAreasPreviewPlan,
  migrateYouthAreasPreview,
  UlcYouthAreasPreviewError,
} from "./ulc-linz-youth-areas-preview.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const base = {
  tables: ["ulc_linz_youth_content_category"],
  columns: [{
    table_name: "ulc_linz_youth_content_category",
    column_name: "revision", data_type: "integer", is_nullable: "NO",
  }],
  constraints: [],
  indexes: [{ indexname: "ulc_linz_youth_category_name_unique" }],
};
const installed = {
  tables: [...base.tables, "ulc_linz_youth_group_category"],
  columns: [...base.columns, ...[
    ["organization_id", "text", null], ["training_area", "text", null],
    ["code", "text", null], ["label", "text", null],
    ["is_active", "boolean", "true"], ["revision", "integer", "1"],
    ["created_at", "timestamp with time zone", null],
    ["updated_at", "timestamp with time zone", null],
  ].map(([column_name, data_type, column_default]) => ({
    table_name: "ulc_linz_youth_group_category", column_name, data_type,
    column_default, is_nullable: "NO",
  }))],
  constraints: [
    "ulc_linz_youth_group_category_pk", "ulc_linz_youth_group_category_area_check",
    "ulc_linz_youth_group_category_code_check",
    "ulc_linz_youth_group_category_label_check",
    "ulc_linz_youth_group_category_revision_check",
  ].map((conname) => ({ conname, convalidated: true })),
  indexes: [...base.indexes,
    { indexname: "ulc_linz_youth_group_category_name_unique" },
    { indexname: "ulc_linz_youth_group_category_active_idx" }],
};

test("v15 creates independent area table without touching existing U12 categories or sessions", async () => {
  const plan = await loadYouthAreasPreviewPlan({ repositoryRoot: root });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.environment, "generated-preview-ulc-linz");
  assert.equal(plan.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.schemaVersion, 15);
  assert.equal(plan.statements.length, 3);
  assert.equal(plan.productionChanged, false);
  assert.ok(plan.statements[0].includes("CREATE TABLE ulc_linz_youth_group_category"));
  assert.ok(plan.statements[0].includes("training_area IN ('u14', 'kindertraining')"));
  assert.ok(plan.statements[1].includes("organization_id, training_area, lower(label)"));
  for (const statement of plan.statements) {
    assert.doesNotMatch(statement, /\b(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER)\b/i);
    assert.doesNotMatch(statement, /ulc_linz_training_session|ulc_linz_training_attendance/);
  }
});

test("v15 verifies prerequisite and refuses partial state", () => {
  assert.equal(classifyYouthAreasPreview(base), "migration-required");
  assert.equal(classifyYouthAreasPreview(installed), "current");
  for (const broken of [
    { ...base, tables: [] },
    { ...installed, columns: base.columns },
    { ...installed, constraints: [] },
    { ...installed, indexes: base.indexes },
    { ...installed, columns: installed.columns.map((c) => c.column_name === "revision"
      && c.table_name === "ulc_linz_youth_group_category"
      ? { ...c, column_default: "2" } : c) },
  ]) {
    assert.throws(() => classifyYouthAreasPreview(broken), UlcYouthAreasPreviewError);
  }
});

test("v15 mutation without explicit approval is refused before any DB connection", async () => {
  let connections = 0;
  await assert.rejects(migrateYouthAreasPreview({ apply: false }, {
    databaseFactory() { connections++; throw Error("unreachable"); },
  }), /explicit apply=true/);
  assert.equal(connections, 0);
});

test("v15 Preview workflow requires explicit main and apply, then verifies DB and permissions", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/ulc-linz-youth-v15-preview.yml"), "utf8");
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.match(workflow, /options: \[inspect, migrate\]/);
  assert.match(workflow, /test "\$EXPECTED_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$APPROVED" = "1"/);
  assert.match(workflow, /name: generated-preview-ulc-linz/);
  assert.match(workflow, /group: generated-preview-ulc-linz/);
  assert.match(workflow, /ulc-linz-youth-categories-preview\.mjs verify/);
  assert.match(workflow, /steps\.v15\.outputs\.state == 'migration-required'/);
  assert.match(workflow, /APPBASIS_APPLY_YOUTH_AREAS_PREVIEW: "1"/);
  assert.match(workflow, /ulc-linz-youth-areas-preview\.mjs verify/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs reconcile/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs preflight-existing/);
  assert.doesNotMatch(workflow, /appbasis_ulc_linz_production|secrets\.PRODUCTION/);
  const steps = [
    "Verify U12 categories schema-v14 prerequisite",
    "Inspect independent group categories schema-v15",
    "Apply schema-v15 when required",
    "Reconcile preview runtime database access",
    "Verify independent group categories schema-v15",
    "Verify runtime database permissions",
  ];
  let previous = -1;
  for (const step of steps) {
    const index = workflow.indexOf("- name: " + step);
    assert.ok(index > previous, "Missing or unordered step: " + step);
    previous = index;
  }
});

test("both preview deploy routes fail closed without v15 schema", async () => {
  const workflows = [
    ".github/workflows/ulc-linz-e6h-preview-runtime-refresh.yml",
    ".github/workflows/ulc-linz-e7b9-preview.yml",
  ];
  for (const filename of workflows) {
    const workflow = await readFile(resolve(root, filename), "utf8");
    const guard = workflow.indexOf("Require shared youth categories schema-v15");
    assert.ok(guard > 0);
    assert.ok(workflow.includes("node ./tooling/ulc-linz-youth-areas-preview.mjs verify"));
    const deploy = workflow.indexOf(
      filename.includes("e6h") ? "Deploy standard-module ULC preview runtime" :
        "Validate and mask preview runtime inputs",
    );
    assert.ok(deploy > guard);
  }
});

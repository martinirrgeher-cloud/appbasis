import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyYouthTrainersPreview, loadYouthTrainersPreviewPlan,
  migrateYouthTrainersPreview, UlcYouthTrainersPreviewError,
} from "./ulc-linz-youth-trainers-preview.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const prior = {
  tables: ["ulc_linz_youth_group_category"],
  columns: [], constraints: [],
  indexes: [{ indexname: "ulc_linz_youth_group_category_active_idx" }],
};
const installed = {
  tables: [...prior.tables, "ulc_linz_training_trainer_attendance"],
  columns: [
    ["organization_id", "text"], ["session_id", "text"], ["trainer_id", "text"],
    ["created_at", "timestamp with time zone"], ["updated_at", "timestamp with time zone"],
  ].map(([column_name, data_type]) => ({
    table_name: "ulc_linz_training_trainer_attendance", column_name, data_type,
    is_nullable: "NO",
  })),
  constraints: [
    "ulc_linz_training_trainer_attendance_pk",
    "ulc_linz_training_trainer_attendance_session_id_fkey",
    "ulc_linz_training_trainer_attendance_trainer_id_fkey",
  ].map((conname) => ({ conname, convalidated: true })),
  indexes: [...prior.indexes,
    { indexname: "ulc_linz_training_trainer_attendance_org_session_idx" }],
};

test("v16 adds only the scoped trainer presence table", async () => {
  const plan = await loadYouthTrainersPreviewPlan({ repositoryRoot: root });
  assert.equal(plan.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.schemaVersion, 16);
  assert.equal(plan.environment, "generated-preview-ulc-linz");
  assert.equal(plan.statements.length, 2);
  assert.equal(plan.productionChanged, false);
  assert.match(plan.statements[0], /CREATE TABLE ulc_linz_training_trainer_attendance/);
  assert.match(plan.statements[0], /REFERENCES ulc_linz_training_session\(id\) ON DELETE CASCADE/);
  assert.match(plan.statements[0], /REFERENCES appbasis_trainer\(id\) ON DELETE CASCADE/);
  assert.match(plan.statements[0], /PRIMARY KEY \(session_id, trainer_id\)/);
  assert.match(plan.statements[1], /CREATE INDEX ulc_linz_training_trainer_attendance_org_session_idx/);
  for (const statement of plan.statements) {
    assert.doesNotMatch(statement, /\b(?:DROP|TRUNCATE|ALTER\s+TABLE|DELETE\s+FROM)\b/i);
  }
});

test("v16 requires complete v15 and fails closed on partial v16 state", () => {
  assert.equal(classifyYouthTrainersPreview(prior), "migration-required");
  assert.equal(classifyYouthTrainersPreview(installed), "current");
  for (const input of [
    { ...prior, tables: [] },
    { ...installed, columns: [] },
    { ...installed, indexes: prior.indexes },
    { ...installed, constraints: [] },
    { ...installed, constraints: installed.constraints.map((c) => ({ ...c, convalidated: false })) },
  ]) {
    assert.throws(() => classifyYouthTrainersPreview(input), UlcYouthTrainersPreviewError);
  }
});

test("v16 mutation requires apply=true before credentials or SQL access", async () => {
  let connections = 0;
  await assert.rejects(migrateYouthTrainersPreview({ apply: false }, {
    databaseFactory() { connections++; throw Error("unreachable"); },
  }), /explicit apply=true/);
  assert.equal(connections, 0);
});

test("v16 manual workflow is Preview-only and strictly gated", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/ulc-linz-youth-v16-preview.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /options: \[inspect, migrate\]/);
  assert.match(workflow, /test "\$EXPECTED_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$APPROVED" = "1"/);
  assert.match(workflow, /name: generated-preview-ulc-linz/);
  assert.match(workflow, /ulc-linz-youth-areas-preview\.mjs verify/);
  assert.match(workflow, /APPBASIS_APPLY_YOUTH_TRAINERS_PREVIEW: "1"/);
  assert.match(workflow, /ulc-linz-youth-trainers-preview\.mjs verify/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs reconcile/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs preflight-existing/);
  assert.doesNotMatch(workflow, /appbasis_ulc_linz_production|secrets\.PRODUCTION/);
});

test("both ULC preview deployment workflows reject an absent v16 schema", async () => {
  for (const path of [
    ".github/workflows/ulc-linz-e6h-preview-runtime-refresh.yml",
    ".github/workflows/ulc-linz-e7b9-preview.yml",
  ]) {
    const workflow = await readFile(resolve(root, path), "utf8");
    const check = workflow.indexOf("Require trainer attendance schema-v16");
    const deploy = workflow.indexOf(path.includes("e6h")
      ? "Deploy standard-module ULC preview runtime" :
        "Validate and mask preview runtime inputs");
    assert.ok(check > 0 && deploy > check);
    assert.match(workflow, /ulc-linz-youth-trainers-preview\.mjs verify/);
  }
});

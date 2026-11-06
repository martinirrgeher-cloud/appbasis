import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyU12PreviewSchema,
  loadU12PreviewSchemaPlan,
  migrateU12PreviewSchema,
  UlcU12PreviewSchemaError,
} from "./ulc-linz-u12-preview.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tables = [
  "ulc_linz_training_session", "ulc_linz_training_attendance",
  "ulc_linz_training_registration", "ulc_linz_training_registration_change",
];
const notes = [
  { table_name: "ulc_linz_training_registration", column_name: "note" },
  { table_name: "ulc_linz_training_registration_change", column_name: "note" },
];
const v12columns = [
  {
    table_name: "ulc_linz_training_session", column_name: "training_content_titles",
    udt_name: "_text", data_type: "ARRAY", is_nullable: "NO",
    column_default: "ARRAY[]::text[]",
  },
  {
    table_name: "ulc_linz_training_attendance", column_name: "training_content_slots",
    udt_name: "_int2", data_type: "ARRAY", is_nullable: "NO",
    column_default: "ARRAY[]::smallint[]",
  },
];
const constraints = [
  {
    table_name: "ulc_linz_training_session",
    constraint_name: "ulc_linz_training_content_titles_check",
    definition: "CHECK (cardinality(training_content_titles) <= 5 AND array_position(training_content_titles, NULL::text) IS NULL AND char_length(array_to_string(training_content_titles, ''::text)) <= 600)",
  },
  {
    table_name: "ulc_linz_training_attendance",
    constraint_name: "ulc_linz_training_content_slots_check",
    definition: "CHECK (cardinality(training_content_slots) <= 5 AND array_position(training_content_slots, NULL::smallint) IS NULL AND status = 'present' AND training_content_slots <@ ARRAY[1,2,3,4,5]::smallint[])",
  },
];

test("U12 preview pins the canonical additive schema v12 migration, not a new database owner", async () => {
  const plan = await loadU12PreviewSchemaPlan({ repositoryRoot: root });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.environment, "generated-preview-ulc-linz");
  assert.equal(plan.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.migrationRole, "appbasis_ulc_linz_preview_migration");
  assert.equal(plan.schemaVersion, 12);
  assert.equal(plan.productionChanged, false);
  assert.equal(plan.statements.length, 4);
  assert.ok(plan.statements.every((statement) => /^--[\s\S]*?\bALTER TABLE\b|^ALTER TABLE\b/.test(statement)));
  assert.equal(plan.migrationPath, "apps/ulc-linz/migrations/0011_ulc_linz_youth_training_content.sql");
});

test("U12 preview classifies a complete v11 baseline as migration-required without writing", () => {
  assert.equal(classifyU12PreviewSchema({ tables, columns: notes, constraints: [] }), "migration-required");
});

test("U12 preview accepts only both new columns, defaults and constraints", () => {
  assert.equal(classifyU12PreviewSchema({
    tables, columns: [...notes, ...v12columns], constraints,
  }), "current");
  assert.throws(() => classifyU12PreviewSchema({
    tables, columns: [...notes, v12columns[0]], constraints,
  }), UlcU12PreviewSchemaError);
  assert.throws(() => classifyU12PreviewSchema({
    tables, columns: [...notes, ...v12columns],
    constraints: [constraints[0]],
  }), UlcU12PreviewSchemaError);
  assert.throws(() => classifyU12PreviewSchema({
    tables, columns: [...notes, {...v12columns[0], is_nullable: "YES"}, v12columns[1]],
    constraints,
  }), UlcU12PreviewSchemaError);
  assert.throws(() => classifyU12PreviewSchema({
    tables, columns: [...notes, ...v12columns],
    constraints: [constraints[0], {...constraints[1], definition: "CHECK (true)"}],
  }), UlcU12PreviewSchemaError);
});

test("U12 preview requires registration note baseline and the exact session tables", () => {
  assert.throws(() => classifyU12PreviewSchema({ tables: [], columns: notes, constraints: [] }), UlcU12PreviewSchemaError);
  assert.throws(() => classifyU12PreviewSchema({
    tables, columns: [notes[0]], constraints: [],
  }), UlcU12PreviewSchemaError);
});

test("U12 preview requires explicit apply before opening any database connection", async () => {
  await assert.rejects(
    migrateU12PreviewSchema({
      migrationDatabaseUrl: "postgresql://example.invalid",
      apply: false,
    }),
    /explicit apply=true/,
  );
});

test("E7B9 preview requires schema v12 before deploy and keeps a separate authorized migrate step", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/ulc-linz-e7b9-preview.yml"), "utf8");
  assert.match(workflow, /ULC E7B9 Training Plans Preview/);
  assert.match(workflow, /ULC E7B9 preview operations are main-only/);
  assert.match(workflow, /Require explicit authorization for mutation/);
  assert.match(workflow, /Inspect existing U12 schema-v12 preview state/);
  assert.match(workflow, /Apply additive U12 schema-v12 preview migration/);
  assert.match(workflow, /APPBASIS_APPLY_U12_PREVIEW: "1"/);
  assert.match(workflow, /Verify U12 schema-v12 after migration/);
  assert.match(workflow, /Require current U12 schema-v12 before preview deployment or acceptance/);
  assert.match(workflow, /if: inputs.operation == 'deploy' \|\| inputs.operation == 'accept' \|\| inputs.operation == 'deploy-accept'/);
  assert.match(workflow, /node \.\/tooling\/ulc-linz-u12-preview\.mjs verify/);
  assert.doesNotMatch(workflow, /appbasis_ulc_linz_production/);
});

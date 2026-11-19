import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  inspectUlcLifecycleSchema,
  loadUlcLifecycleRepairPlan,
  ULC_LIFECYCLE_REPAIR_PATHS,
  ULC_LIFECYCLE_REPAIR_TABLES,
} from "./ulc-linz-lifecycle-schema-reconcile.mjs";

const baseline = [
  "appbasis_athletes_deletion",
  "appbasis_training_block_favorite",
  "appbasis_training_block_usage",
  "appbasis_training_documentation",
  "appbasis_training_documentation_revision",
];
const routines = [
  "appbasis_training_documentation_guard_subject",
  "appbasis_training_documentation_guard_root_insert",
  "appbasis_training_documentation_guard_revision_write",
];
const triggers = [
  "appbasis_training_documentation_guard_root",
  "appbasis_training_documentation_guard_revision",
];

function client({ tables = baseline, functions = [], triggers: triggerNames = [] } = {}) {
  return {
    async unsafe(query) {
      if (query.includes("pg_catalog.pg_tables")) {
        return tables.map(name => ({ name }));
      }
      if (query.includes("pg_catalog.pg_proc")) {
        return functions.map(name => ({ name }));
      }
      if (query.includes("pg_catalog.pg_trigger")) {
        return triggerNames.map(name => ({ name }));
      }
      throw new Error("unexpected catalog query");
    },
  };
}

test("loads precisely the three canonical, already declared lifecycle migrations", async () => {
  const plan = await loadUlcLifecycleRepairPlan();
  assert.deepEqual(plan.map(item => item.path), ULC_LIFECYCLE_REPAIR_PATHS);
  assert.ok(plan.every(item =>
    item.statementCount > 0 &&
    item.statements.length === item.statementCount &&
    /^[0-9a-f]{64}$/.test(item.sha256)
  ));
  assert.deepEqual(ULC_LIFECYCLE_REPAIR_TABLES, [
    "appbasis_training_block_favorite_deletion",
    "appbasis_training_block_usage_subject",
    "appbasis_training_block_usage_subject_deletion",
    "appbasis_training_documentation_subject_deletion",
  ]);
});

test("missing slice yields only a reviewable plan, without writing SQL", async () => {
  const c = client({ tables: [...baseline, "ulc_linz_registration_calendar_rule"] });
  const state = await inspectUlcLifecycleSchema(c);
  assert.equal(state.state, "migration-required");
  assert.deepEqual(state.requiredMigrations, ULC_LIFECYCLE_REPAIR_PATHS);
  assert.deepEqual(state.missingTables, ULC_LIFECYCLE_REPAIR_TABLES);
});

test("complete slice returns current and never schedules reapplication", async () => {
  const state = await inspectUlcLifecycleSchema(client({
    tables: [...baseline, ...ULC_LIFECYCLE_REPAIR_TABLES],
    functions: routines,
    triggers,
  }));
  assert.equal(state.state, "current");
  assert.deepEqual(state.requiredMigrations, []);
  assert.deepEqual(state.missingTables, []);
});

test("partial migrations or orphaned security functions are blocked", async () => {
  for (const incomplete of [
    { tables: [...baseline, ULC_LIFECYCLE_REPAIR_TABLES[0]] },
    { tables: baseline, functions: [routines[0]] },
    { tables: [...baseline, ...ULC_LIFECYCLE_REPAIR_TABLES], functions: routines },
    { tables: [...baseline, ...ULC_LIFECYCLE_REPAIR_TABLES], functions: routines, triggers: [triggers[0]] },
  ]) {
    await assert.rejects(
      inspectUlcLifecycleSchema(client(incomplete)),
      /partial or drifted/,
    );
  }
});

test("missing owner baseline and malformed catalog data block instead of guessing", async () => {
  await assert.rejects(
    inspectUlcLifecycleSchema(client({ tables: baseline.slice(0, 4) })),
    /required baseline tables absent/,
  );
  await assert.rejects(
    inspectUlcLifecycleSchema(client({ tables: [{ bogus: "unknown" }] })),
    /PostgreSQL catalog returned invalid identifiers/,
  );
  await assert.rejects(inspectUlcLifecycleSchema(null), /metadata client unavailable/);
});

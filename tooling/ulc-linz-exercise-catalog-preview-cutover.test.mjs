import assert from "node:assert/strict";
import test from "node:test";

import {
  loadUlcExerciseCatalogPreviewCutoverPlan,
  verifyUlcExerciseCatalogPreviewFinalEquality,
  UlcExerciseCatalogPreviewCutoverExecutionError,
} from "./ulc-linz-exercise-catalog-preview-cutover.mjs";

const MIGRATION_URL =
  "postgresql://appbasis_ulc_linz_preview_migration:password@" +
  "ep-c3c-test.eu-central-1.aws.neon.tech/" +
  "appbasis_ulc_linz_preview?sslmode=require";

test("C3C plan pins two separately approved preview runtime phases", async () => {
  const plan = await loadUlcExerciseCatalogPreviewCutoverPlan();

  assert.equal(plan.state, "ready-for-explicit-preview-cutover-gates");
  assert.equal(plan.preview.environment, "generated-preview-ulc-linz");
  assert.equal(plan.preview.database, "appbasis_ulc_linz_preview");
  assert.equal(plan.tables.length, 4);
  assert.deepEqual(
    plan.phases.map((phase) => phase.id),
    ["quiesce", "final-equality", "runtime-cutover"],
  );
  assert.equal(plan.phases[0].runtimeMode, "legacy-read-writes-blocked");
  assert.equal(plan.phases[2].runtimeMode, "standard-module");
  assert.equal(plan.productionChanged, false);
  assert.equal(plan.sourceRetirementIncluded, false);
});

test("C3C final equality verifies all mapped rows inside one read-only repeatable-read transaction", async () => {
  const adoption = adoptionPlan();
  const queries = [];
  const sql = {
    async unsafe(query) {
      queries.push(query);
      return successfulQueryResult(query, adoption.copy.tables);
    },
  };
  let beginCalls = 0;
  let endCalls = 0;
  const result = await verifyUlcExerciseCatalogPreviewFinalEquality(
    { connectionString: MIGRATION_URL },
    {
      repositoryRoot: ".",
      loadPlan: async () => ({
        state: "ready-for-explicit-preview-cutover-gates",
      }),
      loadAdoptionPlan: async () => adoption,
      databaseFactory() {
        return {
          client: {
            async begin(callback) {
              beginCalls += 1;
              return callback(sql);
            },
            async end() {
              endCalls += 1;
            },
          },
        };
      },
    },
  );

  assert.equal(beginCalls, 1);
  assert.equal(endCalls, 1);
  assert.equal(result.state, "final-source-target-equality-pass");
  assert.equal(result.finalMappedContentEquality, true);
  assert.equal(result.tables.length, 4);
  assert.ok(
    queries.includes(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    ),
  );
  assert.equal(
    queries.filter((query) => query.includes("EXCEPT ALL")).length,
    4,
  );
});

test("C3C final equality fails closed on any mapped content drift", async () => {
  const adoption = adoptionPlan();
  const sql = {
    async unsafe(query) {
      if (query.includes("EXCEPT ALL")) return [{ count: 1 }];
      return successfulQueryResult(query, adoption.copy.tables);
    },
  };

  await assert.rejects(
    verifyUlcExerciseCatalogPreviewFinalEquality(
      { connectionString: MIGRATION_URL },
      {
        repositoryRoot: ".",
        loadPlan: async () => ({
          state: "ready-for-explicit-preview-cutover-gates",
        }),
        loadAdoptionPlan: async () => adoption,
        databaseFactory() {
          return {
            client: {
              async begin(callback) {
                return callback(sql);
              },
              async end() {},
            },
          };
        },
      },
    ),
    (error) =>
      error instanceof UlcExerciseCatalogPreviewCutoverExecutionError &&
      /mapped content mismatch/.test(error.message),
  );
});

function adoptionPlan() {
  const tables = [
    table(
      "ulc_linz_exercise_catalog_item",
      "appbasis_exercise_catalog_item",
      ["organization_id", "id"],
      [
        ["id", "id"],
        ["organization_id", "organization_id"],
        ["name", "name"],
      ],
    ),
    table(
      "ulc_linz_exercise_parameter",
      "appbasis_exercise_catalog_parameter",
      ["organization_id", "exercise_id", "parameter_key"],
      [
        ["organization_id", "organization_id"],
        ["exercise_id", "exercise_id"],
        ["parameter_key", "parameter_key"],
      ],
    ),
    table(
      "ulc_linz_exercise_group",
      "appbasis_exercise_catalog_audience",
      ["organization_id", "exercise_id", "audience_id"],
      [
        ["organization_id", "organization_id"],
        ["exercise_id", "exercise_id"],
        ["group_id", "audience_id"],
      ],
    ),
    table(
      "ulc_linz_exercise_favorite",
      "appbasis_exercise_catalog_favorite",
      ["organization_id", "principal_id", "exercise_id"],
      [
        ["organization_id", "organization_id"],
        ["identity_id", "principal_id"],
        ["exercise_id", "exercise_id"],
      ],
    ),
  ];
  return {
    repositoryState: "published-target",
    copy: { tables },
  };
}

function table(sourceTable, targetTable, targetKey, columns) {
  return {
    sourceTable,
    targetTable,
    targetKey,
    columns: columns.map(([source, target]) => ({ source, target })),
  };
}

function successfulQueryResult(query, tables) {
  if (query.startsWith("SET TRANSACTION")) return [];
  if (query.startsWith("SELECT current_database()")) {
    return [
      {
        database_name: "appbasis_ulc_linz_preview",
        principal_name: "appbasis_ulc_linz_preview_migration",
      },
    ];
  }
  if (query.startsWith("SELECT to_regclass")) {
    return [{ relation_name: "present" }];
  }
  if (query.includes("information_schema.columns")) {
    const tableName = /table_name = '([^']+)'/.exec(query)?.[1];
    const mapping = tables.find(
      (entry) =>
        entry.sourceTable === tableName || entry.targetTable === tableName,
    );
    if (mapping === undefined) throw new Error("unexpected column query");
    const source = mapping.sourceTable === tableName;
    return [
      ...new Set(
        mapping.columns.map((column) =>
          source ? column.source : column.target,
        ),
      ),
    ].map((column_name) => ({ column_name }));
  }
  if (query.includes("c.contype = 'p'")) {
    const tableName = /r\.relname = '([^']+)'/.exec(query)?.[1];
    const mapping = tables.find((entry) => entry.targetTable === tableName);
    if (mapping === undefined) throw new Error("unexpected primary key query");
    return [{ columns: mapping.targetKey }];
  }
  if (query.includes("LEFT JOIN")) return [{ count: 0 }];
  if (query.includes("EXCEPT ALL")) return [{ count: 0 }];
  if (query.includes("GROUP BY organization_id")) {
    return [{ organization_id: "org-1", count: 1 }];
  }
  if (query.includes("count(*)::int AS count")) return [{ count: 1 }];
  throw new Error("unexpected query: " + query);
}

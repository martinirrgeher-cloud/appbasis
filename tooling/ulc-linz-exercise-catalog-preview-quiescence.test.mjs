import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcExerciseCatalogPreviewSourceWriteQuiescence,
  verifyUlcExerciseCatalogPreviewSourceWriteQuiescence,
  UlcExerciseCatalogPreviewQuiescenceConfigurationError,
} from "./ulc-linz-exercise-catalog-preview-quiescence.mjs";

const HOST = "ep-c3c-quiescence.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_URL =
  "postgresql://appbasis_ulc_linz_preview_migration:owner-password@" +
  HOST +
  "/" +
  DATABASE +
  "?sslmode=require";
const APPLICATION_URL =
  "postgresql://appbasis_ulc_linz_preview_app:app-password@" +
  HOST +
  "/" +
  DATABASE +
  "?sslmode=require";
const SECURITY_URL =
  "postgresql://appbasis_ulc_linz_preview_security:security-password@" +
  HOST +
  "/" +
  DATABASE +
  "?sslmode=require";

test("C3C quiescence requires explicit mutation approval", async () => {
  await assert.rejects(
    applyUlcExerciseCatalogPreviewSourceWriteQuiescence({
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
      apply: false,
    }),
    (error) =>
      error instanceof
        UlcExerciseCatalogPreviewQuiescenceConfigurationError &&
      /explicit apply=true/.test(error.message),
  );
});

test("C3C quiescence revokes source writes and prepares target DML atomically", async () => {
  const queries = [];
  let beginCalls = 0;
  const tables = cutoverTables();

  const result =
    await applyUlcExerciseCatalogPreviewSourceWriteQuiescence(
      {
        migrationDatabaseUrl: MIGRATION_URL,
        applicationDatabaseUrl: APPLICATION_URL,
        securityLogDatabaseUrl: SECURITY_URL,
        apply: true,
      },
      {
        repositoryRoot: ".",
        loadPlan: async () => ({
          state: "ready-for-explicit-preview-cutover-gates",
          preview: { database: DATABASE },
          tables,
        }),
        databaseFactory(databaseUrl) {
          if (databaseUrl === APPLICATION_URL) {
            return applicationDatabase();
          }
          assert.equal(databaseUrl, MIGRATION_URL);
          return {
            client: {
              async begin(callback) {
                beginCalls += 1;
                return callback(fakeSql(queries, tables));
              },
              async end() {},
            },
          };
        },
      },
    );

  assert.equal(beginCalls, 1);
  assert.equal(result.state, "preview-source-writes-quiesced");
  assert.equal(result.sourceWritesBlocked, true);
  assert.equal(result.targetRuntimeDmlReady, true);
  assert.equal(result.tables.length, 4);
  assert.equal(
    queries.filter((query) =>
      query.startsWith(
        "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN",
      ),
    ).length,
    4,
  );
  assert.equal(
    queries.filter((query) =>
      query.startsWith(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE",
      ),
    ).length,
    4,
  );
});

test("C3C read-only guard verification proves the same effective privileges without mutation", async () => {
  const queries = [];
  const tables = cutoverTables();
  const result =
    await verifyUlcExerciseCatalogPreviewSourceWriteQuiescence(
      {
        migrationDatabaseUrl: MIGRATION_URL,
        applicationDatabaseUrl: APPLICATION_URL,
        securityLogDatabaseUrl: SECURITY_URL,
      },
      {
        repositoryRoot: ".",
        loadPlan: async () => ({
          state: "ready-for-explicit-preview-cutover-gates",
          preview: { database: DATABASE },
          tables,
        }),
        databaseFactory(databaseUrl) {
          if (databaseUrl === APPLICATION_URL) {
            return applicationDatabase();
          }
          assert.equal(databaseUrl, MIGRATION_URL);
          return {
            client: {
              ...fakeSql(queries, tables),
              async end() {},
            },
          };
        },
      },
    );

  assert.equal(result.state, "preview-source-write-quiescence-verified");
  assert.equal(result.sourceWritesBlocked, true);
  assert.equal(result.targetRuntimeDmlReady, true);
  assert.equal(
    queries.some(
      (query) =>
        query.startsWith("GRANT ") || query.startsWith("REVOKE "),
    ),
    false,
  );
});

function applicationDatabase() {
  return {
    client: {
      async unsafe(query) {
        assert.match(query, /current_database/);
        return [
          {
            database_name: DATABASE,
            principal_name: "appbasis_ulc_linz_preview_app",
          },
        ];
      },
      async end() {},
    },
  };
}

function cutoverTables() {
  return [
    pair(
      "ulc_linz_exercise_catalog_item",
      "appbasis_exercise_catalog_item",
    ),
    pair(
      "ulc_linz_exercise_parameter",
      "appbasis_exercise_catalog_parameter",
    ),
    pair(
      "ulc_linz_exercise_group",
      "appbasis_exercise_catalog_audience",
    ),
    pair(
      "ulc_linz_exercise_favorite",
      "appbasis_exercise_catalog_favorite",
    ),
  ];
}

function pair(sourceTable, targetTable) {
  return { sourceTable, targetTable, targetKey: [], columns: [] };
}

function fakeSql(queries, tables) {
  return {
    async unsafe(query, parameters) {
      queries.push(query);

      if (query.startsWith("SELECT current_database()")) {
        return [
          {
            database_name: DATABASE,
            principal_name: "appbasis_ulc_linz_preview_migration",
          },
        ];
      }
      if (query.includes("FROM pg_catalog.pg_roles")) {
        return [
          {
            rolcanlogin: true,
            rolsuper: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolbypassrls: false,
          },
        ];
      }
      if (query.includes("pg_catalog.pg_auth_members")) {
        return [{ count: 0 }];
      }
      if (
        query.includes("AS database_count") &&
        query.includes("AS relation_count")
      ) {
        return [
          {
            database_count: 0,
            schema_count: 0,
            relation_count: 0,
          },
        ];
      }
      if (query.startsWith("SELECT to_regclass")) {
        return [{ relation_name: "present" }];
      }
      if (
        query.startsWith("GRANT ") ||
        query.startsWith("REVOKE ")
      ) {
        return [];
      }
      if (query.startsWith("SELECT has_table_privilege")) {
        const relation = parameters?.[1] ?? "";
        const source = tables.some(
          (table) => "public." + table.sourceTable === relation,
        );
        const target = tables.some(
          (table) => "public." + table.targetTable === relation,
        );
        if (!source && !target) {
          throw new Error("unexpected privilege relation");
        }
        return [
          {
            select: true,
            insert: target,
            update: target,
            delete: target,
            truncate: false,
            references: false,
            trigger: false,
            maintain: false,
          },
        ];
      }
      throw new Error("unexpected query: " + query);
    },
  };
}

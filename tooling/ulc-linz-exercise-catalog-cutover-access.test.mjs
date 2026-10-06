import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcExerciseCatalogCutoverAccess,
  inspectUlcExerciseCatalogCutoverAccess,
  UlcExerciseCatalogCutoverAccessError,
} from "./ulc-linz-exercise-catalog-cutover-access.mjs";

const migrationDatabaseUrl =
  "postgresql://appbasis_ulc_linz_preview_migration:secret@ep-c3c.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";
const applicationDatabaseUrl =
  "postgresql://appbasis_ulc_linz_preview_application:secret@ep-c3c.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";
const securityLogDatabaseUrl =
  "postgresql://appbasis_ulc_linz_preview_security_log:secret@ep-c3c.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";

test("E6G-C3C ACL mutation requires explicit approval before opening PostgreSQL", async () => {
  let opened = false;
  await assert.rejects(
    applyUlcExerciseCatalogCutoverAccess(
      {
        mode: "quiesce",
        migrationDatabaseUrl,
        applicationDatabaseUrl,
        securityLogDatabaseUrl,
        apply: false,
      },
      {
        databaseFactory() {
          opened = true;
          throw new Error("must not open");
        },
      },
    ),
    (error) =>
      error instanceof UlcExerciseCatalogCutoverAccessError &&
      /explicit apply approval/.test(error.message),
  );
  assert.equal(opened, false);
});

test("E6G-C3C quiesce removes Source DML and keeps Target blocked", async () => {
  const fake = createFakeDatabase("legacy");
  const result = await applyUlcExerciseCatalogCutoverAccess(
    {
      mode: "quiesce",
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
      apply: true,
    },
    { databaseFactory: fake.databaseFactory },
  );

  assert.equal(result.mutation, "quiesce");
  assert.equal(result.applied, true);
  assert.ok(
    result.source.every(
      (entry) =>
        entry.select === true &&
        entry.insert === false &&
        entry.update === false &&
        entry.delete === false,
    ),
  );
  assert.ok(
    result.target.every(
      (entry) =>
        entry.select === false &&
        entry.insert === false &&
        entry.update === false &&
        entry.delete === false,
    ),
  );
  assert.equal(fake.closed(), true);
});

test("E6G-C3C standard grants Target DML only after Source is quiesced", async () => {
  const fake = createFakeDatabase("quiesced");
  const result = await applyUlcExerciseCatalogCutoverAccess(
    {
      mode: "standard",
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
      apply: true,
    },
    { databaseFactory: fake.databaseFactory },
  );

  assert.ok(
    result.source.every(
      (entry) =>
        entry.select === true &&
        entry.insert === false &&
        entry.update === false &&
        entry.delete === false,
    ),
  );
  assert.ok(
    result.target.every(
      (entry) =>
        entry.select === true &&
        entry.insert === true &&
        entry.update === true &&
        entry.delete === true,
    ),
  );

  const inspected = await inspectUlcExerciseCatalogCutoverAccess(
    {
      migrationDatabaseUrl,
      applicationDatabaseUrl,
      securityLogDatabaseUrl,
    },
    { databaseFactory: fake.databaseFactory },
  );
  assert.ok(inspected.target.every((entry) => entry.insert === true));
});

test("E6G-C3C refuses Target grants while Source DML is still enabled", async () => {
  const fake = createFakeDatabase("legacy");
  await assert.rejects(
    applyUlcExerciseCatalogCutoverAccess(
      {
        mode: "standard",
        migrationDatabaseUrl,
        applicationDatabaseUrl,
        securityLogDatabaseUrl,
        apply: true,
      },
      { databaseFactory: fake.databaseFactory },
    ),
    /Source DML to be quiesced first/,
  );
});

function createFakeDatabase(initialMode) {
  let mode = initialMode;
  let wasClosed = false;

  const databaseFactory = () => ({
    client: {
      async begin(callback) {
        return callback({
          async unsafe(query, parameters = []) {
            if (query.startsWith("SET TRANSACTION")) return [];
            if (query.startsWith("SELECT current_database")) {
              return [
                {
                  database_name: "appbasis_ulc_linz_preview",
                  principal_name: "appbasis_ulc_linz_preview_migration",
                },
              ];
            }
            if (query.startsWith("SELECT to_regclass")) {
              return [
                Object.fromEntries(
                  Array.from({ length: 8 }, (_, index) => [
                    "r" + String(index),
                    "public.table_" + String(index),
                  ]),
                ),
              ];
            }
            if (query.startsWith("GRANT SELECT ON TABLE") && query.includes("ulc_linz_exercise_")) {
              return [];
            }
            if (
              query.startsWith("REVOKE INSERT, UPDATE, DELETE ON TABLE") &&
              query.includes("ulc_linz_exercise_")
            ) {
              mode = "quiesced";
              return [];
            }
            if (
              query.startsWith("REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE") &&
              query.includes("appbasis_exercise_catalog_")
            ) {
              mode = "quiesced";
              return [];
            }
            if (
              query.startsWith("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE") &&
              query.includes("appbasis_exercise_catalog_")
            ) {
              mode = "standard";
              return [];
            }
            if (query.startsWith("SELECT has_table_privilege")) {
              const table = parameters[1];
              const isSource =
                typeof table === "string" &&
                table.includes("ulc_linz_exercise_");
              if (isSource) {
                return [
                  {
                    select: true,
                    insert: mode === "legacy",
                    update: mode === "legacy",
                    delete: mode === "legacy",
                  },
                ];
              }
              return [
                {
                  select: mode === "standard",
                  insert: mode === "standard",
                  update: mode === "standard",
                  delete: mode === "standard",
                },
              ];
            }
            throw new Error("Unexpected SQL: " + query);
          },
        });
      },
      async end() {
        wasClosed = true;
      },
    },
  });

  return {
    databaseFactory,
    closed: () => wasClosed,
  };
}

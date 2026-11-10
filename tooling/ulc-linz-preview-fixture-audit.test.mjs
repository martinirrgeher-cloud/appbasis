import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectUlcPreviewFixtureLabels,
  AUDIT_TABLES,
} from "./ulc-linz-preview-fixture-audit.mjs";
import { DIRECT_G04_PREVIEW } from "./ulc-linz-g04-direct-preview-preflight.mjs";

const connection = role => "postgresql://" + role + ":example@" +
  DIRECT_G04_PREVIEW.host + ":5432/" + DIRECT_G04_PREVIEW.database + "?sslmode=require";
const input = {
  migrationDatabaseUrl: connection(DIRECT_G04_PREVIEW.migrationRole),
  applicationDatabaseUrl: connection(DIRECT_G04_PREVIEW.applicationRole),
  securityLogDatabaseUrl: connection(DIRECT_G04_PREVIEW.securityRole),
};
test("rejects unverified targets before opening any database", async () => {
  let opened = false;
  await assert.rejects(inspectUlcPreviewFixtureLabels({
    ...input, applicationDatabaseUrl: input.applicationDatabaseUrl.replace(
      DIRECT_G04_PREVIEW.database, "production"),
  }, { databaseFactory: () => { opened = true; throw Error("must not open"); } }));
  assert.equal(opened, false);
});
test("counts preview labels without fetching or exposing row identities", async () => {
  const queries = [];
  let closed = false;
  const result = await inspectUlcPreviewFixtureLabels(input, {
    databaseFactory: () => ({ client: {
      async unsafe(sql, params) {
        queries.push({ sql, params });
        if (sql.includes("information_schema.columns")) return [
          { table_name: "ulc_linz_athlete", column_name: "first_name" },
          { table_name: "ulc_linz_group", column_name: "name" },
          { table_name: "ulc_linz_group", column_name: "secret_token" },
          { table_name: "unknown_table", column_name: "name" },
        ];
        return [{ candidate_count: 3 }];
      },
      async end() { closed = true; },
    } }),
  });
  assert.equal(closed, true);
  assert.equal(result.mode, "read-only");
  assert.equal(result.provenanceEstablished, false);
  assert.equal(result.cleanupPerformed, false);
  assert.equal(result.tables.length, Object.keys(AUDIT_TABLES).length);
  assert.equal(result.tables.find(x => x.table === "ulc_linz_athlete").candidateCount, 3);
  assert.equal(result.tables.find(x => x.table === "ulc_linz_group").candidateCount, 3);
  assert.equal(result.tables.filter(x => x.status === "not-inspectable").length, 2);
  assert.equal(queries.length, 3);
  assert.ok(queries.every(x => /^SELECT /.test(x.sql)));
  assert.ok(queries.every(x => !/INSERT|UPDATE|DELETE|CREATE|DROP|ALTER/i.test(x.sql)));
  assert.ok(queries.slice(1).every(x => x.params[0] === "%preview%" &&
    x.params[1] === "athlet.preview"));
  assert.ok(!JSON.stringify(result).includes("secret_token"));
});
test("closes the database after an invalid query response", async () => {
  let closed = false;
  await assert.rejects(inspectUlcPreviewFixtureLabels(input, {
    databaseFactory: () => ({ client: {
      async unsafe(sql) {
        return sql.includes("information_schema.columns")
          ? [{ table_name: "ulc_linz_group", column_name: "name" }]
          : [{ candidate_count: -1 }];
      },
      async end() { closed = true; },
    } }),
  }), /Invalid read-only/);
  assert.equal(closed, true);
});

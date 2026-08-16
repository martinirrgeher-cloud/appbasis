import assert from "node:assert/strict";
import test from "node:test";

import { verifyM3PreviewSchema } from "./verify-preview-schema.mjs";

const DATABASE_URL =
  "postgresql://runtime.user:runtime-password@ep-direct.example.neon.tech/appbasis_m3_preview?sslmode=require";

const READY_SCHEMA = Object.freeze({
  identity_user: true,
  identity_account: true,
  identity_session: true,
  identity_verification: true,
  identity_person: true,
  identity_security_state: true,
  identity_operation: true,
  permission_capability: true,
  permission_role: true,
  permission_role_capability: true,
  permission_principal: true,
  permission_principal_role: true,
  permission_principal_grant: true,
  permission_principal_revoke: true,
  permission_audit: true,
  task: true,
  permission_role_display_name: true,
  permission_role_description: true,
  permission_role_state: true,
  permission_role_kind: true,
});

function databaseFactory(rows, closeError) {
  const calls = [];
  let closed = 0;
  return {
    calls,
    get closed() {
      return closed;
    },
    createDatabase(connectionString) {
      calls.push(connectionString);
      return {
        client: {
          async unsafe(query) {
            assert.match(query, /to_regclass\('public\.appbasis_task'\)/);
            assert.match(query, /appbasis_permission_administration_audit/);
            assert.match(query, /column_name = 'kind'/);
            return rows;
          },
          async end() {
            closed += 1;
            if (closeError !== undefined) throw closeError;
          },
        },
      };
    },
  };
}

test("accepts only the complete m3-preview schema and closes the connection", async () => {
  const database = databaseFactory([{ ...READY_SCHEMA }]);

  const result = await verifyM3PreviewSchema({
    connectionString: DATABASE_URL,
    createDatabase: database.createDatabase,
  });

  assert.deepEqual(result, { status: "schema-ready", appId: "m3-preview" });
  assert.deepEqual(database.calls, [DATABASE_URL]);
  assert.equal(database.closed, 1);
});

test("fails closed and identifies missing migration-owned schema", async () => {
  const database = databaseFactory([
    {
      ...READY_SCHEMA,
      permission_audit: false,
      permission_role_kind: false,
    },
  ]);

  await assert.rejects(
    verifyM3PreviewSchema({
      connectionString: DATABASE_URL,
      createDatabase: database.createDatabase,
    }),
    /permission_audit, permission_role_kind/,
  );
  assert.equal(database.closed, 1);
});

test("rejects another database before creating a connection", async () => {
  const database = databaseFactory([{ ...READY_SCHEMA }]);

  await assert.rejects(
    verifyM3PreviewSchema({
      connectionString:
        "postgresql://runtime.user:runtime-password@ep-direct.example.neon.tech/appbasis_tasks_preview",
      createDatabase: database.createDatabase,
    }),
    /dedicated m3-preview database/,
  );
  assert.equal(database.calls.length, 0);
});

test("fails closed on invalid query results and connection close failures", async () => {
  const invalid = databaseFactory([]);
  await assert.rejects(
    verifyM3PreviewSchema({
      connectionString: DATABASE_URL,
      createDatabase: invalid.createDatabase,
    }),
    /invalid result/,
  );
  assert.equal(invalid.closed, 1);

  const closeFailure = databaseFactory(
    [{ ...READY_SCHEMA }],
    new Error("close failed"),
  );
  await assert.rejects(
    verifyM3PreviewSchema({
      connectionString: DATABASE_URL,
      createDatabase: closeFailure.createDatabase,
    }),
    /close failed/,
  );
});

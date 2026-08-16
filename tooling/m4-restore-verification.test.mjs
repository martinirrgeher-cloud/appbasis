import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectM4RestoreFingerprint,
  parseM4RestoreFingerprint,
  verifyM4RestoredDatabase,
} from "./m4-restore-verification.mjs";

const restoreConnectionString =
  "postgresql://restore-user:restore-secret@restore.example.test/appbasis_m3_preview?sslmode=require";
const fingerprintGroups = [
  "identity_users",
  "identity_accounts",
  "identity_sessions",
  "identity_verifications",
  "identity_persons",
  "identity_security_state",
  "identity_operations",
  "permission_capabilities",
  "permission_roles",
  "permission_role_capabilities",
  "permission_principals",
  "permission_principal_roles",
  "permission_principal_grants",
  "permission_principal_revokes",
  "permission_audit",
  "tasks",
];
const validFingerprint = Object.freeze(
  Object.fromEntries(
    fingerprintGroups.flatMap((group, index) => [
      [`${group}_count`, String(index + 1)],
      [`${group}_digest`, (index % 2 === 0 ? "a" : "b").repeat(32)],
    ]),
  ),
);

function makeDatabaseFactory({ row = validFingerprint, error } = {}) {
  const calls = [];
  let closed = 0;
  return {
    calls,
    get closed() {
      return closed;
    },
    createDatabase(connectionString) {
      assert.equal(connectionString, restoreConnectionString);
      return {
        client: {
          async unsafe(query) {
            calls.push(query);
            if (error) throw new Error(error);
            return [row];
          },
          async end() {
            closed += 1;
          },
        },
      };
    },
  };
}

test("captures a canonical read-only fingerprint after schema verification", async () => {
  const database = makeDatabaseFactory();
  const schemaCalls = [];
  const result = await inspectM4RestoreFingerprint({
    connectionString: restoreConnectionString,
    createDatabase: database.createDatabase,
    verifySchema: async (input) => schemaCalls.push(input),
  });

  assert.deepEqual(result, validFingerprint);
  assert.equal(schemaCalls.length, 1);
  assert.equal(schemaCalls[0].connectionString, restoreConnectionString);
  assert.equal(database.calls.length, 1);
  assert.match(database.calls[0], /^\s*SELECT\b/i);
  assert.doesNotMatch(
    database.calls[0],
    /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
  );
  for (const table of [
    'public."user"',
    "public.account",
    "public.session",
    "public.verification",
    "public.appbasis_person",
    "public.appbasis_identity_security_state",
    "public.appbasis_identity_operation",
    "public.appbasis_permission_role",
    "public.appbasis_permission_principal",
    "public.appbasis_permission_administration_audit",
    "public.appbasis_task",
  ]) {
    assert.match(database.calls[0], new RegExp(table.replaceAll(".", "\\.")));
  }
  assert.equal(database.closed, 1);
});

test("verifies the restored database against the pre-recorded fingerprint", async () => {
  const database = makeDatabaseFactory();
  await assert.doesNotReject(
    verifyM4RestoredDatabase({
      restoreConnectionString,
      expectedFingerprint: validFingerprint,
      createDatabase: database.createDatabase,
      verifySchema: async () => {},
    }),
  );
});

test("fails closed and names only mismatched fingerprint fields", async () => {
  const database = makeDatabaseFactory({
    row: { ...validFingerprint, tasks_digest: "c".repeat(32) },
  });
  await assert.rejects(
    verifyM4RestoredDatabase({
      restoreConnectionString,
      expectedFingerprint: validFingerprint,
      createDatabase: database.createDatabase,
      verifySchema: async () => {},
    }),
    /restore fingerprint mismatch: tasks_digest/,
  );
});

test("parses only the exact canonical fingerprint contract", () => {
  assert.deepEqual(
    parseM4RestoreFingerprint(JSON.stringify(validFingerprint)),
    validFingerprint,
  );
  assert.throws(
    () => parseM4RestoreFingerprint("not-json"),
    /EXPECTED_RESTORE_FINGERPRINT is invalid/,
  );
  assert.throws(
    () =>
      parseM4RestoreFingerprint(
        JSON.stringify({ ...validFingerprint, unexpected: "value" }),
      ),
    /EXPECTED_RESTORE_FINGERPRINT is invalid/,
  );
  assert.throws(
    () =>
      parseM4RestoreFingerprint(
        JSON.stringify({ ...validFingerprint, tasks_count: "01" }),
      ),
    /EXPECTED_RESTORE_FINGERPRINT is invalid/,
  );
  assert.throws(
    () =>
      parseM4RestoreFingerprint(
        JSON.stringify({ ...validFingerprint, tasks_digest: "not-a-digest" }),
      ),
    /EXPECTED_RESTORE_FINGERPRINT is invalid/,
  );
});

test("sanitizes schema and database failures", async () => {
  const sentinel = "postgresql://user:super-secret@private-provider.example/hidden";
  await assert.rejects(
    inspectM4RestoreFingerprint({
      connectionString: restoreConnectionString,
      createDatabase: makeDatabaseFactory().createDatabase,
      verifySchema: async () => {
        throw new Error(sentinel);
      },
    }),
    (error) => {
      assert.match(error.message, /database schema verification failed/);
      assert.doesNotMatch(error.message, /super-secret|private-provider/);
      return true;
    },
  );

  const database = makeDatabaseFactory({ error: sentinel });
  await assert.rejects(
    inspectM4RestoreFingerprint({
      connectionString: restoreConnectionString,
      createDatabase: database.createDatabase,
      verifySchema: async () => {},
    }),
    (error) => {
      assert.match(error.message, /database fingerprint read failed/);
      assert.doesNotMatch(error.message, /super-secret|private-provider/);
      return true;
    },
  );
  assert.equal(database.closed, 1);
});

test("rejects a database outside the concrete m3-preview restore contract", async () => {
  await assert.rejects(
    inspectM4RestoreFingerprint({
      connectionString:
        "postgresql://user:secret@restore.example.test/other_database",
      createDatabase: makeDatabaseFactory().createDatabase,
      verifySchema: async () => {},
    }),
    /must select the dedicated m3-preview database/,
  );
});

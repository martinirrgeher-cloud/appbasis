import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintUlcLinzRestoreInventory } from "./ulc-linz-m5-restore-fingerprint.mjs";

function inventory() {
  return {
    tables: ["session", "user"],
    columns: [
      { tableName: "user", columnName: "id", dataType: "text", nullable: false, defaultExpression: "" },
      { tableName: "session", columnName: "id", dataType: "text", nullable: false, defaultExpression: "" },
    ],
    constraints: [
      { tableName: "session", constraintName: "session_pkey", constraintType: "p" },
      { tableName: "user", constraintName: "user_pkey", constraintType: "p" },
    ],
    indexes: [
      { tableName: "user", indexName: "user_pkey", indexDefinition: "CREATE UNIQUE INDEX user_pkey ON public.user USING btree (id)" },
      { tableName: "session", indexName: "session_pkey", indexDefinition: "CREATE UNIQUE INDEX session_pkey ON public.session USING btree (id)" },
    ],
    rowCounts: [
      { tableName: "user", rowCount: "3" },
      { tableName: "session", rowCount: "7" },
    ],
  };
}

test("restore fingerprint is order independent and contains no row values", () => {
  const first = fingerprintUlcLinzRestoreInventory(inventory());
  const reversed = inventory();
  for (const key of ["tables", "columns", "constraints", "indexes", "rowCounts"]) reversed[key].reverse();
  const second = fingerprintUlcLinzRestoreInventory(reversed);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ["tableCount", "schemaFingerprint", "rowCountFingerprint"]);
  assert.equal(first.tableCount, 2);
  assert.match(first.schemaFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(first.rowCountFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(first).includes("3"), true);
  assert.equal(JSON.stringify(first).includes("session_pkey"), false);
});

test("restore fingerprint rejects incomplete row counts and unsafe identifiers", () => {
  const missing = inventory();
  missing.rowCounts.pop();
  assert.throws(() => fingerprintUlcLinzRestoreInventory(missing), /cover every table/);

  const unsafe = inventory();
  unsafe.tables[0] = "session;drop_table";
  assert.throws(() => fingerprintUlcLinzRestoreInventory(unsafe), /table name is invalid/);
});

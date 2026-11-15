import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  K2_ACL_FIELDS,
  K2_ACL_CONTROLS,
  evaluateK2AclParity as evaluate,
} from "./ulc-linz-k2-acl-parity.mjs";

// Aggregates from real read-only K2 Neon metadata, 2026-11-15.
// No table rows, hostnames, personal data, access keys or role passwords.
const source = () => ({
  tables_count: 62, explicit_acl_count: 62,
  application_select_count: 61, application_insert_count: 61,
  application_update_count: 60, application_delete_count: 60,
  backup_select_count: 62, rls_enabled_count: 0,
  rls_forced_count: 0, rls_policy_count: 0, sequence_count: 4,
});
const restored = () => ({
  ...source(),
  explicit_acl_count: 0, application_select_count: 0,
  application_insert_count: 0, application_update_count: 0,
  application_delete_count: 0, backup_select_count: 0,
});
const goodControls = () =>
  Object.fromEntries(K2_ACL_CONTROLS.map(key => [key, true]));
const check = (patch = {}) =>
  evaluate({ source: source(), restored: restored(), controls: {}, ...patch });

test("actual K2 source/restore observations BLOCK app restore", () => {
  const result = check();
  assert.equal(result.status, "BLOCK");
  assert.equal(result.aggregateParity, false);
  for (const field of [
    "EXPLICIT_ACL_COUNT", "APPLICATION_SELECT_COUNT",
    "APPLICATION_INSERT_COUNT", "APPLICATION_UPDATE_COUNT",
    "APPLICATION_DELETE_COUNT", "BACKUP_SELECT_COUNT",
  ]) assert.ok(result.failures.includes("MISMATCH_" + field), field);
  assert.equal(result.appRestoreReady, false);
});
test("equal table counts cannot hide missing rights", () => {
  assert.equal(source().tables_count, restored().tables_count);
  assert.ok(check().failures.includes("MISMATCH_APPLICATION_SELECT_COUNT"));
});
test("aggregate parity alone remains blocked pending per-table and runtime checks", () => {
  const result = check({ restored: source() });
  assert.equal(result.aggregateParity, true);
  assert.equal(result.status, "BLOCK");
  assert.ok(result.failures.some(failure => failure.startsWith("MISSING_")));
});
test("all independently verified controls only permit human review", () => {
  const result = check({ restored: source(), controls: goodControls() });
  assert.equal(result.status, "READY_FOR_HUMAN_REVIEW");
  assert.deepEqual(result.failures, []);
  for (const field of [
    "productionReady", "appRestoreReady", "grantAuthorized",
    "deployAuthorized", "providerWriteAuthorized",
  ]) assert.equal(result[field], false);
});
test("each independent evidence control missing, false or textual blocks", () => {
  for (const key of K2_ACL_CONTROLS) {
    for (const value of [undefined, false, "true"]) {
      const controls = goodControls();
      controls[key] = value;
      assert.equal(check({ restored: source(), controls }).status, "BLOCK", key);
    }
  }
});
test("no numeric field can drift silently", () => {
  for (const field of K2_ACL_FIELDS) {
    const baseline = source();
    if (field === "rls_forced_count") baseline.rls_enabled_count = 1;
    const changed = { ...baseline };
    changed[field] = baseline[field] === 0 ? 1 : baseline[field] - 1;
    const r = check({ source: baseline, restored: changed, controls: goodControls() });
    assert.ok(r.failures.includes("MISMATCH_" + field.toUpperCase()), field);
  }
});
test("empty and malformed catalog inputs fail closed", () => {
  for (const value of [null, [], {}, "ok", undefined, 2]) {
    assert.throws(() => check({ restored: value }));
  }
  const zero = source();
  zero.tables_count = 0;
  assert.throws(() => check({ restored: zero }), /empty table inventory|impossible/);
});
test("numeric format and impossible counts fail closed", () => {
  for (const bad of [undefined, -1, NaN, Infinity, 1.5, "62", 1000001]) {
    const changed = source();
    changed.application_select_count = bad;
    assert.throws(() => check({ source: changed }), /invalid metric/);
  }
  const tooMany = source();
  tooMany.backup_select_count = 63;
  assert.throws(() => check({ restored: tooMany }), /impossible/);
  const forcedWithoutRls = source();
  forcedWithoutRls.rls_forced_count = 1;
  assert.throws(() => check({ source: forcedWithoutRls }), /forced RLS/);
});
test("unknown controls cannot approve incomplete evidence", () => {
  const result = check({ restored: source(), controls: { approved: true } });
  assert.equal(result.status, "BLOCK");
});
test("catalog SQL is one read-only SELECT with no provider action", () => {
  const query = readFileSync(
    new URL("./ulc-linz-k2-acl-readonly.sql", import.meta.url), "utf8",
  );
  assert.match(query, /\bWITH app_tables AS/);
  assert.match(query, /\bSELECT\b/);
  assert.match(query, /\bpg_catalog\.pg_class\b/);
  assert.match(query, /\bhas_table_privilege\b/);
  assert.equal((query.match(/;\s*$/g) ?? []).length, 1);
  assert.doesNotMatch(query, /^\s*(?:GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|CALL|DO|COPY)\b/im);
  assert.doesNotMatch(query, /(?:https?:\/\/|aws s3api|wrangler deploy|psql.*-c)/);
});

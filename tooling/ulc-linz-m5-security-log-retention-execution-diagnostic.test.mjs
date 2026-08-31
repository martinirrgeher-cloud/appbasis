import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyUlcLinzM5RetentionExecutionDiagnosticFailure,
  collectUlcLinzM5RetentionExecutionDiagnostic,
} from "./ulc-linz-m5-security-log-retention-execution-diagnostic.mjs";

const CUTOFF = "2026-08-31T14:06:47.000Z";

const VALID_CLEANUP_ACCESS = Object.freeze({
  cleanup_member: true,
  login: true,
  superuser: false,
  create_db: false,
  create_role: false,
  replication: false,
  bypass_rls: false,
  cleanup_group_login: false,
  cleanup_group_superuser: false,
  cleanup_group_create_db: false,
  cleanup_group_create_role: false,
  cleanup_group_replication: false,
  cleanup_group_bypass_rls: false,
  membership_count: 1,
  cleanup_admin_option: false,
  reverse_membership_count: 0,
  cleanup_group_membership_count: 0,
  cleanup_group_operational_member_count: 1,
  cleanup_group_creator_back_reference_count: 0,
  cleanup_group_unexpected_member_count: 0,
  cleanup_execute: true,
  direct_select: false,
  direct_delete: false,
  direct_insert: false,
  direct_update: false,
  direct_truncate: false,
  direct_trigger: false,
  direct_references: false,
  retention_read: true,
  forbidden_column_select: false,
  forbidden_column_mutation: false,
  sequence_usage: false,
  sequence_select: false,
  sequence_update: false,
  protected_object_owner_count: 0,
  expected_cleanup_acl_count: 2,
  unexpected_cleanup_acl_count: 0,
});

function diagnosticClient(overrides = {}) {
  const queries = [];
  const client = function postgresJsClientShape() {};
  client.unsafe = async (query) => {
    queries.push(query);
    if (query.includes("EXPLAIN (FORMAT JSON)")) {
      if (overrides.purgePlanError) throw new Error("database secret must not leak");
      return [{ "QUERY PLAN": [] }];
    }
    if (query.includes("statement_timestamp() AS cutoff")) {
      if (overrides.clockError) throw new Error("database secret must not leak");
      return [{ cutoff: CUTOFF }];
    }
    if (query.includes("WITH protected_acl AS")) {
      return [structuredClone(overrides.access ?? VALID_CLEANUP_ACCESS)];
    }
    if (query.includes("COUNT(retained_until)")) {
      return [{ expired_rows: overrides.expiredRows ?? "0" }];
    }
    throw new Error("unexpected diagnostic query");
  };
  return { client, queries };
}

test("proves the non-mutating cleanup runner path with the callable postgres-js client shape", async () => {
  const { client, queries } = diagnosticClient();
  const result = await collectUlcLinzM5RetentionExecutionDiagnostic(client, "backup_principal");

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    classification: "read-only-cleanup-path-ok",
    purgePlanVerified: true,
    cleanupAccessVerified: true,
    cleanupResultVerificationVerified: true,
    productionMutationPerformed: false,
    productionReleaseAuthorized: false,
  });
  assert.equal(typeof client, "function");
  assert.equal(queries.length, 4);
  assert.match(queries[0], /^\s*EXPLAIN \(FORMAT JSON\)/);
  assert.match(queries[1], /statement_timestamp\(\) AS cutoff/);
  assert.match(queries[2], /WITH protected_acl AS/);
  assert.match(queries[3], /COUNT\(retained_until\)/);
  assert.doesNotMatch(queries.join("\n"), /DELETE\s+FROM/i);
  assert.doesNotMatch(queries.join("\n"), /appbasis_ulc_linz_purge_expired_security_events\(\)\s*::/i);
});

test("classifies purge-plan and cleanup-path failures without exposing raw database errors", async () => {
  const purgePlan = diagnosticClient({ purgePlanError: true });
  await assert.rejects(
    () => collectUlcLinzM5RetentionExecutionDiagnostic(purgePlan.client, "backup_principal"),
    (error) => {
      assert.equal(classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error), "purge-plan");
      assert.doesNotMatch(error.message, /secret/i);
      return true;
    },
  );

  const cleanupPath = diagnosticClient({ expiredRows: "1" });
  await assert.rejects(
    () => collectUlcLinzM5RetentionExecutionDiagnostic(cleanupPath.client, "backup_principal"),
    (error) => {
      assert.equal(classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error), "cleanup-path");
      return true;
    },
  );
});

test("emits only bounded failure phases", () => {
  assert.equal(
    classifyUlcLinzM5RetentionExecutionDiagnosticFailure(
      new Error("ULC M5-F retention execution diagnostic database clock failed."),
    ),
    "database-clock",
  );
  assert.equal(
    classifyUlcLinzM5RetentionExecutionDiagnosticFailure(new Error("postgres://user:secret@host/db")),
    "unknown",
  );
  assert.equal(classifyUlcLinzM5RetentionExecutionDiagnosticFailure(null), "unknown");
});

test("diagnostic and workflow remain read-only, sanitized and serialized with production runtime mutation", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-retention-execution-diagnostic.mjs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/m5-ulc-security-log-retention-execution-diagnostic.yml", import.meta.url), "utf8");

  assert.match(source, /productionMutationPerformed:\s*false/);
  assert.match(source, /productionReleaseAuthorized:\s*false/);
  assert.doesNotMatch(source, /DELETE\s+FROM/i);
  assert.doesNotMatch(source, /purgeExpiredUlcLinzSecurityEvents\s*\(/);
  assert.doesNotMatch(source, /console\.error\([^\n]*error\.message/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /group:\s*m6-ulc-production-runtime-config/);
  assert.match(workflow, /environment:\s*m4-dr/);
  assert.doesNotMatch(workflow, /PURGE-ULC-M5-SECURITY-LOG-RETENTION/);
});

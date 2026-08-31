import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyUlcLinzM5RetentionExecutionDiagnosticFailure,
  collectUlcLinzM5RetentionExecutionDiagnostic,
} from "./ulc-linz-m5-security-log-retention-execution-diagnostic.mjs";

const CUTOFF = "2026-08-31T14:06:47.000Z";
const PURGE_BODY = `
DECLARE
  deleted_rows bigint;
BEGIN
  DELETE FROM public.ulc_linz_security_event_log
  WHERE retained_until < statement_timestamp();
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END
`;
const PURGE_DEFINITION = `CREATE OR REPLACE FUNCTION public.appbasis_ulc_linz_purge_expired_security_events()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
${PURGE_BODY.trim()}
$function$`;

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
    if (query.includes("WITH protected_acl AS")) {
      return [structuredClone(overrides.access ?? VALID_CLEANUP_ACCESS)];
    }
    if (query.includes("FROM pg_catalog.pg_proc procedure")) {
      if (overrides.purgeContractError) throw new Error("database secret must not leak");
      if (overrides.functionMissing) return [];
      return [{
        security_definer: true,
        volatile: true,
        ordinary_function: true,
        returns_bigint: overrides.returnsBigint ?? true,
        owner_matches_table: overrides.ownerMatchesTable ?? true,
        config: overrides.config ?? ["search_path=pg_catalog"],
        body: overrides.body ?? PURGE_BODY,
        definition: overrides.definition ?? PURGE_DEFINITION,
        executable: true,
      }];
    }
    if (query.includes("statement_timestamp() AS cutoff")) {
      if (overrides.clockError) throw new Error("database secret must not leak");
      return [{ cutoff: CUTOFF }];
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
    purgeContractVerified: true,
    cleanupAccessVerified: true,
    cleanupResultVerificationReachable: true,
    residualExpiredRowsPresent: false,
    productionMutationPerformed: false,
    productionReleaseAuthorized: false,
  });
  assert.equal(typeof client, "function");
  assert.equal(queries.length, 4);
  assert.match(queries[0], /FROM pg_catalog\.pg_proc procedure/);
  assert.match(queries[0], /procedure\.prosrc AS body/);
  assert.match(queries[0], /pg_catalog\.pg_get_functiondef/);
  assert.match(queries[0], /has_function_privilege/);
  assert.match(queries[0], /procedure\.provolatile = 'v'/);
  assert.match(queries[0], /procedure\.prorettype = 'pg_catalog\.int8'::regtype/);
  assert.match(queries[0], /relation\.oid = 'public\.ulc_linz_security_event_log'::regclass/);
  assert.match(queries[1], /statement_timestamp\(\) AS cutoff/);
  assert.match(queries[2], /WITH protected_acl AS/);
  assert.match(queries[3], /COUNT\(retained_until\)/);
  assert.doesNotMatch(queries.join("\n"), /DELETE\s+FROM/i);
  assert.doesNotMatch(queries.join("\n"), /SELECT\s+public\.appbasis_ulc_linz_purge_expired_security_events\s*\(/i);
  assert.doesNotMatch(queries.join("\n"), /EXPLAIN/i);
});

test("reports residual expired rows as a successful read-only observation", async () => {
  const { client, queries } = diagnosticClient({ expiredRows: "1" });
  const result = await collectUlcLinzM5RetentionExecutionDiagnostic(client, "backup_principal");

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    classification: "read-only-cleanup-path-reachable-with-residual-rows",
    purgeContractVerified: true,
    cleanupAccessVerified: true,
    cleanupResultVerificationReachable: true,
    residualExpiredRowsPresent: true,
    productionMutationPerformed: false,
    productionReleaseAuthorized: false,
  });
  assert.equal(queries.length, 4);
  assert.match(queries[2], /WITH protected_acl AS/);
  assert.match(queries[3], /COUNT\(retained_until\)/);
});

test("classifies purge-contract and cleanup-path failures without exposing raw database errors", async () => {
  const purgeContract = diagnosticClient({ purgeContractError: true });
  await assert.rejects(
    () => collectUlcLinzM5RetentionExecutionDiagnostic(purgeContract.client, "backup_principal"),
    (error) => {
      assert.equal(classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error), "purge-contract");
      assert.doesNotMatch(error.message, /secret/i);
      return true;
    },
  );

  const missingContract = diagnosticClient({ functionMissing: true });
  await assert.rejects(
    () => collectUlcLinzM5RetentionExecutionDiagnostic(missingContract.client, "backup_principal"),
    (error) => {
      assert.equal(classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error), "purge-contract");
      return true;
    },
  );

  for (const overrides of [
    { returnsBigint: false },
    { ownerMatchesTable: false },
    { config: ["search_path=public"] },
    { body: PURGE_BODY.replace("DELETE FROM public.ulc_linz_security_event_log", "DELETE FROM public.other_table") },
    { body: PURGE_BODY.replace("retained_until < statement_timestamp()", "retained_until <= statement_timestamp()") },
    { body: PURGE_BODY.replace("retained_until < statement_timestamp();", "retained_until < statement_timestamp() OR true;") },
    { body: PURGE_BODY.replace("GET DIAGNOSTICS deleted_rows = ROW_COUNT;", "DELETE FROM public.ulc_linz_security_event_log;\n  GET DIAGNOSTICS deleted_rows = ROW_COUNT;") },
    { body: `${PURGE_BODY}\n-- retained_until < statement_timestamp()` },
  ]) {
    const driftedContract = diagnosticClient(overrides);
    await assert.rejects(
      () => collectUlcLinzM5RetentionExecutionDiagnostic(driftedContract.client, "backup_principal"),
      (error) => {
        assert.equal(classifyUlcLinzM5RetentionExecutionDiagnosticFailure(error), "purge-contract");
        return true;
      },
    );
  }

  const invalidAccess = diagnosticClient({
    access: { ...VALID_CLEANUP_ACCESS, cleanup_execute: false },
  });
  await assert.rejects(
    () => collectUlcLinzM5RetentionExecutionDiagnostic(invalidAccess.client, "backup_principal"),
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

test("diagnostic and workflow remain read-only, sanitized, bounded and production-serialized", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-retention-execution-diagnostic.mjs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/m5-ulc-security-log-retention-execution-diagnostic.yml", import.meta.url), "utf8");

  assert.match(source, /productionMutationPerformed:\s*false/);
  assert.match(source, /productionReleaseAuthorized:\s*false/);
  assert.match(source, /read-only-cleanup-path-reachable-with-residual-rows/);
  assert.match(source, /procedure\.prorettype = 'pg_catalog\.int8'::regtype/);
  assert.match(source, /owner_matches_table/);
  assert.match(source, /procedure\.prosrc AS body/);
  assert.match(source, /body !== CANONICAL_PURGE_BODY/);
  assert.doesNotMatch(source, /definition\.includes/);
  assert.doesNotMatch(source, /purgeExpiredUlcLinzSecurityEvents\s*\(/);
  assert.doesNotMatch(source, /SELECT\s+public\.appbasis_ulc_linz_purge_expired_security_events\s*\(/i);
  assert.doesNotMatch(source, /EXPLAIN/i);
  assert.doesNotMatch(source, /client\.unsafe\(\s*`[^`]*DELETE\s+FROM/is);
  assert.doesNotMatch(source, /console\.error\([^\n]*error\.message/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /group:\s*m6-ulc-production-runtime-config/);
  assert.match(workflow, /environment:\s*m4-dr/);
  assert.match(workflow, /timeout-minutes:\s*10/);
  assert.doesNotMatch(workflow, /PURGE-ULC-M5-SECURITY-LOG-RETENTION/);
});

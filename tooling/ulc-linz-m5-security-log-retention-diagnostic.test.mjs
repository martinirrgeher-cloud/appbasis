import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyUlcLinzM5RetentionDiagnosticFailure,
  collectUlcLinzM5RetentionDiagnostic,
  evaluateUlcLinzM5RetentionDiagnostic,
} from "./ulc-linz-m5-security-log-retention-diagnostic.mjs";

const VALID_ROW = Object.freeze({
  event_log_exists: true,
  event_sequence_exists: true,
  purge_function_exists: true,
  retention_column_exists: true,
  purge_security_definer: true,
  purge_search_path_pinned: true,
  protected_owner_aligned: true,
  cleanup_execute: true,
  retention_read: true,
  direct_delete: false,
  expired_rows_present: false,
  observed_at: "2026-08-30 06:40:00+00",
});

test("classifies the safe read-only baseline without production mutation", async () => {
  const queries = [];
  const client = {
    async unsafe(query) {
      queries.push(query);
      if (queries.length === 1) {
        const { expired_rows_present: _expired, ...metadata } = VALID_ROW;
        return [structuredClone(metadata)];
      }
      return [{ expired_rows_present: false, observed_at: VALID_ROW.observed_at }];
    },
  };

  const result = await collectUlcLinzM5RetentionDiagnostic(client);
  assert.equal(result.classification, "read-only-preconditions-ok");
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries.join("\n"), /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(queries.join("\n"), /appbasis_ulc_linz_purge_expired_security_events\(\)\s*::/i);
});

test("structural drift is classified before any static event-table query", async () => {
  const queries = [];
  const client = {
    async unsafe(query) {
      queries.push(query);
      return [{ ...VALID_ROW, event_log_exists: false, retention_column_exists: false }];
    },
  };

  const result = await collectUlcLinzM5RetentionDiagnostic(client);
  assert.equal(result.classification, "contract-drift");
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0], /FROM\s+public\.ulc_linz_security_event_log\b/i);
});

test("retention column type drift is rejected before the static comparison", async () => {
  const queries = [];
  const client = {
    async unsafe(query) {
      queries.push(query);
      return [{ ...VALID_ROW, retention_column_exists: false }];
    },
  };

  const result = await collectUlcLinzM5RetentionDiagnostic(client);
  assert.equal(result.classification, "contract-drift");
  assert.equal(queries.length, 1);
  assert.match(queries[0], /attribute\.atttypid\s*=\s*'pg_catalog\.timestamptz'::regtype/);
});

test("distinguishes expired rows from contract drift", () => {
  assert.equal(
    evaluateUlcLinzM5RetentionDiagnostic({ ...VALID_ROW, expired_rows_present: true }).classification,
    "expired-rows-present",
  );
  assert.equal(
    evaluateUlcLinzM5RetentionDiagnostic({ ...VALID_ROW, purge_security_definer: false }).classification,
    "contract-drift",
  );
  assert.equal(
    evaluateUlcLinzM5RetentionDiagnostic({ ...VALID_ROW, direct_delete: true }).classification,
    "contract-drift",
  );
});

test("fails closed on malformed observations", async () => {
  assert.equal(evaluateUlcLinzM5RetentionDiagnostic(null).classification, "invalid-observation");
  assert.equal(
    evaluateUlcLinzM5RetentionDiagnostic({ ...VALID_ROW, expired_rows_present: "false" }).classification,
    "invalid-observation",
  );

  await assert.rejects(
    () => collectUlcLinzM5RetentionDiagnostic({ async unsafe() { return []; } }),
    /observation is invalid/,
  );
});

test("emits only bounded sanitized failure phases", async () => {
  await assert.rejects(
    () => collectUlcLinzM5RetentionDiagnostic({ async unsafe() { throw new Error("postgres://secret"); } }),
    (error) => {
      assert.equal(error.message, "ULC M5-F retention diagnostic metadata query failed.");
      assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(error), "metadata-query");
      return true;
    },
  );

  let calls = 0;
  await assert.rejects(
    () => collectUlcLinzM5RetentionDiagnostic({
      async unsafe() {
        calls += 1;
        if (calls === 1) {
          const { expired_rows_present: _expired, ...metadata } = VALID_ROW;
          return [structuredClone(metadata)];
        }
        throw new Error("password=secret");
      },
    }),
    (error) => {
      assert.equal(error.message, "ULC M5-F retention diagnostic expired-row query failed.");
      assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(error), "expired-row-query");
      return true;
    },
  );

  assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(new Error("unexpected secret")), "unknown");
  assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(new Error("constructor")), "unknown");
  assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(new Error("toString")), "unknown");
  assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(new Error("__proto__")), "unknown");
  assert.equal(classifyUlcLinzM5RetentionDiagnosticFailure(null), "unknown");
});

test("diagnostic source remains read-only, sanitized and production-serialized", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-retention-diagnostic.mjs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/m5-ulc-security-log-retention-diagnostic.yml", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(source, /purgeExpiredUlcLinzSecurityEvents/);
  assert.match(source, /productionMutationPerformed:\s*false/);
  assert.match(source, /productionReleaseAuthorized:\s*false/);
  assert.doesNotMatch(source, /process\.stdout\.write\([^\n]*databaseUrl/);
  assert.doesNotMatch(source, /console\.error\([^\n]*error\.message/);
  assert.match(source, /metadata-query/);
  assert.match(source, /expired-row-query/);
  assert.match(workflow, /group:\s*m6-ulc-production-runtime-config/);
});

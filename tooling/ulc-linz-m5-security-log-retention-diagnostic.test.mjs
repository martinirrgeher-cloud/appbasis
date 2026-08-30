import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectUlcLinzM5RetentionDiagnostic,
  evaluateUlcLinzM5RetentionDiagnostic,
} from "./ulc-linz-m5-security-log-retention-diagnostic.mjs";

const VALID_ROW = Object.freeze({
  event_log_exists: true,
  event_sequence_exists: true,
  purge_function_exists: true,
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
      return [structuredClone(VALID_ROW)];
    },
  };

  const result = await collectUlcLinzM5RetentionDiagnostic(client);
  assert.equal(result.classification, "read-only-preconditions-ok");
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0], /\bDELETE\b/i);
  assert.doesNotMatch(queries[0], /appbasis_ulc_linz_purge_expired_security_events\(\)\s*::/i);
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

test("diagnostic source remains read-only and sanitized", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-retention-diagnostic.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(source, /purgeExpiredUlcLinzSecurityEvents/);
  assert.match(source, /productionMutationPerformed:\s*false/);
  assert.match(source, /productionReleaseAuthorized:\s*false/);
  assert.doesNotMatch(source, /process\.stdout\.write\([^\n]*databaseUrl/);
});

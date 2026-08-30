import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";

const BACKUP_USERNAME = "ulc_linz_backup_test";
const RETENTION_CUTOFF = "2026-08-30T08:00:00.000Z";
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

test("retention runner binds the canonical backup principal into its defensive ACL check", async () => {
  const calls = [];
  const client = {
    async unsafe(query, params) {
      calls.push({ query, params });
      if (query.includes("WITH protected_acl AS")) return [structuredClone(VALID_CLEANUP_ACCESS)];
      if (query.includes("COUNT(retained_until)")) return [{ expired_rows: "0" }];
      throw new Error("unexpected retention query");
    },
  };

  const result = await runUlcLinzM5SecurityLogRetention(
    client,
    async () => ({ cutoff: RETENTION_CUTOFF, deletedRows: "0" }),
    BACKUP_USERNAME,
  );

  assert.equal(result.cleanupAccessVerified, true);
  assert.deepEqual(calls[0].params, [BACKUP_USERNAME]);
  assert.match(calls[0].query, /backup_role\.rolname = \$1/);
  assert.match(calls[0].query, /acl\.grantee = backup_role\.oid[\s\S]*object_kind = 'table'[\s\S]*privilege_type = 'SELECT'/);
  assert.match(calls[0].query, /acl\.grantee = backup_role\.oid[\s\S]*object_kind = 'sequence'[\s\S]*privilege_type = 'SELECT'/);
  assert.match(calls[0].query, /\) = 21/);
});

test("production retention workflow passes the protected backup credential only to the cleanup step", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-security-log-retention.yml", import.meta.url),
    "utf8",
  );
  const cleanupStep = workflow.match(
    /- name: Run exact server-owned twelve-calendar-month cleanup[\s\S]*?- name: Record sanitized retention outcome/,
  )?.[0] ?? "";

  assert.match(cleanupStep, /ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL:\s*\$\{\{ secrets\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL \}\}/);
  assert.match(cleanupStep, /ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL:\s*\$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL \}\}/);
  assert.doesNotMatch(cleanupStep, /ULC_LINZ_PRODUCTION_DATABASE_URL:/);
  assert.doesNotMatch(cleanupStep, /ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL:/);
  assert.doesNotMatch(cleanupStep, /ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL:/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyUlcLinzM5RetentionBackupRole } from "./ulc-linz-m5-security-log-retention-backup-role-guard.mjs";
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

const VALID_BACKUP_ROLE = Object.freeze({
  login: true,
  superuser: false,
  create_db: false,
  create_role: false,
  replication: false,
  bypass_rls: false,
  membership_count: 0,
  reverse_membership_count: 0,
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

test("delete-time backup guard rejects privilege or membership elevation", async () => {
  const makeClient = (row) => ({
    async unsafe(query, params) {
      assert.match(query, /FROM pg_catalog\.pg_roles backup/);
      assert.match(query, /membership\.member = backup\.oid/);
      assert.match(query, /membership\.roleid = backup\.oid/);
      assert.deepEqual(params, [BACKUP_USERNAME]);
      return [row];
    },
  });

  assert.equal(
    await verifyUlcLinzM5RetentionBackupRole(makeClient(structuredClone(VALID_BACKUP_ROLE)), BACKUP_USERNAME),
    true,
  );

  for (const drift of [
    { superuser: true },
    { create_role: true },
    { membership_count: 1 },
    { reverse_membership_count: 1 },
  ]) {
    await assert.rejects(
      verifyUlcLinzM5RetentionBackupRole(
        makeClient({ ...structuredClone(VALID_BACKUP_ROLE), ...drift }),
        BACKUP_USERNAME,
      ),
      /not least privilege/,
    );
  }
});

test("production retention cleanup receives only sanitized backup identity", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-security-log-retention.yml", import.meta.url),
    "utf8",
  );
  const cleanupStep = workflow.match(
    /- name: Run exact server-owned twelve-calendar-month cleanup[\s\S]*?- name: Record sanitized retention outcome/,
  )?.[0] ?? "";

  assert.match(cleanupStep, /ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL:\s*\$\{\{ steps\.credentials\.outputs\.sanitized_backup_database_url \}\}/);
  assert.match(cleanupStep, /ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL:\s*\$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL \}\}/);
  assert.match(cleanupStep, /ulc-linz-m5-security-log-retention-backup-role-guard\.mjs/);
  assert.doesNotMatch(cleanupStep, /secrets\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL/);
  assert.doesNotMatch(cleanupStep, /ULC_LINZ_PRODUCTION_DATABASE_URL:/);
  assert.doesNotMatch(cleanupStep, /ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL:/);
  assert.doesNotMatch(cleanupStep, /ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL:/);

  const credentialStep = workflow.match(
    /- name: Validate and mask protected ULC security-log database credentials[\s\S]*?- name: Verify canonical protected audit access boundary before production delete/,
  )?.[0] ?? "";
  assert.match(credentialStep, /id: credentials/);
  assert.match(credentialStep, /sanitizedBackupUrl\.password = 'sanitized'/);
  assert.match(credentialStep, /sanitized_backup_database_url=/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";

const workflowUrl = new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url);
const retentionWorkflowUrl = new URL("../.github/workflows/m5-ulc-security-log-retention.yml", import.meta.url);
const backupContractUrl = new URL("../docs/ULC-LINZ-PRODUCTION-BACKUP-RESTORE.md", import.meta.url);

async function workflow() {
  return readFile(workflowUrl, "utf8");
}

async function retentionWorkflow() {
  return readFile(retentionWorkflowUrl, "utf8");
}

function validCleanupAccess(overrides = {}) {
  return {
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
    ...overrides,
  };
}

test("M5 production evidence is main-only, explicitly approved and serialized with production runtime mutation", async () => {
  const source = await workflow();
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /VERIFY-ULC-M5-PRODUCTION/);
  assert.match(source, /APPLY_RESTORE/);
  assert.match(source, /test "\$APPLY_RESTORE" = "true"/);
  assert.match(source, /group: m6-ulc-production-runtime-config/);
  assert.match(source, /environment: m4-dr/);
});

test("M5 production restore reads one authorized production snapshot, preserves ACLs and verifies reconciliation on the exact isolated restored database", async () => {
  const source = await workflow();
  assert.match(source, /APPBASIS_M4_SOURCE_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M4_RESTORE_DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL \}\}/);
  assert.match(source, /restore owner, application, ingest and read credentials must use distinct principals/);
  assert.match(source, /m4-r2-restore-target\.mjs verify-empty/);
  assert.match(source, /ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL \}\}/);
  assert.match(source, /ulc-linz-m5-exported-snapshot\.mjs/);
  assert.match(source, /DATABASE_SNAPSHOT="\$\(tr -d/);
  assert.match(source, /DATABASE_SNAPSHOT="\$DATABASE_SNAPSHOT"[\s\S]*ulc-linz-m5-restore-fingerprint\.mjs/);
  assert.match(source, /pg_dump --format=custom --no-owner --snapshot="\$DATABASE_SNAPSHOT" --dbname="\$ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL"/);
  assert.match(source, /pg_restore --single-transaction --no-owner --exit-on-error/);
  assert.doesNotMatch(source, /pg_dump[^\n]*--no-acl/);
  assert.doesNotMatch(source, /pg_restore[^\n]*--no-acl/);
  assert.match(source, /cmp -s "\$WORK\/source-fingerprint\.json" "\$WORK\/restore-fingerprint\.json"/);
  assert.match(source, /ULC_LINZ_PRODUCTION_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL \}\}/);
  assert.match(source, /DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M5_RESTORE_RECONCILIATION_EVIDENCE_PATH:/);
  const reconciliationInvocation =
    "pnpm --filter @appbasis/app-ulc-linz exec vitest run ./test/restored-production.postgres.e2e.test.ts";
  const exportInvocation =
    "pnpm --filter @appbasis/app-ulc-linz exec vitest run ./test/restored-production-export.postgres.e2e.test.ts";
  assert.ok(source.includes(reconciliationInvocation));
  assert.ok(source.includes(exportInvocation));
  assert.ok(source.indexOf(reconciliationInvocation) < source.indexOf(exportInvocation));
  assert.match(source, /restore-reconciliation\.json/);
  assert.match(source, /positiveAuthenticationVerified !== true/);
  assert.match(source, /securityAclVerified !== true/);
  assert.match(source, /restoreReconciliationVerified !== true/);
  assert.match(source, /authVerified: reconciliation\.positiveAuthenticationVerified/);
  assert.match(source, /restoreReconciliationVerified: reconciliation\.restoreReconciliationVerified/);
  assert.doesNotMatch(source, /restoreReconciliationVerified:\s*true/);
  assert.doesNotMatch(source, /@appbasis\/app-ulc-linz test:postgres/);
  assert.doesNotMatch(source, /pg_restore[^\n]*ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(source, /CREATE DATABASE/);
  assert.doesNotMatch(source, /psql[^\n]*ULC_LINZ_PRODUCTION_DATABASE_URL[^\n]*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i);
});

test("one correlated run completes G, account-bound DPA and F before canonical J requires twelve of twelve", async () => {
  const source = await workflow();
  assert.match(source, /ulc-linz-m5-backup-contract\.mjs/);
  assert.match(source, /ulc-linz-m5-production-evidence-observer\.mjs/);
  assert.match(source, /ULC_LINZ_M5_DPA_ACCOUNT_BINDING_EVIDENCE: \$\{\{ secrets\.ULC_LINZ_M5_DPA_ACCOUNT_BINDING_EVIDENCE \}\}/);
  assert.match(source, /ulc-linz-m5-production-g-evidence\.mjs "\$WORK\/m5-base-bundle\.json" > "\$WORK\/m5-g-baseline-bundle\.json"/);
  assert.match(source, /ulc-linz-m5-production-dpa-evidence\.mjs "\$WORK\/m5-g-baseline-bundle\.json" > "\$WORK\/m5-g-bundle\.json"/);
  assert.match(source, /ulc-linz-m5-production-f-evidence\.mjs "\$WORK\/m5-g-bundle\.json" > "\$WORK\/m5-bundle\.json"/);
  assert.ok(source.indexOf("ulc-linz-m5-production-g-evidence.mjs") < source.indexOf("ulc-linz-m5-production-dpa-evidence.mjs"));
  assert.ok(source.indexOf("ulc-linz-m5-production-dpa-evidence.mjs") < source.indexOf("ulc-linz-m5-production-f-evidence.mjs"));
  assert.match(source, /ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL \}\}/);
  assert.match(source, /ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL \}\}/);
  assert.match(source, /ulc-linz-m5-production-evidence-runner\.mjs "\$WORK\/m5-bundle\.json" --require-ready/);
  assert.match(source, /securityPrivacyReady !== true/);
  assert.match(source, /verifiedCount !== 12/);
  assert.match(source, /requiredCount !== 12/);
  assert.match(source, /productionReleaseAuthorized !== false/);
  assert.match(source, /Production release remains unauthorized/);
  assert.doesNotMatch(source, /ulc-linz-m5-security-log-retention-run\.mjs/);
  assert.doesNotMatch(source, /PURGE-ULC-M5-SECURITY-LOG-RETENTION/);
});

test("production evidence workflow cannot activate ingress, release production or mutate the source schema", async () => {
  const source = await workflow();
  assert.doesNotMatch(source, /wrangler\s+(?:deploy|versions deploy|versions upload|secret put)/);
  assert.doesNotMatch(source, /production-domain-activation/);
  assert.doesNotMatch(source, /workers_dev:\s*true/);
  assert.doesNotMatch(source, /preview_urls:\s*true/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("M5-F production retention is a separate main-only explicitly approved canonical protected-access delete workflow", async () => {
  const source = await retentionWorkflow();
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /PURGE-ULC-M5-SECURITY-LOG-RETENTION/);
  assert.match(source, /test "\$CONFIRMATION" = "PURGE-ULC-M5-SECURITY-LOG-RETENTION"/);
  assert.match(source, /group: m6-ulc-production-runtime-config/);
  assert.match(source, /environment: m4-dr/);
  assert.match(source, /ULC_LINZ_PRODUCTION_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL \}\}/);
  assert.match(source, /ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL \}\}/);
  assert.match(source, /ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL \}\}/);
  assert.match(source, /ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL \}\}/);
  assert.match(source, /production security-log principals must be distinct/);
  assert.match(source, /collectUlcLinzM5SecurityLogAccessEvidence/);
  assert.match(source, /ingestUsername: ingest\.user/);
  assert.match(source, /leastPrivilegeAccessVerified !== true/);
  assert.match(source, /protectedOperationalAccessVerified !== true/);
  assert.match(source, /providerMinimumRetentionVerified !== true/);
  assert.ok(source.indexOf("collectUlcLinzM5SecurityLogAccessEvidence") < source.indexOf("ulc-linz-m5-security-log-retention-run.mjs"));
  assert.match(source, /ulc-linz-m5-security-log-retention-run\.mjs/);
  assert.match(source, /cleanupAccessVerified !== true/);
  assert.match(source, /productionReleaseAuthorized !== false/);
  assert.doesNotMatch(source, /schedule:|pull_request:|push:/);
  assert.doesNotMatch(source, /wrangler\s+(?:deploy|versions deploy|versions upload|secret put)/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("M5-F retention runner verifies at the purge cutoff and emits only sanitized evidence", async () => {
  let verificationCalls = 0;
  let purgeCalls = 0;
  const cutoff = "2026-08-23T15:50:00.000Z";
  const client = {
    async unsafe(query, params) {
      if (query.includes("pg_has_role")) return [validCleanupAccess()];
      assert.match(query, /retained_until < \$1::timestamptz/);
      assert.deepEqual(params, [cutoff]);
      verificationCalls += 1;
      return [{ expired_rows: "0" }];
    },
  };
  const result = await runUlcLinzM5SecurityLogRetention(client, async (receivedClient) => {
    assert.equal(receivedClient, client);
    purgeCalls += 1;
    return { cutoff, deletedRows: 3n };
  });

  assert.equal(verificationCalls, 1);
  assert.equal(purgeCalls, 1);
  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "controlled-production-retention-run",
    observedAt: cutoff,
    cleanupAccessVerified: true,
    cleanupSucceeded: true,
    cleanupResultVerified: true,
    expiredRowsRemaining: false,
    enforcementContractDigest: result.enforcementContractDigest,
    productionReleaseAuthorized: false,
  });
  assert.match(result.enforcementContractDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result).includes("expired_rows"), false);
});

test("M5-F retention runner fails closed for every privilege-escalation class", async () => {
  const overprivileged = [
    { cleanup_member: false }, { login: false }, { superuser: true }, { create_db: true }, { create_role: true },
    { replication: true }, { bypass_rls: true }, { cleanup_group_login: true }, { cleanup_group_superuser: true },
    { cleanup_group_create_db: true }, { cleanup_group_create_role: true }, { cleanup_group_replication: true },
    { cleanup_group_bypass_rls: true }, { membership_count: 2 }, { cleanup_admin_option: true },
    { reverse_membership_count: 1 }, { cleanup_group_membership_count: 1 },
    { cleanup_group_operational_member_count: 0 }, { cleanup_group_operational_member_count: 2 },
    { cleanup_group_creator_back_reference_count: 2 }, { cleanup_group_unexpected_member_count: 1 },
    { cleanup_execute: false }, { direct_select: true }, { direct_delete: true }, { direct_insert: true },
    { direct_update: true }, { direct_truncate: true }, { direct_trigger: true }, { direct_references: true },
    { retention_read: false }, { forbidden_column_select: true }, { forbidden_column_mutation: true },
    { sequence_usage: true }, { sequence_select: true }, { sequence_update: true }, { protected_object_owner_count: 1 },
    { expected_cleanup_acl_count: 1 }, { unexpected_cleanup_acl_count: 1 },
  ];
  for (const drift of overprivileged) {
    const client = { async unsafe(query) {
      if (query.includes("pg_has_role")) return [validCleanupAccess(drift)];
      throw new Error("verification must not run after access failure");
    } };
    await assert.rejects(() => runUlcLinzM5SecurityLogRetention(client, async () => ({
      cutoff: "2026-08-23T15:50:00.000Z", deletedRows: 0n,
    })), /cleanup principal is not least privilege/);
  }
});

test("M5-F retention runner fails closed when cleanup leaves rows expired at its own cutoff", async () => {
  const cutoff = "2026-08-23T15:50:00.000Z";
  const client = { async unsafe(query, params) {
    if (query.includes("pg_has_role")) return [validCleanupAccess()];
    assert.deepEqual(params, [cutoff]);
    return [{ expired_rows: "1" }];
  } };
  await assert.rejects(() => runUlcLinzM5SecurityLogRetention(client, async () => ({ cutoff, deletedRows: 2n })), /left expired security events behind/);
});

test("M5-F retention runner rejects malformed purge evidence before verification", async () => {
  const client = { async unsafe(query) {
    if (query.includes("pg_has_role")) return [validCleanupAccess()];
    throw new Error("verification must not run for malformed purge evidence");
  } };
  for (const purgeResult of [null, {}, { cutoff: "bad", deletedRows: 0n }, { cutoff: "2026-08-23T15:50:00.000Z", deletedRows: -1n }]) {
    await assert.rejects(() => runUlcLinzM5SecurityLogRetention(client, async () => purgeResult));
  }
});

test("M5-F cleanup CLI dependencies load under the pinned Node runtime", async () => {
  const [{ createPostgresDatabase }, { purgeExpiredUlcLinzSecurityEvents }] = await Promise.all([
    import("../packages/database/src/client.ts"),
    import("../apps/ulc-linz/worker/security-events-postgres.ts"),
  ]);
  assert.equal(typeof createPostgresDatabase, "function");
  assert.equal(typeof purgeExpiredUlcLinzSecurityEvents, "function");
});

test("canonical backup contract requires provider-observed backup history and current production restore", async () => {
  const source = await readFile(backupContractUrl, "utf8");
  assert.match(source, /history_retention_seconds > 0/);
  assert.match(source, /Before every future ULC Linz production schema migration/);
  assert.match(source, /exact current ULC Linz production database/);
  assert.match(source, /restore target was empty before the write/);
  assert.match(source, /per-table row-count inventories match without exporting row values/);
  assert.match(source, /separate credentials on the exact same isolated restore database/);
  assert.match(source, /dedicated security-log ingest credential/);
  assert.match(source, /dedicated security-log read credential/);
  assert.match(source, /MUST NOT contain database URLs, credentials, cookies, authorization headers, secrets/);
});

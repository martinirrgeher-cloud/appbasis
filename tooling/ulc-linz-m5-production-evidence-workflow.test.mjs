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

test("M5 production evidence is main-only, explicitly approved and serialized with production runtime mutation", async () => {
  const source = await workflow();
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /VERIFY-ULC-M5-PRODUCTION/);
  assert.match(source, /APPLY_RESTORE/);
  assert.match(source, /test "\$APPLY_RESTORE" = "true"/);
  assert.match(source, /group: m6-ulc-production-runtime-config/);
  assert.match(source, /environment: m4-dr/);
});

test("M5 production restore reads production, preserves ACLs and verifies reconciliation on the exact isolated restored database", async () => {
  const source = await workflow();
  assert.match(source, /APPBASIS_M4_SOURCE_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M4_RESTORE_DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_DATABASE_URL \}\}/);
  assert.match(source, /m4-r2-restore-target\.mjs verify-empty/);
  assert.match(source, /pg_dump --format=custom --no-owner --dbname=/);
  assert.match(source, /pg_restore --single-transaction --no-owner --exit-on-error/);
  assert.doesNotMatch(source, /pg_dump[^\n]*--no-acl/);
  assert.doesNotMatch(source, /pg_restore[^\n]*--no-acl/);
  assert.match(source, /ulc-linz-m5-restore-fingerprint\.mjs/);
  assert.match(source, /cmp -s "\$WORK\/source-fingerprint\.json" "\$WORK\/restore-fingerprint\.json"/);
  assert.match(source, /ULC_LINZ_PRODUCTION_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M5_RESTORE_RECONCILIATION_EVIDENCE_PATH:/);
  assert.match(source, /exec vitest run \.\/test\/restored-production\.postgres\.e2e\.test\.ts/);
  assert.match(source, /restore-reconciliation\.json/);
  assert.match(source, /securityAclVerified !== true/);
  assert.match(source, /restoreReconciliationVerified !== true/);
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
  assert.ok(
    source.indexOf("ulc-linz-m5-production-g-evidence.mjs") <
      source.indexOf("ulc-linz-m5-production-dpa-evidence.mjs"),
  );
  assert.ok(
    source.indexOf("ulc-linz-m5-production-dpa-evidence.mjs") <
      source.indexOf("ulc-linz-m5-production-f-evidence.mjs"),
  );
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

test("M5-F production retention is a separate main-only explicitly approved least-privilege delete workflow", async () => {
  const source = await retentionWorkflow();
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /PURGE-ULC-M5-SECURITY-LOG-RETENTION/);
  assert.match(source, /test "\$CONFIRMATION" = "PURGE-ULC-M5-SECURITY-LOG-RETENTION"/);
  assert.match(source, /group: m6-ulc-production-runtime-config/);
  assert.match(source, /ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL \}\}/);
  assert.doesNotMatch(source, /secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.match(source, /parseUlcLinzProductionDatabaseUrl/);
  assert.match(source, /ulc-linz-m5-security-log-retention-run\.mjs/);
  assert.match(source, /cleanupAccessVerified !== true/);
  assert.match(source, /productionReleaseAuthorized !== false/);
  assert.doesNotMatch(source, /schedule:|pull_request:|push:/);
  assert.doesNotMatch(source, /wrangler\s+(?:deploy|versions deploy|versions upload|secret put)/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("M5-F retention runner verifies dedicated cleanup access and emits only sanitized evidence", async () => {
  let snapshotCalls = 0;
  let purgeCalls = 0;
  const client = {
    async unsafe(query) {
      if (query.includes("pg_has_role")) {
        return [{
          cleanup_member: true,
          cleanup_execute: true,
          direct_delete: false,
          direct_insert: false,
          retention_read: true,
          event_read: false,
        }];
      }
      assert.match(query, /ulc_linz_security_event_log/);
      assert.match(query, /retained_until < statement_timestamp\(\)/);
      snapshotCalls += 1;
      return [{
        observed_at: snapshotCalls === 1
          ? "2026-08-23T15:50:00.000Z"
          : "2026-08-23T15:50:01.000Z",
        expired_rows: snapshotCalls === 1 ? "3" : "0",
      }];
    },
  };
  const result = await runUlcLinzM5SecurityLogRetention(client, async (receivedClient) => {
    assert.equal(receivedClient, client);
    purgeCalls += 1;
  });

  assert.equal(snapshotCalls, 2);
  assert.equal(purgeCalls, 1);
  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "controlled-production-retention-run",
    observedAt: "2026-08-23T15:50:01.000Z",
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

test("M5-F retention runner fails closed for overprivileged cleanup credentials", async () => {
  const client = {
    async unsafe(query) {
      if (query.includes("pg_has_role")) {
        return [{
          cleanup_member: true,
          cleanup_execute: true,
          direct_delete: true,
          direct_insert: false,
          retention_read: true,
          event_read: false,
        }];
      }
      throw new Error("snapshot must not run after access failure");
    },
  };
  await assert.rejects(
    () => runUlcLinzM5SecurityLogRetention(client, async () => {}),
    /cleanup principal is not least privilege/,
  );
});

test("M5-F retention runner fails closed when cleanup leaves expired rows", async () => {
  let snapshotCalls = 0;
  const client = {
    async unsafe(query) {
      if (query.includes("pg_has_role")) {
        return [{
          cleanup_member: true,
          cleanup_execute: true,
          direct_delete: false,
          direct_insert: false,
          retention_read: true,
          event_read: false,
        }];
      }
      snapshotCalls += 1;
      return [{
        observed_at: "2026-08-23T15:50:00.000Z",
        expired_rows: snapshotCalls === 1 ? "2" : "1",
      }];
    },
  };
  await assert.rejects(
    () => runUlcLinzM5SecurityLogRetention(client, async () => {}),
    /left expired security events behind/,
  );
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
  assert.match(source, /MUST NOT contain database URLs, credentials, cookies, authorization headers, secrets/);
});

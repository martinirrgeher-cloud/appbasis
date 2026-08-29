import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("all production M5 ACL evidence callers bind the dedicated backup credential", async () => {
  const [collector, fEvidence, productionWorkflow, retentionWorkflow, privateSmokeWorkflow] = await Promise.all([
    source("tooling/ulc-linz-m5-security-log-access-evidence.mjs"),
    source("tooling/ulc-linz-m5-production-f-evidence.mjs"),
    source(".github/workflows/m5-ulc-production-evidence.yml"),
    source(".github/workflows/m5-ulc-security-log-retention.yml"),
    source(".github/workflows/m5-ulc-private-security-smoke.yml"),
  ]);

  assert.match(collector, /const backup = parseUlcLinzProductionDatabaseUrl\(backupDatabaseUrl\)/);
  assert.match(collector, /backup: roleName\(backup\.user\)/);
  assert.match(collector, /new Set\(Object\.values\(users\)\)\.size !== 5/);

  assert.match(fEvidence, /backupDatabaseUrl,/);
  assert.match(fEvidence, /backupDatabaseUrl: safeBackupDatabaseUrl/);
  assert.match(fEvidence, /backupDatabaseUrl: process\.env\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL/);

  for (const workflow of [productionWorkflow, retentionWorkflow, privateSmokeWorkflow]) {
    assert.match(
      workflow,
      /ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL \}\}/,
    );
  }

  assert.match(
    productionWorkflow,
    /- name: Observe exact current providers and compose one correlated owner bundle[\s\S]*ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL \}\}/,
  );
  assert.match(
    retentionWorkflow,
    /backupDatabaseUrl: process\.env\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL/,
  );
  assert.match(
    privateSmokeWorkflow,
    /backupDatabaseUrl: process\.env\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL/,
  );
});

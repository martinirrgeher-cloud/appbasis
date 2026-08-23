import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url);
const backupContractUrl = new URL("../docs/ULC-LINZ-PRODUCTION-BACKUP-RESTORE.md", import.meta.url);

async function workflow() {
  return readFile(workflowUrl, "utf8");
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

test("M5 production restore reads production and writes only the isolated restore target", async () => {
  const source = await workflow();
  assert.match(source, /APPBASIS_M4_SOURCE_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL \}\}/);
  assert.match(source, /APPBASIS_M4_RESTORE_DATABASE_URL: \$\{\{ secrets\.APPBASIS_M4_RESTORE_DATABASE_URL \}\}/);
  assert.match(source, /m4-r2-restore-target\.mjs verify-empty/);
  assert.match(source, /pg_dump --format=custom --no-owner --no-acl/);
  assert.match(source, /pg_restore --single-transaction --no-owner --no-acl --exit-on-error/);
  assert.match(source, /ulc-linz-m5-restore-fingerprint\.mjs/);
  assert.match(source, /cmp -s "\$WORK\/source-fingerprint\.json" "\$WORK\/restore-fingerprint\.json"/);
  assert.match(source, /@appbasis\/app-ulc-linz test:postgres/);
  assert.doesNotMatch(source, /pg_restore[^\n]*ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(source, /psql[^\n]*ULC_LINZ_PRODUCTION_DATABASE_URL[^\n]*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i);
});

test("one correlated run feeds canonical F G H I J owners and requires twelve of twelve", async () => {
  const source = await workflow();
  assert.match(source, /ulc-linz-m5-backup-contract\.mjs/);
  assert.match(source, /ulc-linz-m5-production-evidence-observer\.mjs/);
  assert.match(source, /ulc-linz-m5-production-evidence-runner\.mjs "\$WORK\/m5-bundle\.json" --require-ready/);
  assert.match(source, /securityPrivacyReady !== true/);
  assert.match(source, /verifiedCount !== 12/);
  assert.match(source, /requiredCount !== 12/);
  assert.match(source, /productionReleaseAuthorized !== false/);
  assert.match(source, /Production release remains unauthorized/);
});

test("production evidence workflow cannot activate ingress, release production or mutate the source schema", async () => {
  const source = await workflow();
  assert.doesNotMatch(source, /wrangler\s+(?:deploy|versions deploy|versions upload|secret put)/);
  assert.doesNotMatch(source, /production-domain-activation/);
  assert.doesNotMatch(source, /workers_dev:\s*true/);
  assert.doesNotMatch(source, /preview_urls:\s*true/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
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

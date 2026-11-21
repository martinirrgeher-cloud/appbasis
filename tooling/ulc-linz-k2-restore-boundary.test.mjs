import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertIsolatedUlcRestoreTarget,
  assertUlcBackupSourceDatabase,
  assertUlcBackupKey,
} from "./ulc-linz-k2-backup-plan.mjs";

const workflow = readFileSync(
  new URL("../.github/workflows/ulc-linz-k2-isolated-restore.yml", import.meta.url),
  "utf8",
);
const source = "postgresql://source:fake@ep-source.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview?sslmode=require";
const quarantine = "postgresql://restore:fake@ep-quarantine.eu-central-1.aws.neon.tech/ulc_linz_k2_restore_quarantine?sslmode=require";
const key = "appbasis/ulc-linz/pilot/db/appbasis_ulc_linz_preview/daily/2026-11-14.tar.aesgcm";

test("K2 restore remains manual, main-only, single-flight, and read-only by default", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:schedule|push|pull_request):/m);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: ulc-linz-k2-restore/);
});

test("K2 restore refuses the same endpoint, even when database or credentials differ", () => {
  assert.equal(assertUlcBackupSourceDatabase(source, "appbasis_ulc_linz_preview"), true);
  assert.equal(assertIsolatedUlcRestoreTarget(source, quarantine), true);
  for (const bad of [
    source,
    source.replace("appbasis_ulc_linz_preview", "different_database"),
    source.replace("source:fake", "other:password"),
    source.replace("sslmode=require", "sslmode=verify-full"),
  ]) assert.throws(() => assertIsolatedUlcRestoreTarget(source, bad), /separate Neon branch endpoint/);
});

test("K2 restore rejects keys outside the approved app, database and daily date scope", () => {
  assert.equal(assertUlcBackupKey(key, "appbasis_ulc_linz_preview"), key);
  for (const bad of [
    key.replace("ulc-linz", "other-app"),
    key.replace("appbasis_ulc_linz_preview", "appbasis_ulc_linz_production"),
    key.replace("/daily/", "/monthly/"),
    key.replace("2026-11-14", "2026-02-30"),
    key + "/../other",
  ]) assert.throws(() => assertUlcBackupKey(bad, "appbasis_ulc_linz_preview"));
});

test("K2 restore requires an empty destination and verifies the correct source before any writes", () => {
  assert.match(workflow, /ulc-linz-k2-backup-plan\.mjs targets/);
  assert.match(workflow, /node \.\/tooling\/ulc-linz-k2-backup-plan\.mjs bucket/);
  assert.match(workflow, /SELECT count\(\*\) FROM pg_class/);
  assert.match(workflow, /test "\$EMPTY" = "0"/);
  assert.match(workflow, /head-bucket/);
  assert.match(workflow, /head-object/);
  assert.match(workflow, /get-object/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /\.Metadata\.sha256==\$sha/);
  assert.match(workflow, /\.ContentLength\|tostring\)==\$size/);
});

test("K2 archive is authenticated, path-whitelisted and PostgreSQL-readable", () => {
  assert.match(workflow, /decryptM4BackupFile/);
  assert.match(workflow, /printf 'database\.pgdump\\nmanifest\.json\\n'/);
  assert.match(workflow, /cmp -s "\$WORK\/expected-entries\.txt" "\$WORK\/actual-entries\.txt"/);
  assert.match(workflow, /--no-same-owner --no-same-permissions/);
  assert.match(workflow, /\.appId=="ulc-linz"/);
  assert.match(workflow, /\.backupKind=="daily"/);
  assert.match(workflow, /\.objectKey==\$key/);
  assert.match(workflow, /pg_restore --list/);
});

test("K2 actual writes and verification stay explicitly apply-gated", () => {
  const restore = workflow.match(/- name: Restore only into the verified empty quarantine database\n([\s\S]*?)(?=\n\s+- name:|$)/)?.[1];
  const verify = workflow.match(/- name: Check restored ULC application tables\n([\s\S]*?)(?=\n\s+- name:|$)/)?.[1];
  assert.ok(restore);
  assert.ok(verify);
  assert.match(restore, /if: inputs\.apply == true/);
  assert.match(verify, /if: inputs\.apply == true/);
  assert.match(restore, /pg_restore --single-transaction --no-owner --no-acl --exit-on-error/);
  assert.match(verify, /ULC_REQUIRED_SCHEMA_SQL/);
  assert.match(verify, /test "\$STATUS" = "t"/);
  assert.doesNotMatch(workflow, /(?:wrangler deploy|vercel deploy|neon branches promote|aws s3api delete-object)/);
});

test("K2 restored production structural integrity is checked only after a successful quarantined restore", () => {
  const schema = workflow.indexOf("      - name: Check restored ULC application tables");
  const integrity = workflow.indexOf("      - name: Attest full 69-table production restore and five write fences (metadata only)");
  const cleanup = workflow.indexOf("      - name: Delete confidential restore working files");
  assert.ok(schema > 0 && integrity > schema && cleanup > integrity);
  const part = workflow.slice(integrity, cleanup);
  assert.match(part, /if: inputs\.apply == true/);
  assert.match(part, /restore-integrity-sql/);
  assert.match(part, /ULC_RESTORE_INTEGRITY_SQL/);
  assert.match(part, /--tuples-only --no-align/);
  assert.match(part, /test "\$STATUS" = "t"/);
  assert.match(part, /not a personal-data fingerprint, media or privacy acceptance/);
  assert.doesNotMatch(part, /(?:(?:INSERT|UPDATE|DELETE|GRANT|TRUNCATE)\s+(?:INTO\s+)?(?:public\.)?(?:appbasis_|ulc_linz_)|aws s3api delete-object)/);
  const preflight = workflow.slice(0,workflow.indexOf("      - name: Check quarantine is empty"));
  assert.doesNotMatch(preflight, /restore-integrity-sql/);
});

test("K2 restore wipes temporary confidential files on both success and failure", () => {
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /mkdir -m 700 "\$WORK"/);
  assert.match(workflow, /if: always\(\) && steps\.download\.outputs\.workspace != ''/);
  assert.match(workflow, /if \[\[ "\$WORK" == "\$RUNNER_TEMP"\/ulc-k2-restore-\* \]\]/);
  assert.match(workflow, /rm -rf -- "\$WORK"/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-free-external-backup.yml",
  import.meta.url,
);
const consistentBackupUrl = new URL("./m4-consistent-backup.mjs", import.meta.url);

async function workflowSource() {
  return readFile(workflowUrl, "utf8");
}

async function consistentBackupSource() {
  return readFile(consistentBackupUrl, "utf8");
}

test("M4 free backup is main-only, protected, opt-in and least privilege", async () => {
  const source = await workflowSource();

  assert.match(source, /schedule:\s*\n\s*- cron: "17 2 \* \* \*"/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /permissions:\s*\n\s*contents: read/);
  assert.match(source, /environment: m4-dr/);
  assert.match(source, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /APPBASIS_M4_FREE_BACKUP_ENABLED/);
  assert.match(source, /test "\$MANUAL_APPLY" = "1"/);
  assert.match(source, /external backup write was not explicitly confirmed/i);

  const gate = source.indexOf("Gate scheduled activation and manual writes before secrets");
  const firstSecret = source.indexOf("secrets.");
  assert.ok(gate >= 0 && firstSecret > gate, "write gate must precede every secret reference");
});

test("M4 free backup uses a pre-created R2 bucket and never provisions storage", async () => {
  const source = await workflowSource();

  assert.match(source, /aws s3api head-bucket/);
  assert.match(source, /aws s3api put-object/);
  assert.match(source, /--if-none-match '\*'/);
  assert.match(source, /aws s3api head-object/);
  assert.match(source, /aws s3api get-object/);
  assert.match(source, /aws s3api delete-object/);
  assert.doesNotMatch(source, /aws s3 mb/);
  assert.doesNotMatch(source, /create-bucket/);
  assert.doesNotMatch(source, /wrangler r2 bucket create/);
  assert.doesNotMatch(source, /cf-create-bucket-if-missing/i);
});

test("M4 free backup captures fingerprint and dump from one exported snapshot", async () => {
  const workflow = await workflowSource();
  const capture = await consistentBackupSource();

  assert.match(workflow, /m4-consistent-backup\.mjs capture/);
  assert.doesNotMatch(workflow, /m4-restore-verification\.mjs fingerprint/);
  assert.doesNotMatch(workflow, /pg_dump --format=custom/);

  assert.match(capture, /isolation level repeatable read read only/);
  assert.match(capture, /pg_export_snapshot\(\)/);
  assert.match(capture, /readM4RestoreFingerprintFromClient\(transaction\)/);
  assert.match(capture, /--snapshot=\"\$APPBASIS_M4_EXPORTED_SNAPSHOT\"/);
  assert.match(capture, /postgres:18-alpine/);
});

test("M4 free backup encrypts locally before any object upload", async () => {
  const source = await workflowSource();

  const capture = source.indexOf("m4-consistent-backup.mjs capture");
  const encrypt = source.indexOf("m4-backup-crypto.mjs encrypt");
  const removeRaw = source.indexOf('rm -f "$WORK/backup.tar"');
  const upload = source.indexOf("aws s3api put-object");

  assert.ok(capture >= 0);
  assert.ok(encrypt > capture);
  assert.ok(removeRaw > encrypt && removeRaw < upload);
  assert.match(source, /umask 077/);
  assert.match(source, /backup\.tar\.aesgcm/);
  assert.doesNotMatch(source, /--body "\$WORK\/database\.pgdump"/);
});

test("M4 immutable writes reconcile an existing object instead of retrying PUT", async () => {
  const source = await workflowSource();
  const putMatches = [...source.matchAll(/aws s3api put-object/g)];
  const getObject = source.indexOf("aws s3api get-object");
  const getEndpoint = source.indexOf('--endpoint-url "$ENDPOINT"', getObject);
  const getOutfile = source.indexOf('"$reconcile_file" >/dev/null', getEndpoint);

  assert.equal(putMatches.length, 1, "workflow must contain only one provider PUT site");
  assert.match(source, /if aws s3api put-object[\s\S]*?--if-none-match '\*'[\s\S]*?; then/);
  assert.match(source, /write was not confirmed; reconciling existing object read-only/i);
  assert.match(source, /verify_backup_object "\$key" "\$object_kind" "\$key_sha" 0/);
  assert.match(source, /aws s3api head-object/);
  assert.ok(getObject >= 0 && getEndpoint > getObject && getOutfile > getEndpoint,
    "AWS get-object outfile must remain the final positional argument");
  assert.match(source, /objectkeysha256=\$key_sha/);
  assert.match(source, /downloaded_sha=.*sha256sum/);
  assert.match(source, /test "\$downloaded_sha" = "\$remote_sha"/);
});

test("M4 retention inventories every managed page and prunes all expired actual keys", async () => {
  const source = await workflowSource();
  const primaryUpload = source.indexOf('put_backup "$PRIMARY_KEY"');
  const prune = source.indexOf("Prune all expired managed retention objects");

  assert.ok(primaryUpload >= 0);
  assert.ok(prune > primaryUpload, "retention pruning must happen only after verified uploads");
  assert.match(source, /list-objects-v2/);
  assert.match(source, /--prefix "\$prefix"/);
  assert.match(source, /--max-keys 1000/);
  assert.match(source, /--no-paginate/);
  assert.match(source, /\.IsTruncated \| type == "boolean"/);
  assert.match(source, /NextContinuationToken/);
  assert.match(source, /pagination did not advance/);
  assert.match(source, /seen_tokens\["\$next_token"\]/);
  assert.match(source, /appbasis\/m3-preview\/m4\/daily\//);
  assert.match(source, /appbasis\/m3-preview\/m4\/weekly\//);
  assert.match(source, /m4-free-backup-plan\.mjs prune "\$CREATED_AT"/);
  assert.match(source, /jq -r '\.\[\]' <<<"\$EXPIRED_KEYS"/);
  assert.doesNotMatch(source, /steps\.plan\.outputs\.expired_keys/);
});

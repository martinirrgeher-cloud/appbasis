import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-r2-restore-rehearsal.yml",
  import.meta.url,
);

async function workflowSource() {
  return readFile(workflowUrl, "utf8");
}

test("M4 R2 restore rehearsal is manual, protected and never creates provider resources", async () => {
  const source = await workflowSource();

  assert.match(source, /^\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(source, /^\s*(?:schedule|push):/m);
  assert.match(source, /backup_key:/);
  assert.match(source, /apply:/);
  assert.match(source, /type: boolean/);
  assert.match(source, /^permissions:\n\s+contents: read$/m);
  assert.match(source, /^\s+environment: m4-dr$/m);
  assert.match(source, /APPBASIS_M4_R2_RESTORE_ACCESS_KEY_ID/);
  assert.match(source, /APPBASIS_M4_R2_RESTORE_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(source, /APPBASIS_M4_R2_ACCESS_KEY_ID/);
  assert.doesNotMatch(source, /APPBASIS_M4_R2_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(source, /create-bucket|wrangler|NEON_API_KEY|snapshots\/.*restore/i);
});

test("M4 R2 restore binds and verifies the exact immutable ciphertext before decryption", async () => {
  const source = await workflowSource();

  assert.match(source, /m4-r2-restore-plan\.mjs key/);
  assert.match(source, /aws s3api head-object/);
  assert.match(source, /m4-r2-restore-plan\.mjs head/);
  assert.match(source, /aws s3api get-object/);
  assert.match(source, /LOCAL_SIZE/);
  assert.match(source, /LOCAL_SHA256/);
  assert.match(source, /ciphertextSha256/);
  assert.match(source, /m4-backup-crypto\.mjs decrypt/);
  assert.doesNotMatch(source, /s3api put-object|s3api delete-object/);
});

test("M4 R2 restore accepts only the exact three regular archive payload files", async () => {
  const source = await workflowSource();

  assert.match(
    source,
    /printf 'database\.pgdump\\nfingerprint\.json\\nmanifest\.json\\n'/,
  );
  assert.match(source, /tar --list --file/);
  assert.match(source, /cmp -s/);
  assert.match(source, /tar --list --verbose --file/);
  assert.match(source, /substr\(\$1, 1, 1\) != "-"/);
  assert.match(source, /count != 3/);
  assert.match(source, /--no-same-owner/);
  assert.match(source, /--no-same-permissions/);
  assert.match(source, /m4-r2-restore-plan\.mjs manifest/);
  assert.match(source, /m4-r2-restore-plan\.mjs fingerprint/);
});

test("M4 R2 restore verifies a distinct empty target before any pg_restore write", async () => {
  const source = await workflowSource();
  const targetCheck = source.indexOf("m4-r2-restore-target.mjs verify-empty");
  const restore = source.indexOf("pg_restore");

  assert.ok(targetCheck >= 0 && restore > targetCheck);
  assert.match(source, /secrets\.APPBASIS_M4_SOURCE_DATABASE_URL/);
  assert.match(source, /secrets\.APPBASIS_M4_RESTORE_DATABASE_URL/);
  assert.match(source, /if: inputs\.apply != true/);
  assert.match(source, /no database write was requested/);
  assert.match(source, /if: inputs\.apply == true/);
  assert.match(source, /--single-transaction/);
  assert.match(source, /--no-owner/);
  assert.match(source, /--no-acl/);
  assert.match(source, /--exit-on-error/);
});

test("M4 R2 restore reuses canonical post-restore fingerprint verification", async () => {
  const source = await workflowSource();

  assert.match(source, /APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT/);
  assert.match(source, /m4-restore-verification\.mjs verify/);
  assert.match(source, /restore-fingerprint-match/);
  assert.match(source, /do not retry against this target unless the empty-target preflight passes again/);
});

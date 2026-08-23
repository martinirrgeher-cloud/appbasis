import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import "./ulc-linz-m6-private-production-deploy-workflow.test.mjs";

const workflowUrl = new URL(
  "../.github/workflows/m6-ulc-production-runtime-config.yml",
  import.meta.url,
);

async function source() {
  return readFile(workflowUrl, "utf8");
}

test("runtime configuration requires exact main-only operator approval", async () => {
  const workflow = await source();
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /CONFIGURE-ULC-PRODUCTION-RUNTIME/);
  assert.match(workflow, /TARGET_WORKER: appbasis-ulc-linz-production/);
  assert.match(workflow, /TARGET_BASE_URL: https:\/\/app\.ulc-linz\.at/);
  assert.match(workflow, /TARGET_VERSION_TAG: ulc-linz-production-runtime-v1/);
  assert.match(workflow, /group: m6-ulc-production-runtime-config/);
});

test("runtime configuration consumes only dedicated production inputs", async () => {
  const workflow = await source();
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /value\.length < 32/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve/);
  assert.doesNotMatch(workflow, /APPBASIS_BETTER_AUTH_SECRET/);
});

test("runtime configuration derives a non-secret HMAC fingerprint for auth-secret provenance", async () => {
  const workflow = await source();
  assert.match(workflow, /createHmac\("sha256", secret\)/);
  assert.match(workflow, /appbasis:ulc-linz:production:better-auth-secret:v1/);
  assert.match(workflow, /AUTH_SECRET_FINGERPRINT/);
  assert.match(workflow, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /auth-hmac:\$\{AUTH_SECRET_FINGERPRINT\}/);
  assert.match(workflow, /auth-hmac:\$\{process\.env\.AUTH_SECRET_FINGERPRINT\}/);
  assert.match(workflow, /echo "::add-mask::\$ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET"/);
  assert.doesNotMatch(workflow, /printf .*ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /process\.stdout\.write\([^\n]*ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
});

test("runtime configuration uploads bindings and secret atomically as one undeployed version", async () => {
  const workflow = await source();
  assert.match(workflow, /writeGeneratedProductionWranglerConfig/);
  assert.match(workflow, /appId: "ulc-linz"/);
  assert.match(workflow, /baseURL: "https:\/\/app\.ulc-linz\.at"/);
  assert.match(workflow, /entrypoint: "\.\/worker\/index\.ts"/);
  assert.match(workflow, /wrangler versions upload/);
  assert.match(workflow, /--secrets-file "\$secrets_file"/);
  assert.match(workflow, /--dry-run/);
  assert.match(workflow, /--tag "\$TARGET_VERSION_TAG"/);
  assert.match(workflow, /BETTER_AUTH_SECRET: process\.env\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /workers\/scripts\/\$TARGET_WORKER\/versions\/\$VERSION_ID/);
  assert.match(workflow, /bindings\.length !== 3/);
  assert.match(workflow, /base\?\.type !== "plain_text"/);
  assert.match(workflow, /hyperdrive\?\.type !== "hyperdrive"/);
  assert.match(workflow, /secret\?\.type !== "secret_text"/);
  assert.doesNotMatch(workflow, /workers\/scripts\/\$TARGET_WORKER\/settings/);
  assert.doesNotMatch(workflow, /workers\/scripts\/\$TARGET_WORKER\/secrets/);
  assert.doesNotMatch(workflow, /--request PATCH/);
  assert.doesNotMatch(workflow, /--request PUT/);
});

test("runtime configuration accepts only recognized undeployed history and one current version", async () => {
  const workflow = await source();
  assert.match(workflow, /historicalMessagePattern/);
  assert.match(workflow, /AppBasis ulc-linz production runtime \[0-9a-f\]\{40\} auth-hmac:\[0-9a-f\]\{64\}/);
  assert.match(workflow, /version history contains an unrecognized version/);
  assert.match(workflow, /const currentVersions = versions\.filter/);
  assert.match(workflow, /currentVersions\.length > 1/);
  assert.match(workflow, /duplicate current versions/);
  assert.match(workflow, /printf 'existing_id=%s\\n' "\$EXISTING_VERSION_ID"/);
  assert.match(workflow, /if: steps\.preflight\.outputs\.existing_id == ''/);
  assert.match(workflow, /VERSION_ID="\$\{EXISTING_VERSION_ID:-\$UPLOADED_VERSION_ID\}"/);
  assert.match(workflow, /current auth-secret HMAC found; this run will reconcile it read-only instead of uploading again/);
  assert.match(workflow, /currentVersions\.length !== 1 \|\| currentVersions\[0\]\?\.id !== process\.env\.VERSION_ID/);
});

test("runtime configuration preserves closed zero-deployment worker and fails closed on drift", async () => {
  const workflow = await source();
  assert.match(workflow, /requires zero existing deployments/);
  assert.match(workflow, /deploymentsResponse\.result\.deployments\.length !== 0/);
  assert.match(workflow, /subdomain\?\.enabled !== false/);
  assert.match(workflow, /subdomain\?\.previews_enabled !== false/);
  assert.match(workflow, /worker\?\.deployed_on !== null/);
  assert.match(workflow, /worker\.references\.domains\.length !== 0/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
  assert.doesNotMatch(workflow, /versions deploy/);
  assert.doesNotMatch(workflow, /production-domain-activation/);
  assert.doesNotMatch(workflow, /database-migration-executor/);
  assert.doesNotMatch(workflow, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

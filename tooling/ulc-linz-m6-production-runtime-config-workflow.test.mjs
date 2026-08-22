import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("runtime configuration requires pristine state and preserves closed zero-deployment worker", async () => {
  const workflow = await source();
  assert.match(workflow, /requires a Worker with no existing versions/);
  assert.match(workflow, /requires zero existing deployments/);
  assert.match(workflow, /versionsResponse\.result\.length !== 1/);
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

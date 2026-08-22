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
});

test("runtime configuration consumes only the dedicated production inputs", async () => {
  const workflow = await source();
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /value\.length < 32/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve/);
  assert.doesNotMatch(workflow, /APPBASIS_BETTER_AUTH_SECRET/);
});

test("runtime configuration writes only the approved bindings and secret", async () => {
  const workflow = await source();
  assert.match(workflow, /workers\/scripts\/\$TARGET_WORKER\/settings/);
  assert.match(workflow, /--request PATCH/);
  assert.match(workflow, /APPBASIS_BASE_URL/);
  assert.match(workflow, /https:\/\/app\.ulc-linz\.at/);
  assert.match(workflow, /name:\"HYPERDRIVE\",type:\"hyperdrive\"/);
  assert.match(workflow, /workers\/scripts\/\$TARGET_WORKER\/secrets/);
  assert.match(workflow, /--request PUT/);
  assert.match(workflow, /name:\"BETTER_AUTH_SECRET\"/);
  assert.match(workflow, /type:\"secret_text\"/);
});

test("runtime configuration fails closed on drift and preserves private undeployed state", async () => {
  const workflow = await source();
  assert.match(workflow, /Unexpected or drifting binding exists/);
  assert.match(workflow, /bindings\.length !== 3/);
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

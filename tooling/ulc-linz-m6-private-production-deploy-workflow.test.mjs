import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m6-ulc-private-production-deploy.yml",
  import.meta.url,
);

async function source() {
  return readFile(workflowUrl, "utf8");
}

test("private production deploy requires exact main-only approval", async () => {
  const workflow = await source();
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /DEPLOY-ULC-PRIVATE-PRODUCTION/);
  assert.match(workflow, /TARGET_WORKER: appbasis-ulc-linz-production/);
  assert.match(workflow, /TARGET_BASE_URL: https:\/\/app\.ulc-linz\.at/);
  assert.match(workflow, /TARGET_VERSION_TAG: ulc-linz-production-runtime-v1/);
});

test("private production deploy binds to current auth secret, database binding and recognized version history", async () => {
  const workflow = await source();
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /createHmac\("sha256", secret\)/);
  assert.match(workflow, /appbasis:ulc-linz:production:better-auth-secret:v1/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve/);
  assert.match(workflow, /historicalMessagePattern/);
  assert.match(workflow, /encountered an unrecognized version in history/);
  assert.match(workflow, /currentVersions\.length !== 1/);
  assert.match(workflow, /workers\/scripts\/\$TARGET_WORKER\/versions\/\$VERSION_ID/);
  assert.match(workflow, /bindings\.length !== 3/);
  assert.match(workflow, /base\?\.type !== "plain_text"/);
  assert.match(workflow, /hyperdrive\?\.type !== "hyperdrive"/);
  assert.match(workflow, /secret\?\.type !== "secret_text"/);
});

test("private production deploy consumes only the already configured exact version", async () => {
  const workflow = await source();
  assert.match(workflow, /wrangler versions deploy "\$VERSION_ID@100%"/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
  assert.match(workflow, /-y/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
  assert.doesNotMatch(workflow, /wrangler versions upload/);
  assert.doesNotMatch(workflow, /secret put/);
  assert.doesNotMatch(workflow, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("private production deploy remains fail closed before and after deployment", async () => {
  const workflow = await source();
  assert.match(workflow, /requires zero existing deployments/);
  assert.match(workflow, /subdomain\?\.enabled !== false/);
  assert.match(workflow, /subdomain\?\.previews_enabled !== false/);
  assert.match(workflow, /worker\.references\.domains\.length !== 0/);
  assert.match(workflow, /deployments\.length !== 1/);
  assert.match(workflow, /versions\.length !== 1/);
  assert.match(workflow, /versions\[0\]\?\.version_id !== process\.env\.VERSION_ID/);
  assert.match(workflow, /versions\[0\]\?\.percentage !== 100/);
  assert.doesNotMatch(workflow, /production-domain-activation/);
  assert.doesNotMatch(workflow, /workers_dev: true/);
  assert.doesNotMatch(workflow, /preview_urls: true/);
});

test("private production deploy never prints protected provider or runtime credentials", async () => {
  const workflow = await source();
  assert.match(workflow, /echo "::add-mask::\$CLOUDFLARE_ACCOUNT_ID"/);
  assert.match(workflow, /echo "::add-mask::\$CLOUDFLARE_API_TOKEN"/);
  assert.match(workflow, /echo "::add-mask::\$ULC_LINZ_PRODUCTION_DATABASE_URL"/);
  assert.match(workflow, /echo "::add-mask::\$ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET"/);
  assert.match(workflow, /echo "::add-mask::\$AUTH_SECRET_FINGERPRINT"/);
  assert.doesNotMatch(workflow, /printf .*CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /printf .*CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(workflow, /printf .*ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow, /printf .*ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
});

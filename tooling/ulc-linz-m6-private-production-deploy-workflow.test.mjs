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
  assert.match(workflow, /group: m6-ulc-production-runtime-config/);
});

test("private production deploy binds to current auth secret and both database bindings", async () => {
  const workflow = await source();
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.match(workflow, /secrets\.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /parseUlcLinzSecurityLogIngestDatabaseUrl/);
  assert.match(workflow, /app\.user === security\.user/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve-security-log/);
  assert.match(workflow, /bindings\.length !== 4/);
  assert.match(workflow, /entry\?\.name === "SECURITY_LOG_HYPERDRIVE"/);
  assert.match(workflow, /securityHyperdrive\?\.id !== process\.env\.SECURITY_LOG_HYPERDRIVE_ID/);
  assert.match(workflow, /securityHyperdrive\.id === hyperdrive\.id/);
  assert.match(workflow, /secret\?\.type !== "secret_text"/);
});

test("private production deploy proves routes are absent before and after deployment", async () => {
  const workflow = await source();
  assert.ok((workflow.match(/workers\/scripts"/g) ?? []).length >= 2);
  assert.match(workflow, /ROUTES_PATH=.*routes-before\.json/);
  assert.match(workflow, /ROUTES_PATH=.*routes-after\.json/);
  assert.match(workflow, /matchingScripts\.length !== 1/);
  assert.ok((workflow.match(/Array\.isArray\(routes\) && routes\.length !== 0/g) ?? []).length >= 2);
});

test("private production deploy consumes only the already configured exact version", async () => {
  const workflow = await source();
  assert.match(workflow, /wrangler versions deploy "\$VERSION_ID@100%"/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
  assert.match(workflow, /-y/);
  assert.doesNotMatch(workflow, /wrangler deploy|wrangler versions upload|secret put/);
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
  assert.doesNotMatch(workflow, /production-domain-activation|workers_dev: true|preview_urls: true/);
});

test("private production deploy never prints protected provider or runtime credentials", async () => {
  const workflow = await source();
  for (const name of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "ULC_LINZ_PRODUCTION_DATABASE_URL",
    "ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL",
    "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET",
  ]) {
    assert.match(workflow, new RegExp(`echo "::add-mask::\\$${name}"`));
    assert.doesNotMatch(workflow, new RegExp(`printf .*${name}`));
  }
  assert.match(workflow, /echo "::add-mask::\$AUTH_SECRET_FINGERPRINT"/);
});

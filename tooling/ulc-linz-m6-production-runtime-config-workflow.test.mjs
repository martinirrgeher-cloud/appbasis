import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import "./ulc-linz-m6-private-production-deploy-workflow.test.mjs";
import "./ulc-linz-m6-private-runtime-refresh.test.mjs";

const workflowUrl = new URL(
  "../.github/workflows/m6-ulc-production-runtime-config.yml",
  import.meta.url,
);
const refreshConfigWorkflowUrl = new URL(
  "../.github/workflows/m6-ulc-production-runtime-refresh-config.yml",
  import.meta.url,
);
const refreshDeployWorkflowUrl = new URL(
  "../.github/workflows/m6-ulc-private-production-refresh-deploy.yml",
  import.meta.url,
);
const securitySmokeWorkflowUrl = new URL(
  "../.github/workflows/m5-ulc-private-security-smoke.yml",
  import.meta.url,
);

async function source() {
  return readFile(workflowUrl, "utf8");
}

test("runtime refresh workflows remain bound to the protected environment", async () => {
  const [refreshConfigWorkflow, refreshDeployWorkflow] = await Promise.all([
    readFile(refreshConfigWorkflowUrl, "utf8"),
    readFile(refreshDeployWorkflowUrl, "utf8"),
  ]);
  assert.match(
    refreshConfigWorkflow,
    /refresh-runtime-config:[\s\S]*?environment: m4-dr[\s\S]*?steps:/,
  );
  assert.match(
    refreshDeployWorkflow,
    /refresh-private-deploy:[\s\S]*?environment: m4-dr[\s\S]*?steps:/,
  );
});

test("runtime refresh mutations use the dedicated Cloudflare write token while provider reads retain the read token", async () => {
  const [refreshConfigWorkflow, refreshDeployWorkflow] = await Promise.all([
    readFile(refreshConfigWorkflowUrl, "utf8"),
    readFile(refreshDeployWorkflowUrl, "utf8"),
  ]);
  assert.match(
    refreshConfigWorkflow,
    /Upload exact current runtime as an undeployed version[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_WRITE_TOKEN \}\}/,
  );
  assert.match(
    refreshDeployWorkflow,
    /Deploy exact current version privately[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_WRITE_TOKEN \}\}/,
  );
  assert.match(
    refreshConfigWorkflow,
    /Read and validate current closed private runtime state[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.match(
    refreshDeployWorkflow,
    /Require exact closed runtime and exact current configured version[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
});

test("M5 remote security smoke uses the dedicated write token only for the remote preview session", async () => {
  const workflow = await readFile(securitySmokeWorkflowUrl, "utf8");
  assert.match(
    workflow,
    /Exercise application database and emit one denied security event[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_WRITE_TOKEN \}\}[\s\S]*?wrangler dev --remote/,
  );
  assert.match(
    workflow,
    /Resolve exact active private production version[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.match(
    workflow,
    /Verify workers\.dev account subdomain remained unchanged[\s\S]*?CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
});

test("runtime refresh configuration reuses the trusted deployed version bindings without Hyperdrive inventory permission", async () => {
  const workflow = await readFile(refreshConfigWorkflowUrl, "utf8");
  assert.match(workflow, /DEPLOYED_VERSION_ID: \$\{\{ steps\.state\.outputs\.deployed_id \}\}/);
  assert.match(workflow, /workers\/scripts\/\$TARGET_WORKER\/versions\/\$DEPLOYED_VERSION_ID/);
  assert.match(workflow, /ulc-linz-m6-private-runtime-refresh\.mjs binding-ids/);
  assert.match(workflow, /applicationHyperdriveId/);
  assert.match(workflow, /securityLogHyperdriveId/);
  assert.doesNotMatch(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve(?:\s|$)/m);
  assert.doesNotMatch(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve-security-log/);
  assert.doesNotMatch(workflow, /\/hyperdrive\/configs/);
});

test("runtime refresh deploy reuses the exact configured version bindings without Hyperdrive inventory permission", async () => {
  const workflow = await readFile(refreshDeployWorkflowUrl, "utf8");
  assert.match(workflow, /VERSION_ID: \$\{\{ steps\.state\.outputs\.current_id \}\}/);
  assert.match(workflow, /workers\/scripts\/\$TARGET_WORKER\/versions\/\$VERSION_ID/);
  assert.match(workflow, /ulc-linz-m6-private-runtime-refresh\.mjs binding-ids/);
  assert.match(workflow, /ulc-linz-m6-private-runtime-refresh\.mjs bindings/);
  assert.doesNotMatch(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve(?:\s|$)/m);
  assert.doesNotMatch(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve-security-log/);
  assert.doesNotMatch(workflow, /\/hyperdrive\/configs/);
});

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
  assert.match(workflow, /secrets\.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL/);
  assert.match(workflow, /secrets\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /value\.length < 32/);
  assert.match(workflow, /parseUlcLinzSecurityLogIngestDatabaseUrl/);
  assert.match(workflow, /app\.user === security\.user/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve/);
  assert.match(workflow, /ulc-linz-m6-production-hyperdrive\.mjs resolve-security-log/);
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
});

test("runtime configuration uploads both database bindings and secret atomically as one undeployed version", async () => {
  const workflow = await source();
  assert.match(workflow, /writeGeneratedProductionWranglerConfig/);
  assert.match(workflow, /hyperdriveId: process\.env\.HYPERDRIVE_ID/);
  assert.match(workflow, /securityLogHyperdriveId: process\.env\.SECURITY_LOG_HYPERDRIVE_ID/);
  assert.match(workflow, /wrangler versions upload/);
  assert.match(workflow, /--secrets-file "\$secrets_file"/);
  assert.match(workflow, /--dry-run/);
  assert.match(workflow, /BETTER_AUTH_SECRET: process\.env\.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET/);
  assert.match(workflow, /bindings\.length !== 4/);
  assert.match(workflow, /entry\?\.name === "SECURITY_LOG_HYPERDRIVE"/);
  assert.match(workflow, /securityHyperdrive\?\.id !== process\.env\.SECURITY_LOG_HYPERDRIVE_ID/);
  assert.match(workflow, /securityHyperdrive\.id === hyperdrive\.id/);
  assert.doesNotMatch(workflow, /workers\/scripts\/\$TARGET_WORKER\/settings/);
  assert.doesNotMatch(workflow, /--request PATCH|--request PUT/);
});

test("runtime configuration accepts only recognized undeployed history and one current version", async () => {
  const workflow = await source();
  assert.match(workflow, /historicalMessagePattern/);
  assert.match(workflow, /version history contains an unrecognized version/);
  assert.match(workflow, /currentVersions\.length > 1/);
  assert.match(workflow, /if: steps\.preflight\.outputs\.existing_id == ''/);
  assert.match(workflow, /currentVersions\.length !== 1 \|\| currentVersions\[0\]\?\.id !== process\.env\.VERSION_ID/);
});

test("runtime configuration preserves closed zero-deployment worker and fails closed on drift", async () => {
  const workflow = await source();
  assert.match(workflow, /requires zero existing deployments/);
  assert.match(workflow, /subdomain\?\.enabled !== false/);
  assert.match(workflow, /subdomain\?\.previews_enabled !== false/);
  assert.match(workflow, /worker\?\.deployed_on !== null/);
  assert.match(workflow, /worker\.references\.domains\.length !== 0/);
  assert.doesNotMatch(workflow, /wrangler deploy|versions deploy|production-domain-activation/);
  assert.doesNotMatch(workflow, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

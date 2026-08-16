import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m3-preview-execution-readiness.yml",
  import.meta.url,
);
const runnerUrl = new URL("./m3-preview-execution-readiness.mjs", import.meta.url);

const requiredSecrets = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "APPBASIS_DATABASE_URL",
  "APPBASIS_BETTER_AUTH_SECRET",
  "APPBASIS_ROOT_ADMIN_PASSWORD",
  "APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD",
  "APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD",
  "APPBASIS_SMOKE_ALLOWED_PASSWORD",
  "APPBASIS_SMOKE_DENIED_PASSWORD",
];

test("pins M3 execution readiness as a read-only preflight before provider writes", async () => {
  const [workflow, runner] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(runnerUrl, "utf8"),
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+apply:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /environment: m3-preview/);

  for (const secret of requiredSecrets) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }

  const protectedInputs = workflow.indexOf(
    "Validate and mask every protected M3 execution input",
  );
  const cloudflareRead = workflow.indexOf(
    "Verify Cloudflare Workers account access read-only",
  );
  const downstreamContracts = workflow.indexOf(
    "Validate downstream M3 contracts without writes",
  );
  const schemaRead = workflow.indexOf(
    "Verify M3 preview database connection and schema read-only",
  );
  assert.ok(protectedInputs >= 0);
  assert.ok(cloudflareRead > protectedInputs);
  assert.ok(downstreamContracts > cloudflareRead);
  assert.ok(schemaRead > downstreamContracts);

  assert.match(workflow, /\/workers\/subdomain/);
  assert.match(
    workflow,
    /node \.\/apps\/m3-preview\/tooling\/verify-preview-schema\.mjs/,
  );
  assert.doesNotMatch(workflow, /--request\s+(POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(workflow, /wrangler\s+(deploy|versions|hyperdrive)/);
  assert.doesNotMatch(workflow, /apply-preview-migrations/);
  assert.doesNotMatch(workflow, /bootstrap-root-admin\.mjs/);
  assert.doesNotMatch(workflow, /bootstrap-smoke-principals\.mjs/);

  assert.match(runner, /readM3PreviewRootAdminEnvironment/);
  assert.match(runner, /readM3PreviewSmokeBootstrapEnvironment/);
  assert.match(runner, /readM3PreviewAcceptanceEnvironment/);
  assert.doesNotMatch(runner, /fetch\(|createInitialTechnicalAdmin\(|provision/);
});

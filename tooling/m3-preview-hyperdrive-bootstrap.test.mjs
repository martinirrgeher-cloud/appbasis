import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m3-preview-hyperdrive-bootstrap.yml",
  import.meta.url,
);

test("pins the guarded m3-preview Hyperdrive bootstrap boundary", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /name: M3 Preview Hyperdrive Bootstrap/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /apply:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /environment: m3-preview/);
  assert.match(workflow, /pnpm run verify:repo/);

  assert.match(
    workflow,
    /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/,
  );
  assert.match(
    workflow,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.match(
    workflow,
    /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
  );
  assert.match(workflow, /APPBASIS_APPLY_HYPERDRIVE/);
  assert.match(workflow, /m3-preview-hyperdrive\.mjs ensure/);

  const schemaVerification = workflow.indexOf(
    "Verify migrated m3-preview database before provider mutation",
  );
  const ensureTarget = workflow.indexOf(
    "Ensure dedicated m3-preview Hyperdrive",
  );
  assert.ok(schemaVerification >= 0);
  assert.ok(ensureTarget > schemaVerification);
  assert.match(
    workflow,
    /node \.\/apps\/m3-preview\/tooling\/verify-preview-schema\.mjs/,
  );

  assert.doesNotMatch(workflow, /generated-tasks-preview/);
  assert.doesNotMatch(workflow, /wrangler/);
  assert.doesNotMatch(workflow, /BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /secret put|workers\/scripts\/.*\/secrets/i);
  assert.doesNotMatch(workflow, /migrate:preview|apply-preview-migrations/);
  assert.doesNotMatch(workflow, /worker.*deploy|versions deploy/i);
});

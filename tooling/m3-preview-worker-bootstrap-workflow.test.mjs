import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m3-preview-worker-bootstrap.yml",
  import.meta.url,
);
const bootstrapUrl = new URL(
  "./m3-preview-worker-bootstrap.mjs",
  import.meta.url,
);

test("pins the guarded m3-preview Worker bootstrap boundary", async () => {
  const [workflow, bootstrap] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(bootstrapUrl, "utf8"),
  ]);

  assert.match(workflow, /name: M3 Preview Worker Bootstrap/);
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
  assert.match(workflow, /APPBASIS_APPLY_WORKER/);
  assert.match(workflow, /m3-preview-worker-bootstrap\.mjs ensure/);

  const schemaGate = workflow.indexOf(
    "Verify migrated m3-preview database before Worker creation",
  );
  const hyperdriveGate = workflow.indexOf(
    "Require exact m3-preview Hyperdrive before Worker creation",
  );
  const workerCreate = workflow.indexOf(
    "Ensure empty dedicated m3-preview Worker",
  );
  assert.ok(schemaGate >= 0);
  assert.ok(hyperdriveGate > schemaGate);
  assert.ok(workerCreate > hyperdriveGate);
  assert.match(
    workflow,
    /node \.\/apps\/m3-preview\/tooling\/verify-preview-schema\.mjs/,
  );
  assert.match(workflow, /m3-preview-hyperdrive\.mjs resolve/);

  assert.doesNotMatch(workflow, /BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /secret put|workers\/scripts\/.*\/secrets/i);
  assert.doesNotMatch(workflow, /migrate:preview|apply-preview-migrations/);
  assert.doesNotMatch(workflow, /wrangler/);
  assert.doesNotMatch(workflow, /versions upload|versions deploy/i);
  assert.doesNotMatch(workflow, /m3-preview-hyperdrive\.mjs ensure/);

  assert.match(bootstrap, /name: "appbasis-m3-preview"/);
  assert.match(bootstrap, /workers\/workers/);
  assert.match(bootstrap, /method: "POST"/);
  assert.match(bootstrap, /APPBASIS_APPLY_WORKER === "1"/);
  assert.match(bootstrap, /previews_enabled/);
  assert.doesNotMatch(bootstrap, /wrangler/);
  assert.doesNotMatch(bootstrap, /BETTER_AUTH_SECRET/);
  assert.doesNotMatch(bootstrap, /versions\/|deployments/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m5-reference-control-plane-evidence.yml",
  import.meta.url,
);

test("M5 Reference control-plane evidence workflow is manual, protected and read-only", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /^\s+environment: reference-preview$/m);
  assert.match(
    workflow,
    /wrangler deployments list --name appbasis-reference-role-admin --json/,
  );
  assert.match(
    workflow,
    /run: node \.\/tooling\/reference-role-admin-ingress\.mjs/,
  );
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);

  assert.doesNotMatch(workflow, /APPBASIS_ROLE_ADMIN_SECRET_BOOTSTRAP_APPLY/);
  assert.doesNotMatch(workflow, /APPBASIS_BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(
    workflow,
    /wrangler\s+(?:deploy|delete|secret|versions deploy|rollback)/i,
  );
  assert.doesNotMatch(workflow, /\bcurl\b/i);
});

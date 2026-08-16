import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-pre-migration-snapshot.yml",
  import.meta.url,
);

test("M4 pre-migration snapshot workflow is manual, protected and apply-gated", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /^\s+environment: m4-dr$/m);
  assert.match(workflow, /migration_id:/);
  assert.match(workflow, /expires_at:/);
  assert.match(workflow, /apply:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(workflow, /secrets\.NEON_API_KEY/);
  assert.match(workflow, /vars\.NEON_PROJECT_ID/);
  assert.match(workflow, /vars\.NEON_BRANCH_ID/);
  assert.match(
    workflow,
    /APPBASIS_APPLY_PRE_MIGRATION_SNAPSHOT: \$\{\{ inputs\.apply && '1' \|\| '0' \}\}/,
  );
  assert.match(
    workflow,
    /run: node \.\/tooling\/m4-pre-migration-snapshot\.mjs ensure/,
  );

  assert.doesNotMatch(workflow, /\bneonctl\b/i);
  assert.doesNotMatch(workflow, /\/restore\b/i);
  assert.doesNotMatch(workflow, /\b(?:DELETE|PATCH|PUT)\b/);
});

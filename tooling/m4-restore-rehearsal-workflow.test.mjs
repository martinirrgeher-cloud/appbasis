import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-restore-rehearsal.yml",
  import.meta.url,
);

test("M4 restore rehearsal workflow is manual, protected and apply-gated", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /^\s+environment: m4-dr$/m);
  assert.match(workflow, /apply:[\s\S]*?default: false[\s\S]*?type: boolean/);
  assert.match(workflow, /secrets\.NEON_API_KEY/);
  assert.match(workflow, /vars\.NEON_PROJECT_ID/);
  assert.match(workflow, /vars\.NEON_BRANCH_ID/);
  assert.match(workflow, /vars\.APPBASIS_M4_RESTORE_SNAPSHOT_ID/);
  assert.match(workflow, /vars\.APPBASIS_M4_RESTORE_BRANCH_NAME/);
  assert.match(
    workflow,
    /APPBASIS_APPLY_RESTORE_REHEARSAL: \$\{\{ inputs\.apply && '1' \|\| '0' \}\}/,
  );
  assert.match(
    workflow,
    /run: node \.\/tooling\/m4-restore-rehearsal\.mjs ensure/,
  );

  assert.doesNotMatch(workflow, /\bneonctl\b/i);
  assert.doesNotMatch(workflow, /\/finalize_restore\b/i);
  assert.doesNotMatch(workflow, /\b(?:PATCH|PUT|DELETE)\b/);
});

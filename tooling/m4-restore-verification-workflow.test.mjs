import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-restore-verification.yml",
  import.meta.url,
);

test("M4 restore verification workflow is manual, protected and read-only", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /^\s+environment: m4-dr$/m);
  assert.match(workflow, /secrets\.APPBASIS_M4_RESTORE_DATABASE_URL/);
  assert.match(workflow, /secrets\.APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT/);
  assert.match(
    workflow,
    /run: node \.\/tooling\/m4-restore-verification\.mjs verify/,
  );

  assert.doesNotMatch(workflow, /m4-restore-verification\.mjs fingerprint/);
  assert.doesNotMatch(workflow, /\bapply\b/i);
  assert.doesNotMatch(workflow, /neonctl/i);
  assert.doesNotMatch(workflow, /\bcurl\b/i);
  assert.doesNotMatch(workflow, /\bpsql\b/i);
  assert.doesNotMatch(workflow, /\b(?:POST|PUT|PATCH|DELETE)\b/);
});

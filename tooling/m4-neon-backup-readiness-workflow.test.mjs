import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-backup-readiness.yml",
  import.meta.url,
);

test("M4 backup readiness workflow is manual, protected and read-only", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /^\s+environment: m4-dr$/m);
  assert.match(
    workflow,
    /run: node \.\/tooling\/m4-neon-backup-readiness\.mjs check/,
  );
  assert.match(workflow, /secrets\.NEON_API_KEY/);
  assert.match(workflow, /vars\.NEON_PROJECT_ID/);
  assert.match(workflow, /vars\.NEON_BRANCH_ID/);
  assert.match(workflow, /vars\.APPBASIS_MIN_RESTORE_WINDOW_SECONDS/);
  assert.match(workflow, /vars\.APPBASIS_REQUIRED_BACKUP_FREQUENCY/);
  assert.match(workflow, /vars\.APPBASIS_MIN_SNAPSHOT_RETENTION_SECONDS/);

  assert.doesNotMatch(workflow, /\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(workflow, /neonctl\s+(?:create|delete|set|update|restore)/i);
});

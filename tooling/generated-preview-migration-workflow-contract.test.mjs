import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-tasks-preview-migrate.yml",
);

const forbiddenInputs = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "APPBASIS_HYPERDRIVE_ID",
  "BETTER_AUTH_SECRET",
  "APPBASIS_ROOT_ADMIN_PASSWORD",
  "APPBASIS_DEMO_USER_TEMPORARY_PASSWORD",
];

test("generated preview migration workflow uses an isolated explicit database target", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /environment: generated-tasks-preview/);
  assert.doesNotMatch(workflow, /environment: reference-preview/);
  assert.match(workflow, /APPBASIS_GENERATED_APP_ID: tasks-minimal/);
  assert.match(workflow, /APPBASIS_MIGRATION_TARGET: generated-tasks-preview/);
  assert.match(
    workflow,
    /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
  );
  assert.match(workflow, /APPBASIS_APPLY_MIGRATIONS/);
  assert.match(workflow, /pnpm run verify:repo/);
  assert.match(
    workflow,
    /pnpm --filter @appbasis\/app-tasks-minimal migrate:preview/,
  );
  assert.doesNotMatch(workflow, /migrate:reference|reference-preview-migrate/);
  assert.doesNotMatch(workflow, /appbasis\.app\.json/);
  assert.doesNotMatch(workflow, /permission.*provision|root.*admin|demo.*user/i);

  for (const forbidden of forbiddenInputs) {
    assert.equal(workflow.includes(forbidden), false);
  }
});

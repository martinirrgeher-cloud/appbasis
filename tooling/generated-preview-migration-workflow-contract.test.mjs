import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedTasksWorkflowPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-tasks-preview-migrate.yml",
);
const m3PreviewWorkflowPath = resolve(
  repositoryRoot,
  ".github/workflows/m3-preview-migrate.yml",
);

const forbiddenInputs = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "APPBASIS_HYPERDRIVE_ID",
  "BETTER_AUTH_SECRET",
  "APPBASIS_ROOT_ADMIN_PASSWORD",
  "APPBASIS_DEMO_USER_TEMPORARY_PASSWORD",
];

function assertCommonMigrationBoundary(workflow) {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /type: boolean/);
  assert.match(
    workflow,
    /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
  );
  assert.match(workflow, /APPBASIS_APPLY_MIGRATIONS/);
  assert.match(workflow, /pnpm run verify:repo/);
  assert.doesNotMatch(workflow, /environment: reference-preview/);
  assert.doesNotMatch(workflow, /migrate:reference|reference-preview-migrate/);
  assert.doesNotMatch(workflow, /appbasis\.app\.json/);
  assert.doesNotMatch(workflow, /permission.*provision|root.*admin|demo.*user/i);

  for (const forbidden of forbiddenInputs) {
    assert.equal(workflow.includes(forbidden), false);
  }
}

test("generated tasks preview migration workflow uses an isolated explicit database target", async () => {
  const workflow = await readFile(generatedTasksWorkflowPath, "utf8");

  assertCommonMigrationBoundary(workflow);
  assert.match(workflow, /environment: generated-tasks-preview/);
  assert.match(workflow, /APPBASIS_GENERATED_APP_ID: tasks-minimal/);
  assert.match(workflow, /APPBASIS_MIGRATION_TARGET: generated-tasks-preview/);
  assert.match(
    workflow,
    /pnpm --filter @appbasis\/app-tasks-minimal migrate:preview/,
  );
});

test("m3-preview migration workflow uses its own explicit database target", async () => {
  const workflow = await readFile(m3PreviewWorkflowPath, "utf8");

  assertCommonMigrationBoundary(workflow);
  assert.match(workflow, /environment: m3-preview/);
  assert.match(workflow, /APPBASIS_GENERATED_APP_ID: m3-preview/);
  assert.match(workflow, /APPBASIS_MIGRATION_TARGET: m3-preview/);
  assert.match(workflow, /migration was not explicitly confirmed/);
  assert.match(
    workflow,
    /pnpm --filter @appbasis\/app-m3-preview migrate:preview/,
  );
  assert.doesNotMatch(workflow, /generated-tasks-preview/);
});

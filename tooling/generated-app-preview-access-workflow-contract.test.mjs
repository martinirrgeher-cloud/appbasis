import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-app-preview-access-bootstrap.yml",
);

test("generated preview access bootstrap is a separate explicit preview mutation", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /app_id:/);
  assert.match(workflow, /apply:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /generated-app-preview-\$\{\{ inputs\.app_id \}\}/);
  assert.match(workflow, /format\('generated-preview-\{0\}', inputs\.app_id\)/);
  assert.match(workflow, /Generated preview access bootstrap was not explicitly authorized/);
  assert.match(workflow, /Generated preview access bootstrap is main-only/);
  assert.match(workflow, /github\.ref/);
  assert.match(workflow, /generated-app-preview-smoke\.mjs/);
  assert.match(workflow, /generated-preview-database-smoke\.mjs/);
  assert.match(workflow, /generated-app-preview-access-bootstrap\.mjs/);
});

test("generated preview access bootstrap keeps credentials protected and production untouched", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  for (const secret of [
    "APPBASIS_DATABASE_URL",
    "APPBASIS_BETTER_AUTH_SECRET",
    "APPBASIS_ROOT_ADMIN_PASSWORD",
    "APPBASIS_PREVIEW_USER_TEMPORARY_PASSWORD",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.match(workflow, /::add-mask::/);
  assert.doesNotMatch(workflow, /ULC_LINZ_PRODUCTION/);
  assert.doesNotMatch(workflow, /m4-dr/);
  assert.doesNotMatch(workflow, /app\.ulc-linz\.at/);
});

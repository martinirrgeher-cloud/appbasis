import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-app-preview-lifecycle.yml",
);

test("generic generated preview lifecycle selects one app and one explicit mutating operation", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /app_id:/);
  assert.match(workflow, /operation:/);
  assert.match(workflow, /type: choice/);
  for (const operation of ["hyperdrive", "migrate", "bootstrap", "deploy"]) {
    assert.match(workflow, new RegExp("- " + operation));
  }
  assert.match(workflow, /apply:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /Generated app preview operation was not explicitly authorized/);
  assert.match(workflow, /format\('generated-preview-\{0\}', inputs\.app_id\)/);
  assert.match(workflow, /generated-app-preview-plan\.mjs/);
  assert.match(workflow, /generated-app-preview-hyperdrive\.mjs ensure/);
  assert.match(workflow, /generated-app-preview-hyperdrive\.mjs resolve/);
  assert.match(workflow, /generated-app-preview-migrate\.mjs/);
  assert.match(workflow, /entrypoint: "\.\/worker\/preview\.ts"/);
  assert.match(workflow, /generated-app-preview-smoke\.mjs/);
  assert.match(workflow, /generated-preview-database-smoke\.mjs/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
});

test("generic generated preview lifecycle does not reuse specialized or production targets", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /generated-tasks-preview/);
  assert.doesNotMatch(workflow, /reference-preview/);
  assert.doesNotMatch(workflow, /tasks-minimal/);
  assert.doesNotMatch(workflow, /production/i);
  assert.doesNotMatch(workflow, /APPBASIS_ROOT_ADMIN_PASSWORD/);
  assert.doesNotMatch(workflow, /APPBASIS_DEMO_USER_TEMPORARY_PASSWORD/);
});

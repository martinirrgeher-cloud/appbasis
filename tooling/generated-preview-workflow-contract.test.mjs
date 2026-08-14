import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-tasks-preview-bootstrap.yml",
);
const deployPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-tasks-preview-deploy.yml",
);

const forbiddenOperationalInputs = [
  "APPBASIS_DATABASE_URL",
  "APPBASIS_ROOT_ADMIN_PASSWORD",
  "APPBASIS_DEMO_USER_TEMPORARY_PASSWORD",
];

test("generated preview workflows keep deployment inputs outside the app manifest", async () => {
  const [bootstrap, deploy] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(deployPath, "utf8"),
  ]);

  for (const workflow of [bootstrap, deploy]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /environment: reference-preview/);
    assert.match(workflow, /APPBASIS_GENERATED_APP_ID: tasks-minimal/);
    assert.match(workflow, /APPBASIS_HYPERDRIVE_ID: \$\{\{ secrets\.APPBASIS_HYPERDRIVE_ID \}\}/);
    assert.match(workflow, /--experimental-provision=false/);
    assert.match(workflow, /--experimental-auto-create=false/);
    assert.doesNotMatch(workflow, /appbasis\.app\.json/);
    for (const forbidden of forbiddenOperationalInputs) {
      assert.equal(workflow.includes(forbidden), false);
    }
  }
});

test("bootstrap is limited to first Worker creation and secret installation", async () => {
  const bootstrap = await readFile(bootstrapPath, "utf8");

  assert.match(bootstrap, /writeGeneratedPreviewBootstrapWranglerConfig/);
  assert.match(bootstrap, /deployments list --name/);
  assert.match(bootstrap, /wrangler secret put BETTER_AUTH_SECRET/);
  assert.match(bootstrap, /wrangler secret list/);
  assert.doesNotMatch(bootstrap, /reference-preview-migrate|migrate:reference|permission.*provision/i);
});

test("normal deploy requires bootstrap, validates the bundle and runs only health smoke", async () => {
  const deploy = await readFile(deployPath, "utf8");

  assert.match(deploy, /writeGeneratedPreviewWranglerConfig/);
  assert.match(deploy, /Generated preview Worker is not bootstrapped/);
  assert.match(deploy, /Generated preview Worker is missing BETTER_AUTH_SECRET/);
  assert.match(deploy, /--dry-run/);
  assert.match(deploy, /node \.\/tooling\/generated-preview-smoke\.mjs/);
  assert.doesNotMatch(deploy, /reference-preview-smoke|APPBASIS_SMOKE_|migrate:reference|permission.*provision/i);
});

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
const sharedWorkerConcurrencyGroup =
  "group: generated-tasks-preview-worker-appbasis-tasks-minimal";

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
    assert.match(workflow, new RegExp(sharedWorkerConcurrencyGroup));
    assert.doesNotMatch(workflow, /appbasis\.app\.json/);
    for (const forbidden of forbiddenOperationalInputs) {
      assert.equal(workflow.includes(forbidden), false);
    }
  }
});

test("bootstrap is limited to confirmed first Worker creation and valid secret installation", async () => {
  const bootstrap = await readFile(bootstrapPath, "utf8");

  assert.match(bootstrap, /writeGeneratedPreviewBootstrapWranglerConfig/);
  assert.match(
    bootstrap,
    /workers\/scripts\/\$\{APPBASIS_GENERATED_WORKER_NAME\}/,
  );
  assert.match(bootstrap, /--write-out '%\{http_code\}'/);
  assert.match(bootstrap, /case "\$HTTP_STATUS" in/);
  assert.match(bootstrap, /200\)/);
  assert.match(bootstrap, /404\)/);
  assert.match(
    bootstrap,
    /Unable to determine whether the generated preview Worker exists/,
  );
  assert.doesNotMatch(
    bootstrap,
    /if pnpm exec wrangler deployments list[\s\S]*bootstrap deploy skipped/,
  );
  assert.match(
    bootstrap,
    /secret\.trim\(\) !== secret[\s\S]*secret\.length < 32/,
  );
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

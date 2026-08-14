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
const hyperdriveBootstrapPath = resolve(
  repositoryRoot,
  ".github/workflows/generated-tasks-preview-hyperdrive-bootstrap.yml",
);

const forbiddenProvisioningInputs = [
  "APPBASIS_ROOT_ADMIN_PASSWORD",
  "APPBASIS_DEMO_USER_TEMPORARY_PASSWORD",
];
const sharedWorkerConcurrencyGroup =
  "group: generated-tasks-preview-worker-appbasis-tasks-minimal";

test("generated Worker workflows bind only through the dedicated generated preview environment", async () => {
  const [bootstrap, deploy] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(deployPath, "utf8"),
  ]);

  for (const workflow of [bootstrap, deploy]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /environment: generated-tasks-preview/);
    assert.doesNotMatch(workflow, /environment: reference-preview/);
    assert.match(workflow, /APPBASIS_GENERATED_APP_ID: tasks-minimal/);
    assert.match(
      workflow,
      /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
    );
    assert.match(
      workflow,
      /generated-tasks-preview-hyperdrive\.mjs resolve/,
    );
    assert.match(workflow, /entrypoint: "\.\/worker\/preview\.ts"/);
    assert.doesNotMatch(workflow, /secrets\.APPBASIS_HYPERDRIVE_ID/);
    assert.doesNotMatch(workflow, /generated-tasks-preview-hyperdrive\.mjs ensure/);
    assert.match(workflow, /--experimental-provision=false/);
    assert.match(workflow, /--experimental-auto-create=false/);
    assert.match(workflow, new RegExp(sharedWorkerConcurrencyGroup));
    assert.doesNotMatch(workflow, /appbasis\.app\.json/);
    for (const forbidden of forbiddenProvisioningInputs) {
      assert.equal(workflow.includes(forbidden), false);
    }
  }
});

test("Hyperdrive creation remains a separate explicitly confirmed deployment path", async () => {
  const workflow = await readFile(hyperdriveBootstrapPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /apply:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /environment: generated-tasks-preview/);
  assert.match(
    workflow,
    /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_HYPERDRIVE: \$\{\{ inputs\.apply && '1' \|\| '0' \}\}/,
  );
  assert.match(workflow, /generated-tasks-preview-hyperdrive\.mjs ensure/);
  assert.doesNotMatch(workflow, /wrangler deploy|wrangler secret put|migrate:preview/);
  assert.doesNotMatch(workflow, /reference-preview/);
});

test("Worker bootstrap remains limited to first Worker creation and secret installation", async () => {
  const bootstrap = await readFile(bootstrapPath, "utf8");

  assert.match(bootstrap, /writeGeneratedPreviewBootstrapWranglerConfig/);
  assert.match(bootstrap, /entrypoint: "\.\/worker\/preview\.ts"/);
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
  assert.match(
    bootstrap,
    /secret\.trim\(\) !== secret[\s\S]*secret\.length < 32/,
  );
  assert.match(bootstrap, /wrangler secret put BETTER_AUTH_SECRET/);
  assert.match(bootstrap, /wrangler secret list/);
  assert.doesNotMatch(
    bootstrap,
    /reference-preview-migrate|migrate:reference|permission.*provision/i,
  );
});

test("normal deploy synchronizes the runtime secret and proves the database-backed boundary", async () => {
  const deploy = await readFile(deployPath, "utf8");

  assert.match(deploy, /writeGeneratedPreviewWranglerConfig/);
  assert.match(deploy, /entrypoint: "\.\/worker\/preview\.ts"/);
  assert.match(deploy, /Generated preview Worker is not bootstrapped/);
  assert.match(
    deploy,
    /APPBASIS_BETTER_AUTH_SECRET: \$\{\{ secrets\.APPBASIS_BETTER_AUTH_SECRET \}\}/,
  );
  assert.match(
    deploy,
    /Protected Better Auth secret does not satisfy the generated runtime contract/,
  );
  assert.match(deploy, /Validate generated Worker bundle without provisioning/);
  assert.match(deploy, /--dry-run/);
  assert.match(deploy, /Synchronize required Worker secret/);
  assert.match(deploy, /wrangler secret put BETTER_AUTH_SECRET/);
  assert.match(deploy, /wrangler secret list/);
  assert.match(
    deploy,
    /Generated preview Worker is missing BETTER_AUTH_SECRET after synchronization/,
  );
  assert.match(deploy, /Deploy generated Worker without provisioning/);
  assert.match(deploy, /Verify deployed generated runtime boundary/);
  assert.match(deploy, /node \.\/tooling\/generated-preview-smoke\.mjs/);
  assert.match(deploy, /Verify deployed generated database binding/);
  assert.match(deploy, /node \.\/tooling\/generated-preview-database-smoke\.mjs/);
  assert.doesNotMatch(
    deploy,
    /Verify deployed generated database binding\n\s+env:/,
  );

  const dryRun = deploy.indexOf("Validate generated Worker bundle without provisioning");
  const synchronize = deploy.indexOf("Synchronize required Worker secret");
  const deployWorker = deploy.indexOf("Deploy generated Worker without provisioning");
  const databaseSmoke = deploy.indexOf("Verify deployed generated database binding");
  assert.ok(dryRun >= 0 && dryRun < synchronize);
  assert.ok(synchronize < deployWorker);
  assert.ok(deployWorker < databaseSmoke);

  assert.doesNotMatch(
    deploy,
    /reference-preview-smoke|APPBASIS_SMOKE_|migrate:reference|permission.*provision/i,
  );
});

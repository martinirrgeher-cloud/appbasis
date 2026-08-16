import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m3-preview-deploy.yml",
  import.meta.url,
);
const previewWorkerUrl = new URL(
  "../apps/m3-preview/worker/preview.ts",
  import.meta.url,
);
const hyperdriveUrl = new URL("./m3-preview-hyperdrive.mjs", import.meta.url);

test("pins m3-preview as a concrete guarded deployment consumer", async () => {
  const [workflow, previewWorker, hyperdrive] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(previewWorkerUrl, "utf8"),
    readFile(hyperdriveUrl, "utf8"),
  ]);

  assert.match(workflow, /name: M3 Preview Deploy/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /apply:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /environment: m3-preview/);
  assert.match(workflow, /APPBASIS_GENERATED_APP_ID: m3-preview/);
  assert.match(workflow, /APPBASIS_GENERATED_WORKER_NAME: appbasis-m3-preview/);
  assert.match(workflow, /APPBASIS_M3_PREVIEW_DEPLOY_APPLY/);
  assert.match(workflow, /deployment was not explicitly confirmed/);

  assert.match(
    workflow,
    /node \.\/apps\/m3-preview\/tooling\/verify-preview-schema\.mjs/,
  );
  const schemaGate = workflow.indexOf(
    "Verify m3-preview database schema before provider changes",
  );
  const workerGate = workflow.indexOf(
    "Require exact pre-provisioned m3-preview Worker",
  );
  const versionResolve = workflow.indexOf(
    "Resolve exact one-time m3-preview initial version",
  );
  const versionDeploy = workflow.indexOf(
    "Deploy exact initial m3-preview Worker version",
  );
  const deploymentVerify = workflow.indexOf(
    "Verify exact initial m3-preview deployment",
  );
  const runtimeSmoke = workflow.indexOf(
    "Verify deployed m3-preview runtime boundary",
  );
  assert.ok(schemaGate >= 0);
  assert.ok(workerGate > schemaGate);
  assert.ok(versionResolve > workerGate);
  assert.ok(versionDeploy > versionResolve);
  assert.ok(deploymentVerify > versionDeploy);
  assert.ok(runtimeSmoke > deploymentVerify);

  assert.match(workflow, /node \.\/tooling\/m3-preview-hyperdrive\.mjs resolve/);
  assert.doesNotMatch(workflow, /m3-preview-hyperdrive\.mjs ensure/);
  assert.doesNotMatch(workflow, /APPBASIS_APPLY_HYPERDRIVE/);
  assert.match(workflow, /entrypoint: "\.\/worker\/preview\.ts"/);
  assert.match(workflow, /apps\/m3-preview\/wrangler\.preview\.generated\.json/);
  assert.match(workflow, /--cwd \.\.\/m3-preview/);

  assert.match(workflow, /m3-preview-worker-bootstrap\.mjs ensure/);
  assert.match(workflow, /APPBASIS_APPLY_WORKER: "0"/);
  assert.match(workflow, /m3-preview-initial-version\.mjs resolve-for-deploy/);
  assert.match(workflow, /m3-preview-initial-version\.mjs verify-deploy/);
  assert.match(workflow, /wrangler versions deploy/);
  assert.match(workflow, /\$\{APPBASIS_VERSION_ID\}@100%/);
  assert.match(workflow, /-y/);

  assert.doesNotMatch(workflow, /wrangler versions upload/);
  assert.doesNotMatch(workflow, /WRANGLER_OUTPUT_FILE_PATH/);
  assert.doesNotMatch(workflow, /wrangler secret list/);
  assert.doesNotMatch(workflow, /APPBASIS_BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /wrangler secret put/);
  assert.doesNotMatch(workflow, /--request PUT/);
  assert.doesNotMatch(workflow, /workers\/scripts\/.*\/secrets/);

  assert.match(workflow, /generated-preview-smoke\.mjs/);
  assert.match(workflow, /generated-preview-database-smoke\.mjs/);
  assert.doesNotMatch(workflow, /apply-generated-preview-migrations/);
  assert.doesNotMatch(workflow, /generated-tasks-preview-migrate/);
  assert.doesNotMatch(workflow, /generated-tasks-preview-hyperdrive-bootstrap/);

  assert.match(previewWorker, /appId: "m3-preview"/);
  assert.match(previewWorker, /\/api\/health\/database/);
  assert.match(previewWorker, /SELECT 1::integer AS appbasis_database_health/);
  assert.match(previewWorker, /DATABASE_NOT_CONFIGURED/);
  assert.match(previewWorker, /DATABASE_UNAVAILABLE/);

  assert.match(hyperdrive, /appId: "m3-preview"/);
  assert.match(hyperdrive, /environment: "m3-preview"/);
  assert.match(hyperdrive, /name: "appbasis-m3-preview-db"/);
  assert.match(hyperdrive, /database: "appbasis_m3_preview"/);
  assert.match(hyperdrive, /resolveGeneratedPreviewHyperdrive/);
});

test("keeps m3-preview provisioning outside the deployment workflow", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.doesNotMatch(workflow, /APPBASIS_APPLY_HYPERDRIVE/);
  assert.doesNotMatch(workflow, /ensureGeneratedPreviewHyperdrive/);
  assert.doesNotMatch(workflow, /create.*database/i);
  assert.doesNotMatch(workflow, /hyperdrive.*create/i);
  assert.doesNotMatch(workflow, /workers\/workers.*POST/i);
  assert.doesNotMatch(workflow, /APPBASIS_BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /--request PUT/);
  assert.doesNotMatch(workflow, /wrangler versions upload/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootWorkflowUrl = new URL(
  "../.github/workflows/m3-preview-root-admin-bootstrap.yml",
  import.meta.url,
);
const smokeWorkflowUrl = new URL(
  "../.github/workflows/m3-preview-smoke-principals-bootstrap.yml",
  import.meta.url,
);
const deployWorkflowUrl = new URL(
  "../.github/workflows/m3-preview-deploy.yml",
  import.meta.url,
);
const rootBootstrapUrl = new URL(
  "../apps/m3-preview/tooling/bootstrap-root-admin.mjs",
  import.meta.url,
);
const smokeBootstrapUrl = new URL(
  "../apps/m3-preview/tooling/bootstrap-smoke-principals.mjs",
  import.meta.url,
);
const smokeConfigUrl = new URL(
  "../apps/m3-preview/tooling/vite.smoke-bootstrap.config.ts",
  import.meta.url,
);
const smokeContractUrl = new URL("./m3-preview-smoke-contract.mjs", import.meta.url);

function pinManualBootstrapWorkflow(workflow, mutationStepName) {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /apply:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /environment: m3-preview/);
  assert.match(workflow, /pnpm run verify:repo/);
  assert.match(workflow, /verify-preview-schema\.mjs/);

  const confirmation = workflow.indexOf("Require explicit");
  const protectedInputs = workflow.indexOf("Validate and mask protected");
  const schema = workflow.indexOf("Verify migrated m3-preview database");
  const mutation = workflow.indexOf(mutationStepName);
  assert.ok(confirmation >= 0);
  assert.ok(protectedInputs > confirmation);
  assert.ok(schema > protectedInputs);
  assert.ok(mutation > schema);

  assert.doesNotMatch(workflow, /wrangler deploy/);
  assert.doesNotMatch(workflow, /wrangler versions deploy/);
  assert.doesNotMatch(workflow, /wrangler versions upload/);
  assert.doesNotMatch(workflow, /apply-preview-migrations/);
  assert.doesNotMatch(workflow, /m3-preview-hyperdrive\.mjs ensure/);
  assert.doesNotMatch(workflow, /APPBASIS_APPLY_HYPERDRIVE/);
  assert.doesNotMatch(workflow, /APPBASIS_APPLY_WORKER: "1"/);
}

test("pins separate explicitly confirmed m3-preview identity bootstrap workflows", async () => {
  const [rootWorkflow, smokeWorkflow] = await Promise.all([
    readFile(rootWorkflowUrl, "utf8"),
    readFile(smokeWorkflowUrl, "utf8"),
  ]);

  pinManualBootstrapWorkflow(
    rootWorkflow,
    "Create one-time m3-preview technical root administrator",
  );
  pinManualBootstrapWorkflow(
    smokeWorkflow,
    "Provision exact m3-preview smoke principals and permissions",
  );

  assert.match(rootWorkflow, /bootstrap-root-admin\.mjs/);
  assert.doesNotMatch(rootWorkflow, /bootstrap-smoke-principals\.mjs/);
  assert.match(smokeWorkflow, /Build smoke bootstrap operational runner without secrets/);
  assert.match(smokeWorkflow, /vite build/);
  assert.match(smokeWorkflow, /vite\.smoke-bootstrap\.config\.ts/);
  assert.match(
    smokeWorkflow,
    /\.smoke-bootstrap-dist\/bootstrap-smoke-principals\.mjs/,
  );
  assert.doesNotMatch(smokeWorkflow, /node \.\/apps\/m3-preview\/tooling\/bootstrap-smoke-principals\.mjs/);
});

test("keeps normal m3-preview deploy free of identity or permission provisioning", async () => {
  const workflow = await readFile(deployWorkflowUrl, "utf8");
  const runtimeSmoke = workflow.indexOf("Verify deployed m3-preview runtime boundary");
  const databaseSmoke = workflow.indexOf("Verify deployed m3-preview database binding");
  const acceptanceSmoke = workflow.indexOf(
    "Verify m3-preview authenticated permission and tasks acceptance",
  );
  assert.ok(runtimeSmoke >= 0);
  assert.ok(databaseSmoke > runtimeSmoke);
  assert.ok(acceptanceSmoke > databaseSmoke);
  assert.match(workflow, /m3-preview-acceptance-smoke\.mjs/);
  assert.match(workflow, /APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD/);
  assert.match(workflow, /APPBASIS_SMOKE_ALLOWED_PASSWORD/);
  assert.match(workflow, /APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD/);
  assert.match(workflow, /APPBASIS_SMOKE_DENIED_PASSWORD/);

  assert.doesNotMatch(workflow, /bootstrap-root-admin/);
  assert.doesNotMatch(workflow, /bootstrap-smoke-principals/);
  assert.doesNotMatch(workflow, /APPBASIS_BETTER_AUTH_SECRET/);
  assert.doesNotMatch(workflow, /APPBASIS_ROOT_ADMIN_PASSWORD/);
});

test("bundles the m3-preview operational adapter without Reference runtime coupling", async () => {
  const [rootBootstrap, smokeBootstrap, smokeConfig, smokeContract] =
    await Promise.all([
      readFile(rootBootstrapUrl, "utf8"),
      readFile(smokeBootstrapUrl, "utf8"),
      readFile(smokeConfigUrl, "utf8"),
      readFile(smokeContractUrl, "utf8"),
    ]);

  assert.match(rootBootstrap, /@appbasis\/identity\/root-admin/);
  assert.match(smokeBootstrap, /@appbasis\/identity/);
  assert.match(smokeBootstrap, /@appbasis\/permissions/);
  assert.match(smokeBootstrap, /@appbasis\/permissions\/provisioning/);
  assert.doesNotMatch(rootBootstrap, /apps\/reference|@appbasis\/reference/);
  assert.doesNotMatch(smokeBootstrap, /apps\/reference|@appbasis\/reference/);
  assert.match(
    smokeConfig,
    /noExternal: \["@appbasis\/database", "@appbasis\/identity", "@appbasis\/permissions"\]/,
  );

  assert.match(smokeContract, /allowedRoleId: "demo:member"/);
  assert.match(smokeContract, /m3\.root\.admin/);
  assert.match(smokeContract, /m3\.smoke\.allowed/);
  assert.match(smokeContract, /m3\.smoke\.denied/);
});

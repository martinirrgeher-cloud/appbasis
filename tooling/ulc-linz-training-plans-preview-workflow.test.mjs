import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

test("E7B9 workflow keeps inspect read-only and gates every preview mutation explicitly", async () => {
  const workflow = await readFile(
    resolve(
      repositoryRoot,
      ".github/workflows/ulc-linz-e7b9-preview.yml",
    ),
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/);
  for (const operation of ["inspect", "migrate", "deploy", "accept"]) {
    assert.match(workflow, new RegExp("- " + operation));
  }
  assert.match(workflow, /default: false/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(
    workflow,
    /environment:\n\s+name: generated-preview-ulc-linz/,
  );
  assert.match(workflow, /inputs\.operation != 'inspect'/);
  assert.match(workflow, /inputs\.apply && '1' \|\| '0'/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(
    workflow,
    /steps\.training_documentation_state\.outputs\.state == 'migration-required'/,
  );
  assert.match(
    workflow,
    /steps\.training_plans_state\.outputs\.state == 'migration-required'/,
  );

  assert.match(
    workflow,
    /ulc-linz-attendance-preview\.mjs inspect/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_ATTENDANCE_PREVIEW: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-attendance-preview\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-attendance-preview\.mjs verify/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-v4-preview\.mjs inspect/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_TRAINING_BLOCKS_V4_PREVIEW: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-v4-preview\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-v4-preview\.mjs verify/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-plans-preview\.mjs inspect/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_TRAINING_PLANS_PREVIEW: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-plans-preview\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-plans-preview\.mjs verify/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-documentation-preview\.mjs inspect/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_TRAINING_DOCUMENTATION_PREVIEW: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-documentation-preview\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-documentation-preview\.mjs verify/,
  );

  const documentationInspectIndex = workflow.indexOf(
    "ulc-linz-training-documentation-preview.mjs inspect",
  );
  const documentationApplyIndex = workflow.indexOf(
    "ulc-linz-training-documentation-preview.mjs apply",
  );
  const trainingPlansInspectIndex = workflow.indexOf(
    "ulc-linz-training-plans-preview.mjs inspect",
  );
  assert.ok(documentationInspectIndex >= 0);
  assert.ok(documentationApplyIndex > documentationInspectIndex);
  assert.ok(trainingPlansInspectIndex > documentationApplyIndex);

  assert.match(
    workflow,
    /ulc-linz-d4-preview-database-access\.mjs reconcile/,
  );
  assert.match(
    workflow,
    /ulc-linz-d4-preview-database-access\.mjs preflight-existing/,
  );

});

test("E7B9 skips redundant schema inspections during deploy and accept but retains fail-closed verification", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/ulc-linz-e7b9-preview.yml"),
    "utf8",
  );

  function step(name) {
    const marker = "      - name: " + name + "\n";
    const start = workflow.indexOf(marker);
    assert.ok(start >= 0, "Missing workflow step: " + name);
    const next = workflow.indexOf("\n      - name: ", start + marker.length);
    return workflow.slice(start, next < 0 ? undefined : next);
  }

  const inspectOnlyWhenNeeded = [
    "Inspect current attendance preview state",
    "Inspect current training-blocks-v4 preview state",
    "Inspect current training-documentation preview state",
    "Inspect current training-plans preview state",
  ];
  for (const name of inspectOnlyWhenNeeded) {
    assert.match(
      step(name),
      /if: inputs\.operation == 'migrate' \|\| inputs\.operation == 'inspect'/,
      name + " must be skipped during deploy and accept",
    );
  }

  for (const name of [
    "Require current attendance schema before runtime operation",
    "Require current training-blocks-v4 schema before runtime operation",
  ]) {
    assert.match(step(name), /if: inputs\.operation != 'inspect'/);
    assert.match(step(name), /\.mjs verify/);
  }
  for (const name of [
    "Require current training-plans schema before runtime operation",
    "Require current training-documentation schema before runtime operation",
  ]) {
    assert.match(
      step(name),
      /if: inputs\.operation == 'deploy' \|\| inputs\.operation == 'accept'/,
    );
    assert.match(step(name), /\.mjs verify/);
  }

  assert.match(
    step("Apply training-documentation schema v1"),
    /inputs\.operation == 'migrate' && steps\.training_documentation_state\.outputs\.state == 'migration-required'/,
  );
  assert.match(
    step("Apply training-plans schema v2"),
    /inputs\.operation == 'migrate' && steps\.training_plans_state\.outputs\.state == 'migration-required'/,
  );
  assert.match(
    step("Verify exact preview runtime database access"),
    /if: inputs\.operation != 'inspect'/,
  );
  assert.ok(
    workflow.indexOf("Require current training-documentation schema before runtime operation") <
      workflow.indexOf("Deploy E7B9 standard-module preview runtime"),
    "Fail-closed schema guards must precede the provider deploy",
  );
});

test("E7B9 deploy-accept runs deploy, exact-SHA guards, and authenticated acceptance in one explicitly authorized job", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/ulc-linz-e7b9-preview.yml"),
    "utf8",
  );
  const steps = workflow.split(/(?=^      - name: )/m);
  function step(name) {
    const match = steps.find((part) => part.startsWith("      - name: " + name + "\n"));
    assert.ok(match, "Missing step: " + name);
    return match;
  }
  const combined = "inputs.operation == 'deploy-accept'";
  assert.match(workflow, /^          - deploy-accept$/m);
  assert.match(step("Require explicit authorization for mutation"), /inputs\.operation != 'inspect'/);
  assert.match(step("Require explicit authorization for mutation"), /APPBASIS_APPLY/);
  for (const name of [
    "Require current training-plans schema before runtime operation",
    "Require current training-documentation schema before runtime operation",
    "Resolve isolated preview worker and URL",
    "Verify existing preview standard-module runtime",
    "Resolve isolated ULC preview Hyperdrives",
    "Render current E7B9 preview config",
    "Validate E7B9 preview bundle without provisioning",
    "Synchronize preview identity secret",
    "Deploy E7B9 standard-module preview runtime",
    "Require exact deployed E7B9 build",
    "Verify deployed preview runtime and database",
    "Verify E7B9 UI and anonymous API boundary",
    "Run authenticated E7B9 training-planning acceptance",
    "Run authenticated attendance dual-mode acceptance",
    "Remove obsolete Preview training groups",
  ]) {
    assert.ok(step(name).includes(combined), name + " must run in combined mode");
  }
  for (const name of [
    "Inspect current attendance preview state",
    "Inspect current training-blocks-v4 preview state",
    "Inspect current training-documentation preview state",
    "Inspect current training-plans preview state",
    "Apply training-plans schema v2",
    "Apply training-documentation schema v1",
  ]) {
    assert.ok(!step(name).includes(combined), name + " must not run on deploy-accept");
  }
  assert.match(
    step("Validate and mask preview runtime inputs"),
    /\[ "\$\{\{ inputs\.operation \}\}" = "deploy-accept" \]/,
  );
  assert.match(
    step("Validate and mask preview runtime inputs"),
    /APPBASIS_BETTER_AUTH_SECRET/,
  );
  assert.match(
    step("Validate and mask preview runtime inputs"),
    /APPBASIS_PREVIEW_USER_PASSWORD/,
  );
  const ordered = [
    "Require explicit authorization for mutation",
    "Verify exact preview runtime database access",
    "Deploy E7B9 standard-module preview runtime",
    "Require exact deployed E7B9 build",
    "Verify deployed preview runtime and database",
    "Verify E7B9 UI and anonymous API boundary",
    "Run authenticated E7B9 training-planning acceptance",
    "Run authenticated attendance dual-mode acceptance",
    "Remove obsolete Preview training groups",
  ];
  let last = -1;
  for (const name of ordered) {
    const index = workflow.indexOf("      - name: " + name + "\n");
    assert.ok(index > last, name + " must run after the preceding guard");
    last = index;
  }
  assert.match(
    step("Run authenticated E7B9 training-planning acceptance"),
    /id: training_plans_acceptance/,
  );
  const cleanupStep = step("Remove obsolete Preview training groups");
  assert.match(cleanupStep, /!cancelled\(\)/);
  assert.match(cleanupStep, /steps\.training_plans_acceptance\.outcome == 'failure'/);
  assert.match(cleanupStep, /steps\.training_plans_acceptance\.outcome == 'success'/);
  assert.match(cleanupStep, /ULC_LINZ_PREVIEW_GROUP_CLEANUP_APPLY: "1"/);
  assert.match(workflow, /concurrency:\n  group: generated-preview-ulc-linz/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /\.gitSha == \$sha/);
});

test("E7B9 deploy reuses the isolated standard-module runtime without auto-provisioning", async () => {
  const workflow = await readFile(
    resolve(
      repositoryRoot,
      ".github/workflows/ulc-linz-e7b9-preview.yml",
    ),
    "utf8",
  );

  assert.match(workflow, /APPBASIS_EXPECTED_MODE: standard-module/);
  assert.match(
    workflow,
    /entrypoint: "\.\/worker\/preview-exercise-catalog-standard\.ts"/,
  );
  assert.match(workflow, /--dry-run/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
  assert.match(workflow, /buildSha: process\.env\.GITHUB_SHA/);
  assert.match(workflow, /\/api\/health\/build/);
  assert.match(workflow, /APPBASIS_EXPECTED_GIT_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /\.gitSha == \$sha/);
  assert.match(
    workflow,
    /not bound to the exact current E7B9 Git SHA/,
  );
  assert.match(workflow, /wrangler deployments list/);
  assert.match(workflow, /wrangler secret put BETTER_AUTH_SECRET/);
  assert.match(workflow, /wrangler deploy/);
  assert.match(workflow, /generated-preview-database-smoke\.mjs/);
  assert.match(workflow, /id="training-plan-overview-group"/);
  assert.match(workflow, /id="training-plan-overview"/);
  assert.match(workflow, /Production was not changed\./);
});

test("E7B9 remote acceptance is separately gated and pins the complete training-planning surface", async () => {
  const workflow = await readFile(
    resolve(
      repositoryRoot,
      ".github/workflows/ulc-linz-e7b9-preview.yml",
    ),
    "utf8",
  );

  assert.match(workflow, /inputs\.operation == 'accept'/);
  assert.match(
    workflow,
    /secrets\.APPBASIS_PREVIEW_USER_PASSWORD/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-plans-preview-acceptance\.mjs/,
  );
  assert.match(
    workflow,
    /ulc-linz-attendance-preview-acceptance\.mjs/,
  );
  assert.match(
    workflow,
    /Remove obsolete Preview training groups/,
  );
  assert.match(
    workflow,
    /ULC_LINZ_PREVIEW_GROUP_CLEANUP_APPLY: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-preview-group-cleanup\.mjs/,
  );
  for (const marker of [
    'id="registration-quick-action"',
    'id="registration-list"',
    'id="athlete-user-form"',
    'id="training-plan-quick-action"',
    'id="training-plan-attendance-filter"',
    'id="training-plan-block-template"',
    'id="training-plan-save-template"',
    'id="training-documentation-quick-action"',
  ]) {
    assert.ok(workflow.includes(marker));
  }
  assert.match(
    workflow,
    /Unauthenticated training-plans API returned unexpected HTTP/,
  );
  assert.match(
    workflow,
    /Unauthenticated self-registration API returned unexpected HTTP/,
  );
  assert.match(workflow, /401\|403/);
});

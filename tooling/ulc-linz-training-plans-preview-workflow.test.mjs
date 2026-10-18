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

  assert.match(
    workflow,
    /ulc-linz-training-blocks-parity-preview\.mjs inspect/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-parity-preview\.mjs verify/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-v3-preview\.mjs inspect/,
  );
  assert.match(
    workflow,
    /APPBASIS_APPLY_TRAINING_BLOCKS_V3_PREVIEW: "1"/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-v3-preview\.mjs apply/,
  );
  assert.match(
    workflow,
    /ulc-linz-training-blocks-v3-preview\.mjs verify/,
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
    /ulc-linz-d4-preview-database-access\.mjs reconcile/,
  );
  assert.match(
    workflow,
    /ulc-linz-d4-preview-database-access\.mjs preflight-existing/,
  );
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
  for (const marker of [
    'id="training-plan-quick-action"',
    'id="training-plan-attendance-filter"',
    'id="training-plan-block-template"',
    'id="training-plan-save-template"',
  ]) {
    assert.ok(workflow.includes(marker));
  }
  assert.match(
    workflow,
    /Unauthenticated training-plans API returned unexpected HTTP/,
  );
  assert.match(workflow, /401\|403/);
});

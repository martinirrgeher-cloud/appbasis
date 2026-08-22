import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/m6-ulc-production-worker-create.yml",
);

const workflow = await readFile(workflowPath, "utf8");

test("M6 worker create workflow is manual, main-only and exact-confirmation gated", () => {
  assert.match(workflow, /^name: M6 ULC Production Worker Create$/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /^permissions:\n\s{2}contents: read$/m);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$CONFIRMATION" = "CREATE-CLOSED-ULC-WORKER"/);
});

test("workflow reverifies fresh provider state and the canonical M3 gate before POST", () => {
  assert.match(
    workflow,
    /node \.\/tooling\/ulc-linz-m6-provider-state-preflight\.mjs > "\$RESULT_PATH"/,
  );
  assert.match(workflow, /existingExactProductionResourceVerified !== true/);
  assert.match(workflow, /noExistingCloudflareWorkerCandidate !== true/);
  assert.match(
    workflow,
    /evaluateUlcLinzM6ProductionWorkerPrewrite\(providerState\)/,
  );
  assert.match(workflow, /planUlcLinzM6ProductionWorkerCreate\(prewrite\)/);
  assert.match(
    workflow,
    /evaluateUlcLinzM6ProductionWorkerM3Gate\(plan\)/,
  );
  assert.match(workflow, /productionPreparationGateEvidenceConsumed !== true/);
  assert.match(workflow, /productionPreparationEligible !== true/);
  assert.match(workflow, /providerWriteAllowed !== false/);
  assert.match(workflow, /executionAuthorized !== false/);
  assert.match(workflow, /publicExposureAllowed !== false/);
  assert.match(workflow, /productionReady !== false/);
  assert.match(workflow, /releaseAuthorized !== false/);
});

test("the only mutation is the exact closed Cloudflare Worker create", () => {
  const posts = workflow.match(/--request POST/g) ?? [];
  assert.equal(posts.length, 1);
  assert.match(
    workflow,
    /https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\$CLOUDFLARE_ACCOUNT_ID\/workers\/workers/,
  );
  assert.match(workflow, /--data-binary "@\$BODY_PATH"/);
  assert.doesNotMatch(workflow, /wrangler\s+deploy/i);
  assert.doesNotMatch(workflow, /wrangler\s+secret\s+put/i);
  assert.doesNotMatch(workflow, /\/routes\b/);
  assert.doesNotMatch(workflow, /\/domains\b/);
  assert.doesNotMatch(workflow, /workers\.dev/i);
});

test("workflow read-back proves the exact worker remains closed", () => {
  assert.match(
    workflow,
    /workers\/workers\/\$TARGET_WORKER/,
  );
  assert.match(workflow, /result\?\.name !== "appbasis-ulc-linz-production"/);
  assert.match(workflow, /result\?\.subdomain\?\.enabled !== false/);
  assert.match(workflow, /result\?\.subdomain\?\.previews_enabled !== false/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /m6-worker-create-response\.json/);
  assert.match(workflow, /m6-worker-readback\.json/);
  assert.doesNotMatch(workflow, /upload-artifact/);
  assert.doesNotMatch(workflow, /cat\s+[^\n]*(?:preflight|response|readback)\.json/);
});

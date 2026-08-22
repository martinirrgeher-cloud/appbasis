import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/m6-ulc-provider-state-preflight.yml",
);
const createWorkflowPath = resolve(
  repositoryRoot,
  ".github/workflows/m6-ulc-production-worker-create.yml",
);

const requiredProtectedInputs = [
  "NEON_API_KEY",
  "NEON_ORG_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

const forbiddenMutationPatterns = [
  /\bwrangler\s+deploy\b/i,
  /\bwrangler\s+secret\s+put\b/i,
  /\bneonctl\b/i,
  /\bcurl\b[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/i,
  /\bmethod\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i,
  /\b(?:create|delete|update)\s+(?:project|worker|hyperdrive|domain)\b/i,
];

test("M6 provider preflight workflow is manual, main-only and read-only", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /^name: M6 ULC Provider State Preflight$/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /^permissions:\n\s{2}contents: read$/m);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(
    workflow,
    /ULC_LINZ_M6_NEON_CREATE_METHOD: neon-api-v2-project-create-region-id/,
  );
  assert.match(
    workflow,
    /node \.\/tooling\/ulc-linz-m6-provider-state-preflight\.mjs > "\$RESULT_PATH"/,
  );

  for (const input of requiredProtectedInputs) {
    assert.match(workflow, new RegExp(`secrets\\.${input}`));
    assert.match(workflow, new RegExp(`::add-mask::\\$${input}`));
  }

  assert.match(workflow, /providerWriteAllowed !== false/);
  assert.match(workflow, /executionAuthorized !== false/);
  assert.match(workflow, /publicExposureAllowed !== false/);
  assert.match(workflow, /productionReady !== false/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -f "\$RUNNER_TEMP\/m6-provider-state-preflight\.json"/);
  assert.doesNotMatch(workflow, /upload-artifact/);

  for (const pattern of forbiddenMutationPatterns) {
    assert.doesNotMatch(workflow, pattern);
  }
});

test("worker prewrite runs only after exact Neon production resource verification", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(
    workflow,
    /if \(providerState\?\.existingExactProductionResourceVerified !== true\) \{/,
  );
  assert.match(workflow, /providerState\?\.firstProviderWriteRequired !== true/);
  assert.match(
    workflow,
    /providerState\?\.firstProviderWriteAlreadySatisfied !== false/,
  );
  assert.match(
    workflow,
    /throw new Error\("M6 provider preflight returned an inconsistent Neon readiness state\."\)/,
  );
  assert.match(
    workflow,
    /const prewrite = evaluateUlcLinzM6ProductionWorkerPrewrite\(providerState\);/,
  );
});

test("worker prewrite summary distinguishes Neon-create skip from evaluated target", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(
    workflow,
    /M6 production worker prewrite skipped: exact Neon production resource is not yet verified and Neon creation remains pending; no Cloudflare write is authorized\./,
  );
  assert.match(
    workflow,
    /M6 production worker prewrite evaluated safely; no Cloudflare write is authorized\./,
  );
  assert.doesNotMatch(
    workflow,
    /echo 'M6 production worker prewrite evaluated safely; no Cloudflare write is authorized\.' >> "\$GITHUB_STEP_SUMMARY"/,
  );
});

test("workflow never prints the raw provider evidence snapshot", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /cat\s+[^\n]*m6-provider-state-preflight\.json/);
  assert.doesNotMatch(workflow, /GITHUB_STEP_SUMMARY[^\n]*RESULT_PATH/);
  assert.match(
    workflow,
    /M6 read-only provider inventory verified; no provider write is authorized\./,
  );
});

test("M6 worker create workflow is manual, main-only and exact-confirmation gated", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(workflow, /^name: M6 ULC Production Worker Create$/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(workflow, /^permissions:\n\s{2}contents: read$/m);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$CONFIRMATION" = "CREATE-CLOSED-ULC-WORKER"/);
});

test("M6 worker create workflow reverifies provider state and M3 gate before the POST", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(
    workflow,
    /node \.\/tooling\/ulc-linz-m6-provider-state-preflight\.mjs > "\$RESULT_PATH"/,
  );
  assert.match(workflow, /existingExactProductionResourceVerified !== true/);
  assert.match(workflow, /noExistingCloudflareWorkerCandidate !== true/);
  assert.match(workflow, /evaluateUlcLinzM6ProductionWorkerPrewrite\(providerState\)/);
  assert.match(workflow, /planUlcLinzM6ProductionWorkerCreate\(prewrite\)/);
  assert.match(workflow, /evaluateUlcLinzM6ProductionWorkerM3Gate\(plan\)/);
  assert.match(workflow, /productionPreparationGateEvidenceConsumed !== true/);
  assert.match(workflow, /productionPreparationEligible !== true/);
  assert.match(workflow, /providerWriteAllowed !== false/);
  assert.match(workflow, /executionAuthorized !== false/);
  assert.match(workflow, /publicExposureAllowed !== false/);
  assert.match(workflow, /productionReady !== false/);
  assert.match(workflow, /releaseAuthorized !== false/);
});

test("M6 worker create workflow reverifies Beta Worker inventory immediately before mutation", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(workflow, /Reverify Beta Worker inventory immediately before create/);
  assert.match(
    workflow,
    /https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\$CLOUDFLARE_ACCOUNT_ID\/workers\/workers/,
  );
  assert.match(workflow, /!Array\.isArray\(response\?\.result\)/);
  assert.match(
    workflow,
    /response\.result\.some\(\(worker\) => worker\?\.name === "appbasis-ulc-linz-production"\)/,
  );
  assert.match(workflow, /m6-beta-worker-inventory\.json/);
});

test("M6 worker create workflow allows only the exact closed Worker create mutation", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");
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
});

test("M6 worker create workflow read-back proves exact closed state and cleans evidence", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(workflow, /workers\/workers\/\$TARGET_WORKER/);
  assert.match(workflow, /result\?\.name !== "appbasis-ulc-linz-production"/);
  assert.match(workflow, /result\?\.subdomain\?\.enabled !== false/);
  assert.match(workflow, /result\?\.subdomain\?\.previews_enabled !== false/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /m6-beta-worker-inventory\.json/);
  assert.match(workflow, /m6-worker-create-response\.json/);
  assert.match(workflow, /m6-worker-readback\.json/);
  assert.doesNotMatch(workflow, /upload-artifact/);
  assert.doesNotMatch(workflow, /cat\s+[^\n]*(?:preflight|response|readback|inventory)\.json/);
});

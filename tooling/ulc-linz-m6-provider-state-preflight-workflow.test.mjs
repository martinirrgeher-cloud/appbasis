import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  UlcLinzM6CloudflareCreateCapabilityError,
  verifyUlcLinzM6CloudflareWorkerCreateCapability,
} from "./ulc-linz-m6-cloudflare-worker-create-capability.mjs";

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

const exactClosedBody = {
  name: "appbasis-ulc-linz-production",
  subdomain: { enabled: false, previews_enabled: false },
};

function createCapabilitySpec(subdomainSchema, { requestBodyRef = false } = {}) {
  const requestBody = {
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["name", "subdomain"],
          properties: {
            name: { type: "string", enum: ["appbasis-ulc-linz-production"] },
            subdomain: subdomainSchema,
          },
        },
      },
    },
  };
  return {
    paths: {
      "/accounts/{account_id}/workers/workers": {
        post: {
          requestBody: requestBodyRef
            ? { $ref: "#/components/requestBodies/WorkerCreate" }
            : requestBody,
        },
      },
    },
    components: requestBodyRef
      ? { requestBodies: { WorkerCreate: requestBody } }
      : {},
  };
}

function exactSubdomainSchema(overrides = {}) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["enabled", "previews_enabled"],
    properties: {
      enabled: { type: "boolean" },
      previews_enabled: { type: "boolean" },
    },
    ...overrides,
  };
}

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

test("M6 worker create workflow validates the exact planned body against the live Beta request schema", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(workflow, /Reverify live Beta create contract and complete Worker inventory/);
  assert.match(
    workflow,
    /https:\/\/raw\.githubusercontent\.com\/cloudflare\/api-schemas\/main\/openapi\.json/,
  );
  assert.match(
    workflow,
    /verifyUlcLinzM6CloudflareWorkerCreateCapability } from "\.\/tooling\/ulc-linz-m6-cloudflare-worker-create-capability\.mjs"/,
  );
  assert.match(workflow, /m6-worker-create-body\.json/);
  assert.match(workflow, /verifyUlcLinzM6CloudflareWorkerCreateCapability\(spec, body\)/);
  assert.match(workflow, /exactClosedBodyAccepted !== true/);
  assert.match(workflow, /atomicSubdomainDisableVerified !== true/);
  assert.match(workflow, /writableFalseValuesVerified !== true/);
  assert.match(workflow, /cache: "no-store"/);
  assert.match(workflow, /AbortSignal\.timeout\(15_000\)/);
});

test("Cloudflare capability accepts one writable branch containing both false fields", () => {
  const result = verifyUlcLinzM6CloudflareWorkerCreateCapability(
    createCapabilitySpec(exactSubdomainSchema()),
    exactClosedBody,
  );
  assert.equal(result.exactClosedBodyAccepted, true);
  assert.equal(result.atomicSubdomainDisableVerified, true);
  assert.equal(result.writableFalseValuesVerified, true);
});

test("Cloudflare capability follows an internal requestBody ref", () => {
  const result = verifyUlcLinzM6CloudflareWorkerCreateCapability(
    createCapabilitySpec(exactSubdomainSchema(), { requestBodyRef: true }),
    exactClosedBody,
  );
  assert.equal(result.exactClosedBodyAccepted, true);
});

test("Cloudflare capability allows allOf fragments to jointly prove the atomic pair", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    allOf: [
      {
        properties: { enabled: { type: "boolean", enum: [false] } },
        required: ["enabled"],
      },
      {
        properties: { previews_enabled: { type: "boolean", enum: [false] } },
        required: ["previews_enabled"],
      },
    ],
  };
  const result = verifyUlcLinzM6CloudflareWorkerCreateCapability(
    createCapabilitySpec(schema),
    exactClosedBody,
  );
  assert.equal(result.exactClosedBodyAccepted, true);
});

test("Cloudflare capability rejects readOnly or true-only closed flags", () => {
  for (const properties of [
    {
      enabled: { type: "boolean", readOnly: true },
      previews_enabled: { type: "boolean" },
    },
    {
      enabled: { type: "boolean", enum: [true] },
      previews_enabled: { type: "boolean" },
    },
    {
      enabled: { type: "boolean" },
      previews_enabled: { type: "boolean", enum: [true] },
    },
  ]) {
    assert.throws(
      () =>
        verifyUlcLinzM6CloudflareWorkerCreateCapability(
          createCapabilitySpec({
            type: "object",
            additionalProperties: false,
            required: ["enabled", "previews_enabled"],
            properties,
          }),
          exactClosedBody,
        ),
      (error) =>
        error instanceof UlcLinzM6CloudflareCreateCapabilityError &&
        error.code === "EXACT_CLOSED_BODY_NOT_ACCEPTED",
    );
  }
});

test("Cloudflare capability rejects mutually exclusive oneOf branches for the two closed flags", () => {
  const schema = {
    type: "object",
    oneOf: [
      {
        additionalProperties: false,
        properties: { enabled: { type: "boolean", enum: [false] } },
        required: ["enabled"],
      },
      {
        additionalProperties: false,
        properties: { previews_enabled: { type: "boolean", enum: [false] } },
        required: ["previews_enabled"],
      },
    ],
  };
  assert.throws(
    () =>
      verifyUlcLinzM6CloudflareWorkerCreateCapability(
        createCapabilitySpec(schema),
        exactClosedBody,
      ),
    (error) =>
      error instanceof UlcLinzM6CloudflareCreateCapabilityError &&
      error.code === "EXACT_CLOSED_BODY_NOT_ACCEPTED",
  );
});

test("M6 worker create workflow fully paginates Beta inventory and rejects every production candidate", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(workflow, /const maxPages = 100;/);
  assert.match(workflow, /const perPage = 100;/);
  assert.match(workflow, /url\.searchParams\.set\("page", String\(page\)\)/);
  assert.match(workflow, /url\.searchParams\.set\("per_page", String\(perPage\)\)/);
  assert.match(workflow, /payload\?\.result_info\?\.total_pages/);
  assert.match(workflow, /totalPages > maxPages/);
  assert.match(workflow, /function isUlcProductionCandidate\(name\)/);
  assert.match(workflow, /normalized === "ulc-linz" \|\| normalized === "appbasis-ulc-linz"/);
  assert.match(workflow, /normalized\.includes\("production"\)/);
  assert.match(workflow, /\(\?:\^\|-\)prod\(\?:-\|\$\)/);
  assert.match(workflow, /isUlcProductionCandidate\(worker\.name\)/);
  assert.match(workflow, /page === totalPages/);
  assert.match(workflow, /payload\.result\.length === 0/);
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

test("M6 worker create workflow proves deployed_on is present and null in response and read-back", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.equal((workflow.match(/Object\.hasOwn\(result \?\? \{\}, "deployed_on"\)/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\.deployed_on !== null/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /result\?\.deployed_on != null/);
  assert.equal((workflow.match(/result\?\.subdomain\?\.enabled !== false/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\?\.subdomain\?\.previews_enabled !== false/g) ?? []).length, 2);
  assert.equal((workflow.match(/!Array\.isArray\(result\?\.references\?\.domains\)/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\.references\.domains\.length !== 0/g) ?? []).length, 2);
});

test("M6 worker create workflow always reads back after any possibly committed POST", async () => {
  const workflow = await readFile(createWorkflowPath, "utf8");

  assert.match(workflow, /touch "\$RUNNER_TEMP\/m6-worker-post-attempted"/);
  assert.match(workflow, /- name: Read back closed Worker state after any attempted create\n\s+if: always\(\)/);
  assert.match(workflow, /if \[ ! -f "\$RUNNER_TEMP\/m6-worker-post-attempted" \]; then/);
  assert.match(workflow, /Cloudflare Worker read-back after attempted create failed with HTTP \$STATUS/);
  assert.match(workflow, /m6-worker-post-attempted/);
  assert.match(workflow, /m6-worker-create-response\.json/);
  assert.match(workflow, /m6-worker-readback\.json/);
  assert.doesNotMatch(workflow, /upload-artifact/);
  assert.doesNotMatch(workflow, /cat\s+[^\n]*(?:preflight|response|readback|inventory)\.json/);
});
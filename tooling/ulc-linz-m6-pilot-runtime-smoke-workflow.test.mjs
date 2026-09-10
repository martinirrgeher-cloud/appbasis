import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REFRESH = new URL("../.github/workflows/m6-ulc-production-runtime-refresh-config.yml", import.meta.url);
const PRIVATE_DEPLOY = new URL("../.github/workflows/m6-ulc-private-production-refresh-deploy.yml", import.meta.url);
const SECURITY_SMOKE = new URL("../.github/workflows/m5-ulc-private-security-smoke.yml", import.meta.url);
const LIFECYCLE_PREFLIGHT = new URL("../.github/workflows/m5-ulc-protected-lifecycle-operations.yml", import.meta.url);
const M5_EVIDENCE = new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url);
const PILOT_INGRESS = new URL("../.github/workflows/m6-ulc-production-pilot-ingress.yml", import.meta.url);
const REFRESH_CHAIN = new URL("../.github/workflows/m6-ulc-production-refresh-chain.yml", import.meta.url);
const SMOKE = new URL("../.github/workflows/m6-ulc-production-post-deploy-smoke.yml", import.meta.url);
const SMOKE_RUNNER = new URL("../apps/ulc-linz/tooling/run-production-post-deploy-smoke.mjs", import.meta.url);
const SMOKE_PRINCIPAL_BOOTSTRAP = new URL("../.github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml", import.meta.url);
const ULC_LINZ_APP = new URL("../apps/ulc-linz/", import.meta.url);
const EXACT_HEAD_CHILD_WORKFLOWS = [
  REFRESH,
  PRIVATE_DEPLOY,
  SECURITY_SMOKE,
  LIFECYCLE_PREFLIGHT,
  M5_EVIDENCE,
  PILOT_INGRESS,
  SMOKE_PRINCIPAL_BOOTSTRAP,
  SMOKE,
];

test("M6 runtime refresh binds Better Auth to the canonical workers.dev pilot origin without exposing the worker", async () => {
  const source = await readFile(REFRESH, "utf8");
  for (const marker of [
    "/workers/subdomain",
    'pilot_base_url="https://${TARGET_WORKER}.${subdomain}.workers.dev"',
    "pilot_origin_fingerprint=",
    "sha256sum",
    "PILOT_ORIGIN_FINGERPRINT=%s",
    "origin-hmac:${PILOT_ORIGIN_FINGERPRINT}",
    "baseURL: process.env.PILOT_BASE_URL",
    "Read and validate current closed private runtime state",
    "previous private deployment was not changed",
  ]) {
    assert.equal(source.includes(marker), true, `missing runtime pilot-origin guard: ${marker}`);
  }
  assert.equal(source.includes("baseURL: 'https://app.ulc-linz.at'"), false);
  assert.equal(source.includes("--request POST"), false);
  assert.equal(source.includes("/workers/scripts/$TARGET_WORKER/subdomain"), false);
});

test("M6 production refresh chain preserves canonical child workflows and per-step approvals", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "name: M6 ULC Production Refresh Chain",
    "workflow_dispatch:",
    "start_at:",
    "stop_after:",
    "actions: write",
    "if: github.ref == 'refs/heads/main'",
    "approve_runtime_refresh:",
    "approve_private_deploy:",
    "approve_security_smoke:",
    "approve_lifecycle_preflight:",
    "approve_m5_evidence:",
    "approve_pilot_ingress:",
    "approve_smoke_principal:",
    "approve_post_deploy_smoke:",
    "m6-ulc-production-runtime-refresh-config.yml",
    "m6-ulc-private-production-refresh-deploy.yml",
    "m5-ulc-private-security-smoke.yml",
    "m5-ulc-protected-lifecycle-operations.yml",
    "m5-ulc-production-evidence.yml",
    "m6-ulc-production-pilot-ingress.yml",
    "m6-ulc-production-smoke-principal-bootstrap.yml",
    "m6-ulc-production-post-deploy-smoke.yml",
    "REFRESH-CONFIGURE-ULC-PRODUCTION-RUNTIME",
    "REFRESH-DEPLOY-ULC-PRIVATE-PRODUCTION",
    "RUN-ULC-M5-PRIVATE-SECURITY-SMOKE",
    "VERIFY-ULC-M5-LIFECYCLE-BINDING",
    "VERIFY-ULC-M5-PRODUCTION",
    "ACTIVATE-ULC-M6-PILOT-INGRESS",
    "BOOTSTRAP-ULC-M6-SMOKE-PRINCIPAL",
    "RUN-ULC-M6-PRODUCTION-SMOKE",
    "administrator_username 'ulc.production.admin'",
    "apply_restore:true",
  ]) {
    assert.equal(source.includes(marker), true, `missing M6 refresh-chain contract: ${marker}`);
  }

  assert.equal((source.match(/default: false/g) ?? []).length, 8);
  assert.equal(source.includes("environment: m4-dr"), false);
  assert.equal(source.includes("secrets."), false);
  assert.equal(source.includes("CLOUDFLARE_API_TOKEN"), false);
  assert.equal(source.includes("NEON_API_KEY"), false);
  assert.equal(source.includes("DATABASE_URL"), false);
});

test("M6 production refresh chain binds every dispatch to the returned exact child run and never auto-retries", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "assert_main_head",
    ".commit.sha == $sha",
    "X-GitHub-Api-Version: 2026-03-10",
    "expected_head_sha",
    '. + {expected_head_sha:$expected_head_sha}',
    "workflow_run_id",
    ".run_url == $runUrl",
    ".head_sha == $sha",
    '.head_branch == "main"',
    '.event == "workflow_dispatch"',
    '.path == $path',
    "GitHub did not return the pinned workflow-dispatch run identity",
    "No automatic retry will be attempted.",
    "Fresh explicit approval is required for selected step",
    "latest_success_run",
    "failed child workflows are never retried automatically",
    "final production release: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing M6 refresh-chain safety guard: ${marker}`);
  }

  assert.equal(source.includes("m6-chain-before-"), false);
  assert.equal(source.includes("Ambiguous child-run identity"), false);
  assert.equal(source.includes("/rerun"), false);
  assert.equal(source.includes("/cancel"), false);
  assert.equal(source.includes("productionReleaseAuthorized: true"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
  assert.equal(source.includes("/workers/domains"), false);
});

test("M6 refresh-chain children fail before production interaction when dispatched on a different head", async () => {
  for (const workflow of EXACT_HEAD_CHILD_WORKFLOWS) {
    const source = await readFile(workflow, "utf8");
    for (const marker of [
      "expected_head_sha:",
      "Require exact chain head when supplied",
      "EXPECTED_HEAD_SHA: ${{ inputs.expected_head_sha }}",
      '[[ "$EXPECTED_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]',
      'test "$GITHUB_SHA" = "$EXPECTED_HEAD_SHA"',
    ]) {
      assert.equal(source.includes(marker), true, `missing exact-head child guard ${marker} in ${workflow.pathname}`);
    }

    const stepsIndex = source.indexOf("\n    steps:\n");
    const firstStepIndex = source.indexOf("\n      - name:", stepsIndex);
    assert.ok(stepsIndex >= 0 && firstStepIndex >= 0, `workflow steps are missing in ${workflow.pathname}`);
    assert.equal(
      source.startsWith("\n      - name: Require exact chain head when supplied", firstStepIndex),
      true,
      `exact-head guard must be the first executable child step in ${workflow.pathname}`,
    );
  }
});

test("M6 post-deploy smoke requires exact-head pilot activation and never depends on the organizational domain", async () => {
  const source = await readFile(SMOKE, "utf8");
  for (const marker of [
    "pilot_ingress_run_id",
    "M6 ULC Production Pilot Ingress",
    ".github/workflows/m6-ulc-production-pilot-ingress.yml",
    ".head_sha == $sha",
    "/workers/scripts/$TARGET_WORKER/subdomain",
    ".result.enabled == true and .result.previews_enabled == false",
    "/workers/subdomain",
    "TARGET_BASE_URL=https://%s.%s.workers.dev",
    "ULC_LINZ_PRODUCTION_BASE_URL=https://%s.%s.workers.dev",
    "custom organizational domain: not activated",
    "final organizational go-live: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing pilot smoke guard: ${marker}`);
  }
  assert.equal(source.includes("M6 ULC Production Domain Activation"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
  assert.equal(source.includes("/workers/domains"), false);
});

test("production protected smoke rejects an implicit or malformed auth origin", async () => {
  const source = await readFile(SMOKE_RUNNER, "utf8");
  assert.equal(source.includes("ULC_LINZ_PRODUCTION_BASE_URL"), true);
  assert.equal(source.includes("requiredHttpsOrigin"), true);
  assert.equal(source.includes('const baseURL = "https://app.ulc-linz.at"'), false);
  for (const marker of [
    'url.protocol !== "https:"',
    "url.username.length > 0",
    "url.password.length > 0",
    "url.search.length > 0",
    "url.hash.length > 0",
    "url.origin !== normalized",
  ]) {
    assert.equal(source.includes(marker), true, `missing smoke origin validation: ${marker}`);
  }
});

test("M6 smoke principal bootstrap uses the bounded native TypeScript resolver", async () => {
  const source = await readFile(SMOKE_PRINCIPAL_BOOTSTRAP, "utf8");
  assert.equal(
    source.includes("node --experimental-transform-types --import ./tooling/register-native-typescript-resolution.mjs ./tooling/bootstrap-production-smoke-principal.mjs"),
    true,
  );

  const result = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      "./tooling/register-native-typescript-resolution.mjs",
      "--input-type=module",
      "--eval",
      'await import("@appbasis/identity"); await import("@appbasis/permissions");',
    ],
    {
      cwd: fileURLToPath(ULC_LINZ_APP),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

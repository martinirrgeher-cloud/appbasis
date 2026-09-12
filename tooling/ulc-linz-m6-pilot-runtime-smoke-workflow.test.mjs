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

test("M6 production refresh chain executes exactly one separately approved canonical child step", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "name: M6 ULC Production Refresh Chain",
    "workflow_dispatch:",
    "step:",
    "approve_step:",
    "Fresh operator approval for this selected step only",
    "actions: write",
    "if: github.ref == 'refs/heads/main'",
    "timeout-minutes: 180",
    "SELECTED_STEP: ${{ inputs.step }}",
    "APPROVE_STEP: ${{ inputs.approve_step }}",
    'test "$APPROVE_STEP" = true',
    'case "$SELECTED_STEP" in',
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
    "later steps require a separate workflow dispatch and a fresh operator approval",
    "successful exact-head first-attempt prerequisite runs are reused only when they completed strictly before this parent approval dispatch was created",
  ]) {
    assert.equal(source.includes(marker), true, `missing M6 refresh-chain contract: ${marker}`);
  }

  assert.equal((source.match(/default: false/g) ?? []).length, 1);
  assert.equal(source.includes("start_at:"), false);
  assert.equal(source.includes("stop_after:"), false);
  assert.equal(source.includes("approve_runtime_refresh:"), false);
  assert.equal(source.includes("approve_private_deploy:"), false);
  assert.equal(source.includes("approve_security_smoke:"), false);
  assert.equal(source.includes("approve_lifecycle_preflight:"), false);
  assert.equal(source.includes("approve_m5_evidence:"), false);
  assert.equal(source.includes("approve_pilot_ingress:"), false);
  assert.equal(source.includes("approve_smoke_principal:"), false);
  assert.equal(source.includes("approve_post_deploy_smoke:"), false);
  assert.equal(source.includes("timeout-minutes: 30"), false);
  assert.equal(source.includes("environment: m4-dr"), false);
  assert.equal(source.includes("secrets."), false);
  assert.equal(source.includes("CLOUDFLARE_API_TOKEN"), false);
  assert.equal(source.includes("NEON_API_KEY"), false);
  assert.equal(source.includes("DATABASE_URL"), false);
});

test("M6 production refresh chain binds the one dispatch to the returned or uniquely recovered exact first-attempt child run and keeps bounded shared wait and cleanup windows", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "assert_main_head",
    ".commit.sha == $sha",
    "X-GitHub-Api-Version: 2026-03-10",
    "expected_head_sha",
    "chain_attempt_id",
    '. + {expected_head_sha:$expected_head_sha,chain_attempt_id:$chain_attempt_id}',
    "return_run_details:true",
    "workflow_run_id",
    ".run_url == $runUrl",
    "discover_attempt_run",
    ".display_title == $attempt",
    ".head_sha == $sha",
    '.head_branch == "main"',
    '.event == "workflow_dispatch"',
    '.run_attempt == 1',
    '.path == $path',
    "dispatch transport/status was ambiguous",
    "CHAIN_WORK_DEADLINE=$(( $(date +%s) + 9000 ))",
    'local wait_deadline="$CHAIN_WORK_DEADLINE"',
    'while test "$(date +%s)" -lt "$wait_deadline"',
    "Exceeded the shared wall-clock work deadline.",
    "shares one 150-minute wall-clock work budget across dispatch recovery and child waiting",
    'gh run cancel "$run_id" --repo "$GITHUB_REPOSITORY"',
    "local cleanup_deadline=$(( $(date +%s) + 1200 ))",
    'while test "$(date +%s)" -lt "$cleanup_deadline"',
    "reserved 20-minute cleanup window",
    "180-minute timeout",
    "local poll_failures=0",
    "child status poll failed ($poll_failures/6)",
    'if test "$poll_failures" -ge 6',
    "cancel_and_confirm_child 'Child status polling repeatedly failed.'",
    "cancellation status poll failed transiently; retrying bounded cleanup",
    "No automatic retry will be attempted.",
    "Fresh explicit approval is required for selected step",
    "latest_success_run",
    "rerun only this failed step with a new explicit approval",
    "failed child workflows are never retried automatically",
    "final production release: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing M6 refresh-chain safety guard: ${marker}`);
  }

  assert.equal(source.includes("for _ in $(seq 1 1800)"), false);
  assert.equal(source.includes("for _ in $(seq 1 120)"), false);
  assert.equal(source.includes("m6-chain-before-"), false);
  assert.equal(source.includes("Ambiguous child-run identity"), false);
  assert.equal(source.includes("/rerun"), false);
  assert.equal(source.includes("productionReleaseAuthorized: true"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
  assert.equal(source.includes("/workers/domains"), false);
});

test("M6 refresh-chain children fail before production interaction on a different head or a rerun attempt", async () => {
  for (const workflow of EXACT_HEAD_CHILD_WORKFLOWS) {
    const source = await readFile(workflow, "utf8");
    for (const marker of [
      "expected_head_sha:",
      "Require exact chain head when supplied",
      "EXPECTED_HEAD_SHA: ${{ inputs.expected_head_sha }}",
      'test "$GITHUB_RUN_ATTEMPT" = 1',
      "Chain-dispatched child reruns cannot reuse an earlier M6 production approval.",
      '[[ "$EXPECTED_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]',
      'test "$GITHUB_SHA" = "$EXPECTED_HEAD_SHA"',
    ]) {
      assert.equal(source.includes(marker), true, `missing exact-head/first-attempt child guard ${marker} in ${workflow.pathname}`);
    }

    const stepsIndex = source.indexOf("\n    steps:\n");
    const firstStepIndex = source.indexOf("\n      - name:", stepsIndex);
    assert.ok(stepsIndex >= 0 && firstStepIndex >= 0, `workflow steps are missing in ${workflow.pathname}`);
    assert.equal(
      source.startsWith("\n      - name: Require exact chain head when supplied", firstStepIndex),
      true,
      `exact-head/first-attempt guard must be the first executable child step in ${workflow.pathname}`,
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

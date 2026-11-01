import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ULC_PRODUCTION_RELEASE_STEPS,
  selectNextUlcProductionReleaseStep,
} from "./ulc-linz-release-assistant.mjs";

const headSha = "a".repeat(40);
const paths = {
  runtime_refresh: ".github/workflows/m6-ulc-production-runtime-refresh-config.yml",
  private_deploy: ".github/workflows/m6-ulc-private-production-refresh-deploy.yml",
  security_smoke: ".github/workflows/m5-ulc-private-security-smoke.yml",
  lifecycle_preflight: ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
  composition_gate: ".github/workflows/m6-ulc-production-composition-gate.yml",
  pilot_ingress: ".github/workflows/m6-ulc-production-pilot-ingress.yml",
  smoke_principal: ".github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml",
  post_deploy_smoke: ".github/workflows/m6-ulc-production-post-deploy-smoke.yml",
};
function child(step, index, overrides = {}) {
  const start = new Date(Date.UTC(2026, 10, 1, 12, index * 3)).toISOString();
  const end = new Date(Date.UTC(2026, 10, 1, 12, index * 3 + 1)).toISOString();
  return {
    name: "m6-chain-" + (12345 + index) + "-1-" + step,
    path: paths[step],
    head_sha: headSha,
    head_branch: "main",
    event: "workflow_dispatch",
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    created_at: start,
    updated_at: end,
    ...overrides,
  };
}
const plan = (runs) => selectNextUlcProductionReleaseStep({ headSha, runs });

test("chooses runtime refresh for a new exact main head", () => {
  assert.deepEqual(plan([]), { status: "next", step: "runtime_refresh" });
});
test("chooses private deploy after exact-head runtime refresh", () => {
  assert.deepEqual(plan([child("runtime_refresh", 0)]), { status: "next", step: "private_deploy" });
});
test("chooses security smoke after both verified private stages", () => {
  assert.deepEqual(plan([child("runtime_refresh", 0), child("private_deploy", 1)]),
    { status: "next", step: "security_smoke" });
});
test("requires all eight canonical steps before complete", () => {
  const runs = ULC_PRODUCTION_RELEASE_STEPS.map(child);
  assert.deepEqual(plan(runs), { status: "complete", step: null });
});
test("ignores unrelated workflow history and other heads", () => {
  assert.deepEqual(plan([
    child("runtime_refresh", 0, { head_sha: "b".repeat(40) }),
    { path: ".github/workflows/ci.yml", name: "CI", event: "push", head_sha: headSha, head_branch: "main" },
  ]), { status: "next", step: "runtime_refresh" });
});
test("rejects in-progress parent or child", () => {
  assert.throws(() => plan([
    { path: ".github/workflows/m6-ulc-production-refresh-chain.yml", head_sha: headSha,
      head_branch: "main", event: "workflow_dispatch", status: "in_progress" },
  ]), /running/);
  assert.throws(() => plan([child("runtime_refresh", 0, { status: "in_progress", conclusion: null })]),
    /still running/);
});
test("rejects untrusted workflow paths, reruns and out-of-sequence success", () => {
  assert.throws(() => plan([child("runtime_refresh", 0, { path: ".github/workflows/evil.yml" })]),
    /inconsistent/);
  assert.throws(() => plan([child("runtime_refresh", 0, { run_attempt: 2 })]), /rerun/);
  assert.throws(() => plan([child("private_deploy", 1)]), /out of sequence/);
  assert.throws(() => plan([child("runtime_refresh", 2), child("private_deploy", 1)]),
    /strict stage ordering/);
});
test("failed stage is retried only after all prior successful steps", () => {
  assert.deepEqual(plan([child("runtime_refresh", 0), child("private_deploy", 1, { conclusion: "failure" })]),
    { status: "next", step: "private_deploy" });
});
test("release assistant is one shared approval entry, not a bypass of canonical M6", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ulc-linz-release-assistant.yml", import.meta.url), "utf8");
  for (const marker of [
    "workflow_dispatch:",
    "approve_step:",
    "github.ref == 'refs/heads/main'",
    "GITHUB_RUN_ATTEMPT",
    "selectNextUlcProductionReleaseStep",
    "m6-ulc-production-refresh-chain.yml",
    "return_run_details:true",
    "run_attempt == 1",
  ]) {
    assert.ok(workflow.includes(marker), "missing operator/security guard: " + marker);
  }
  assert.ok(!workflow.includes("wrangler deploy"));
  assert.ok(!workflow.includes("wrangler versions"));
  assert.ok(!workflow.includes("sql "));
});

test("ULC assistant stops before composition dispatch when pinned production evidence or module readiness is blocked", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ulc-linz-release-assistant.yml", import.meta.url),
    "utf8",
  );
  const plan = workflow.indexOf("      - name: Require unchanged main and inspect approved M6 history");
  const preflight = workflow.indexOf("      - name: Verify production composition before composition-gate dispatch");
  const dispatch = workflow.indexOf("      - name: Dispatch exactly one authorized canonical M6 step");
  assert.ok(plan > 0 && preflight > plan && dispatch > preflight);
  const guard = workflow.slice(preflight, dispatch);
  assert.ok(guard.includes("steps.next.outputs.step == 'composition_gate'"));
  assert.ok(guard.includes("if ! node ./tooling/production-contract.mjs ulc-linz --require-ready; then"));
  assert.ok(guard.includes("No M6 child run was dispatched."));
  assert.ok(guard.includes("exit 1"));
  assert.ok(guard.includes('jq -r \'.modules[]\' apps/ulc-linz/appbasis.production.json'));
  assert.ok(!guard.includes("wrangler"));
  assert.ok(!guard.includes("dispatches"));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BOOTSTRAP_WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml",
  import.meta.url,
);
const SMOKE_WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-post-deploy-smoke.yml",
  import.meta.url,
);
const BOOTSTRAP_RUNNER = new URL(
  "../apps/ulc-linz/tooling/bootstrap-production-smoke-principal.mjs",
  import.meta.url,
);
const SMOKE_RUNNER = new URL(
  "../apps/ulc-linz/tooling/run-production-post-deploy-smoke.mjs",
  import.meta.url,
);

test("M6 smoke principal bootstrap is explicit, exact-head bound and completes password transition before smoke", async () => {
  const [workflow, runner] = await Promise.all([
    readFile(BOOTSTRAP_WORKFLOW, "utf8"),
    readFile(BOOTSTRAP_RUNNER, "utf8"),
  ]);
  for (const marker of [
    "BOOTSTRAP-ULC-M6-SMOKE-PRINCIPAL",
    "M5 ULC Production Admin Bootstrap",
    "M5 ULC Production Evidence",
    ".head_sha == $sha",
    "ULC_LINZ_PRODUCTION_SMOKE_BOOTSTRAP_PASSWORD",
    "ULC_LINZ_PRODUCTION_SMOKE_PASSWORD",
    "final production release: not authorized",
  ]) {
    assert.equal(workflow.includes(marker), true, `missing smoke bootstrap guard: ${marker}`);
  }
  assert.equal(runner.includes("changeRequiredPassword"), true);
  assert.equal(runner.includes('username: "ulc.m6.smoke"'), true);
  assert.equal(runner.includes('moduleKey: "countdown"'), true);
  assert.equal(runner.includes("bootstrapPassword === smokePassword"), true);
});

test("M6 post-deploy smoke stays dedicated, bounded and never performs password change or release", async () => {
  const [workflow, runner] = await Promise.all([
    readFile(SMOKE_WORKFLOW, "utf8"),
    readFile(SMOKE_RUNNER, "utf8"),
  ]);
  for (const marker of [
    "RUN-ULC-M6-PRODUCTION-SMOKE",
    "M6 ULC Production Domain Activation",
    "M6 ULC Production Smoke Principal Bootstrap",
    ".head_sha == $sha",
    "/api/health",
    "/api/auth/sign-in",
    "/api/auth/session",
    "evaluateUlcLinzM6ProductionDomainEvidence",
    "final production release: not authorized",
  ]) {
    assert.equal(workflow.includes(marker), true, `missing production smoke guard: ${marker}`);
  }
  assert.equal(workflow.includes("/api/auth/change-required-password"), false);
  assert.equal(workflow.includes("releaseAuthorized: true"), false);
  assert.equal(workflow.includes("releaseProduction"), false);

  for (const marker of [
    "assertUlcLinzModuleAccess",
    'const ALLOWED_MODULE = "countdown"',
    'const DENIED_MODULE = "__m6_smoke_unknown__"',
    "createPostgresUlcLinzSecurityEventLogger",
    "await securityEvents.flush()",
    'fachmoduleDataMutated: false',
  ]) {
    assert.equal(runner.includes(marker), true, `missing protected smoke contract: ${marker}`);
  }
  assert.equal(runner.includes("changeRequiredPassword"), false);
});

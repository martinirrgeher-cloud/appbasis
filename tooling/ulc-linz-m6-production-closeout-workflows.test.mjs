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

test("M6 smoke principal bootstrap is explicit, exact-head M5 bound and retry-safe", async () => {
  const [workflow, runner] = await Promise.all([
    readFile(BOOTSTRAP_WORKFLOW, "utf8"),
    readFile(BOOTSTRAP_RUNNER, "utf8"),
  ]);
  for (const marker of [
    "BOOTSTRAP-ULC-M6-SMOKE-PRINCIPAL",
    "M5 ULC Production Evidence",
    ".head_sha == $sha",
    "ULC_LINZ_PRODUCTION_SMOKE_BOOTSTRAP_PASSWORD",
    "ULC_LINZ_PRODUCTION_SMOKE_PASSWORD",
    "production administrator: verified read-only before provisioning",
    "final production release: not authorized",
    'test "$ULC_LINZ_PRODUCTION_ADMIN_PASSWORD" != "$ULC_LINZ_PRODUCTION_SMOKE_BOOTSTRAP_PASSWORD"',
    'test "$ULC_LINZ_PRODUCTION_ADMIN_PASSWORD" != "$ULC_LINZ_PRODUCTION_SMOKE_PASSWORD"',
  ]) {
    assert.equal(workflow.includes(marker), true, `missing smoke bootstrap guard: ${marker}`);
  }
  assert.equal(workflow.includes("M5 ULC Production Admin Bootstrap"), false);
  assert.equal(workflow.includes("admin_run_id"), false);

  for (const marker of [
    "parseUlcLinzProductionDatabaseUrl(databaseUrl)",
    "assertReusableProductionAdminEvidence",
    'admin.role !== "admin"',
    'admin.username !== PRODUCTION_ADMIN_USERNAME',
    "changeRequiredPassword",
    "SMOKE_PASSWORD_CHANGE_IDEMPOTENCY_KEY",
    "SMOKE_PASSWORD_RECOVERY_SESSION_TOKEN",
    "initial?.sessionToken ?? SMOKE_PASSWORD_RECOVERY_SESSION_TOKEN",
    'username: "ulc.m6.smoke"',
    'moduleKey: "countdown"',
    "adminPassword === bootstrapPassword",
    "adminPassword === smokePassword",
    "bootstrapPassword === smokePassword",
  ]) {
    assert.equal(runner.includes(marker), true, `missing smoke bootstrap runner guard: ${marker}`);
  }
  assert.equal(runner.includes("randomUUID"), false);
});

test("M6 post-deploy smoke stays dedicated, bounded and validates both production database targets", async () => {
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
    "/api/auth/sign-out",
    "trap cleanup EXIT",
    "evaluateUlcLinzM6ProductionDomainEvidence",
    "final production release: not authorized",
  ]) {
    assert.equal(workflow.includes(marker), true, `missing production smoke guard: ${marker}`);
  }
  assert.equal(workflow.includes("/api/auth/change-required-password"), false);
  assert.equal(workflow.includes("releaseAuthorized: true"), false);
  assert.equal(workflow.includes("releaseProduction"), false);

  for (const marker of [
    "parseUlcLinzProductionDatabaseUrl(databaseUrl)",
    "parseUlcLinzSecurityLogIngestDatabaseUrl(securityLogUrl)",
    "appTarget.user === securityTarget.user",
    "appTarget.host !== securityTarget.host",
    "appTarget.database !== securityTarget.database",
    "BetterAuthIdentityBackend",
    "await backend.endSession(smokeSessionToken)",
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

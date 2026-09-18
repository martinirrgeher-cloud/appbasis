import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
const HTTP_SMOKE_SESSION_REVOKER = new URL(
  "../apps/ulc-linz/tooling/revoke-production-http-smoke-session.mjs",
  import.meta.url,
);
const NATIVE_TYPESCRIPT_REGISTER = new URL(
  "../apps/ulc-linz/tooling/register-native-typescript-resolution.mjs",
  import.meta.url,
);
const PROTECTED_SMOKE_RUNNER = new URL(
  "../apps/ulc-linz/tooling/run-production-post-deploy-smoke.mjs",
  import.meta.url,
);
const REPOSITORY_ROOT = new URL("../", import.meta.url);

test("M6 smoke principal bootstrap is explicit, exact-head M5 bound and retry-safe", async () => {
  const [workflow, runner] = await Promise.all([
    readFile(BOOTSTRAP_WORKFLOW, "utf8"),
    readFile(BOOTSTRAP_RUNNER, "utf8"),
  ]);
  for (const marker of [
    "BOOTSTRAP-ULC-M6-SMOKE-PRINCIPAL",
    ".github/workflows/m5-ulc-production-evidence.yml",
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

test("M6 post-deploy smoke stays dedicated, pilot-ingress bound and validates both production database targets", async () => {
  const [workflow, runner, httpSessionRevoker] = await Promise.all([
    readFile(SMOKE_WORKFLOW, "utf8"),
    readFile(SMOKE_RUNNER, "utf8"),
    readFile(HTTP_SMOKE_SESSION_REVOKER, "utf8"),
  ]);
  for (const marker of [
    "RUN-ULC-M6-PRODUCTION-SMOKE",
    ".github/workflows/m6-ulc-production-pilot-ingress.yml",
    "pilot_ingress_run_id",
    ".github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml",
    ".head_sha == $sha",
    "workers.dev",
    "previews_enabled == false",
    "/api/health",
    "/api/auth/sign-in",
    "/api/auth/session",
    "revoke-production-http-smoke-session.mjs",
    "node --experimental-transform-types --import ./tooling/register-native-typescript-resolution.mjs ./tooling/run-production-post-deploy-smoke.mjs",
    "ULC_LINZ_PRODUCTION_HTTP_SMOKE_COOKIE_FILE",
    "trap cleanup EXIT",
    "custom organizational domain: not activated",
    "final organizational go-live: not authorized",
  ]) {
    assert.equal(workflow.includes(marker), true, `missing production smoke guard: ${marker}`);
  }
  assert.equal(workflow.includes("M6 ULC Production Domain Activation"), false);
  assert.equal(workflow.includes("evaluateUlcLinzM6ProductionDomainEvidence"), false);
  assert.equal(workflow.includes("$TARGET_BASE_URL/api/auth/sign-out"), false);
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

  for (const marker of [
    "parseUlcLinzProductionDatabaseUrl(databaseUrl)",
    "BetterAuthIdentityBackend",
    "await backend.endSession(sessionToken)",
    "const SESSION_COOKIE_NAMES = new Set([",
    '"better-auth.session_token"',
    '"__Secure-better-auth.session_token"',
    "SESSION_COOKIE_NAMES.has(fields[5])",
    "return \`${name}=${value}\`",
    'const HTTP_ONLY_PREFIX = "#HttpOnly_"',
    "line.startsWith(HTTP_ONLY_PREFIX)",
    "Expected exactly one production HTTP smoke session cookie.",
  ]) {
    assert.equal(
      httpSessionRevoker.includes(marker),
      true,
      `missing protected HTTP smoke cleanup guard: ${marker}`,
    );
  }
});


test("M6 protected smoke native loader resolves the complete runtime import graph", () => {
  const stdout = execFileSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      fileURLToPath(NATIVE_TYPESCRIPT_REGISTER),
      "--input-type=module",
      "--eval",
      `const module = await import(${JSON.stringify(PROTECTED_SMOKE_RUNNER.href)}); process.stdout.write(typeof module.runUlcLinzProductionPostDeploySmoke);`,
    ],
    {
      cwd: fileURLToPath(REPOSITORY_ROOT),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );
  assert.equal(stdout, "function");
});

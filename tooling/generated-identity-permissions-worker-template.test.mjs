import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

const PRODUCTION_BOOTSTRAP_CONFIG_PATH = "wrangler.production.bootstrap.jsonc";
const ulcInput = {
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: ["countdown"],
  platformServices: ["identity", "permissions"],
};

test("generates a deployable Worker for the real identity+permissions ULC composition", () => {
  const template = createIdentityRuntimeTemplate(ulcInput);
  const paths = template.files.map((entry) => entry.path);

  assert.deepEqual(paths, [
    "package.json",
    "test/app.test.ts",
    "test/worker.test.ts",
    "tsconfig.json",
    "vitest.config.ts",
    "worker/app.ts",
    "worker/index.ts",
    "worker/postgres.ts",
    "migrations/0000_ulc_linz_lifecycle_scope.sql",
    "migrations/0001_ulc_linz_retention_deletion_claim.sql",
    "worker/security-events.ts",
    "worker/security-events-postgres.ts",
    "migrations/0002_ulc_linz_security_event_log.sql",
    "migrations/0003_ulc_linz_security_event_access.sql",
    "worker/role-data-scope.json",
    "worker/countdown-access.ts",
    "worker/countdown-membership-postgres.ts",
    "test/countdown-access.test.ts",
    "test/countdown-membership-postgres.test.ts",
    PRODUCTION_BOOTSTRAP_CONFIG_PATH,
  ]);

  const packageJson = JSON.parse(content(template, "package.json"));
  const app = content(template, "worker/app.ts");
  const worker = content(template, "worker/index.ts");
  const postgres = content(template, "worker/postgres.ts");
  const securityEvents = content(template, "worker/security-events.ts");

  assert.equal(packageJson.dependencies["@appbasis/countdown"], "workspace:*");
  assert.equal(packageJson.dependencies["@appbasis/database"], "workspace:*");
  assert.match(app, /securityEvents\?: UlcLinzSecurityEventLogger/);
  assert.match(app, /identityResponseWithSecurityLogging/);
  assert.match(app, /recordUlcLinzSecurityEvent/);
  assert.match(securityEvents, /identity\.request\.denied/);
  assert.match(securityEvents, /authorization\.denied/);
  assert.match(securityEvents, /safeLogIdentifier/);
  assert.match(worker, /createGeneratedPostgresApplicationRuntime/);
  assert.match(worker, /HYPERDRIVE/);
  assert.match(worker, /SECURITY_LOG_HYPERDRIVE/);
  assert.match(worker, /APPBASIS_BASE_URL/);
  assert.match(worker, /BETTER_AUTH_SECRET/);
  assert.match(worker, /RUNTIME_NOT_CONFIGURED/);
  assert.match(worker, /permissions: runtime\.permissions/);
  assert.match(worker, /countdownMemberships: runtime\.countdownMemberships/);
  assert.match(worker, /securityEvents: runtime\.securityEvents/);
  assert.match(worker, /SECURITY_EVENT_FLUSH_ERROR/);
  assert.doesNotMatch(worker, /interface\s+.*Env/);
  assert.match(app, /\/api\/modules\/countdown\/access/);
  assert.match(app, /assertUlcLinzCountdownAccess/);
  assert.doesNotMatch(worker, /tasks/i);

  assert.match(postgres, /createPostgresIdentityApplicationRuntime/);
  assert.match(postgres, /@appbasis\/database\/postgres-runtime/);
  assert.match(postgres, /PostgresPermissionStore/);
  assert.match(postgres, /permissions: PermissionStore/);
  assert.match(postgres, /countdownMemberships: UlcLinzCountdownMembershipResolver/);
  assert.match(postgres, /PostgresUlcLinzCountdownMembershipResolver/);
  assert.match(postgres, /createPostgresUlcLinzSecurityEventLogger/);
  assert.match(postgres, /securityLogConnectionString/);
  assert.doesNotMatch(postgres, /@appbasis\/tasks/);
  assert.doesNotMatch(postgres, /PostgresTaskRepository/);
});

test("keeps the generic identity+permissions runtime when countdown is selected", () => {
  const template = createIdentityRuntimeTemplate({
    appId: "countdown-test",
    displayName: "Countdown Test",
    modules: ["countdown"],
    platformServices: ["identity", "permissions"],
  });
  const paths = template.files.map((entry) => entry.path);
  const packageJson = JSON.parse(content(template, "package.json"));
  const appTest = content(template, "test/app.test.ts");
  const worker = content(template, "worker/index.ts");
  const postgres = content(template, "worker/postgres.ts");

  assert.equal(paths.includes("test/worker.test.ts"), true);
  assert.equal(paths.includes("worker/index.ts"), true);
  assert.equal(paths.includes("worker/postgres.ts"), true);
  assert.equal(paths.includes(PRODUCTION_BOOTSTRAP_CONFIG_PATH), true);

  assert.deepEqual(packageJson.dependencies, {
    "@appbasis/countdown": "workspace:*",
    "@appbasis/identity": "workspace:*",
    "@appbasis/permissions": "workspace:*",
    hono: "4.13.1",
  });
  assert.match(appTest, /COUNTDOWN_CAPABILITIES/);
  assert.match(appTest, /countdown:view/);
  assert.match(worker, /createGeneratedPostgresApplicationRuntime/);
  assert.match(postgres, /PostgresPermissionStore/);
  assert.doesNotMatch(postgres, /PostgresTaskRepository/);
  assert.doesNotMatch(worker, /tasks/i);

  const bootstrap = JSON.parse(content(template, PRODUCTION_BOOTSTRAP_CONFIG_PATH));
  assert.equal(bootstrap.main, "./worker/index.ts");
  assert.equal(bootstrap.workers_dev, false);
  assert.equal(bootstrap.preview_urls, false);
  assert.equal("hyperdrive" in bootstrap, false);
  assert.equal("secrets" in bootstrap, false);
});

test("keeps identity-only and guarded tasks generator contracts unchanged", () => {
  const identityOnly = createIdentityRuntimeTemplate({
    appId: "checklist",
    displayName: "Checklist",
  });
  assert.deepEqual(
    identityOnly.files.map((entry) => entry.path),
    [
      "package.json",
      "test/app.test.ts",
      "tsconfig.json",
      "vitest.config.ts",
      "worker/app.ts",
    ],
  );
  assert.equal(
    identityOnly.files.some((entry) => entry.path === PRODUCTION_BOOTSTRAP_CONFIG_PATH),
    false,
  );

  const guardedTasks = createIdentityRuntimeTemplate({
    appId: "tasks-minimal",
    displayName: "AppBasis Tasks Minimal",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  });
  assert.equal(
    content(guardedTasks, "worker/index.ts"),
    readFileSync(
      new URL("../apps/tasks-minimal/worker/index.ts", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    content(guardedTasks, "worker/postgres.ts"),
    readFileSync(
      new URL("../apps/tasks-minimal/worker/postgres.ts", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    guardedTasks.files.some((entry) => entry.path === PRODUCTION_BOOTSTRAP_CONFIG_PATH),
    true,
  );
});

test("checked ULC generated deployment files stay byte-identical to createAppSkeleton's canonical runtime generator", () => {
  const template = createIdentityRuntimeTemplate(ulcInput);
  for (const path of [
    "worker/index.ts",
    "worker/postgres.ts",
    "worker/role-data-scope.json",
    "worker/countdown-access.ts",
    "worker/countdown-membership-postgres.ts",
    "worker/security-events-postgres.ts",
    "migrations/0000_ulc_linz_lifecycle_scope.sql",
    "migrations/0001_ulc_linz_retention_deletion_claim.sql",
    "migrations/0002_ulc_linz_security_event_log.sql",
    "migrations/0003_ulc_linz_security_event_access.sql",
    "test/worker.test.ts",
    "test/countdown-access.test.ts",
    "test/countdown-membership-postgres.test.ts",
  ]) {
    assert.equal(
      content(template, path),
      readFileSync(new URL(`../apps/ulc-linz/${path}`, import.meta.url), "utf8"),
      `Generated ULC file drifted: ${path}`,
    );
  }
});

function content(template, path) {
  const entry = template.files.find((candidate) => candidate.path === path);
  assert.notEqual(entry, undefined, `Missing generated file: ${path}`);
  return entry.content;
}

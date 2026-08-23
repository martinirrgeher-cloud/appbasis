import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

const PRODUCTION_BOOTSTRAP_CONFIG_PATH = "wrangler.production.bootstrap.jsonc";
const ulcInput = {
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: [],
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
    "worker/security-events-postgres.ts",
    "migrations/0002_ulc_linz_security_event_log.sql",
    PRODUCTION_BOOTSTRAP_CONFIG_PATH,
  ]);

  const worker = content(template, "worker/index.ts");
  const postgres = content(template, "worker/postgres.ts");

  assert.match(worker, /createGeneratedPostgresApplicationRuntime/);
  assert.match(worker, /HYPERDRIVE/);
  assert.match(worker, /APPBASIS_BASE_URL/);
  assert.match(worker, /BETTER_AUTH_SECRET/);
  assert.match(worker, /RUNTIME_NOT_CONFIGURED/);
  assert.match(worker, /securityEvents: runtime\.securityEvents/);
  assert.match(worker, /SECURITY_EVENT_FLUSH_ERROR/);
  assert.doesNotMatch(worker, /interface\s+.*Env/);
  assert.doesNotMatch(worker, /tasks/i);

  assert.match(postgres, /createPostgresIdentityApplicationRuntime/);
  assert.match(postgres, /PostgresPermissionStore/);
  assert.match(postgres, /permissions: PermissionStore/);
  assert.match(postgres, /createPostgresUlcLinzSecurityEventLogger/);
  assert.doesNotMatch(postgres, /@appbasis\/tasks/);
  assert.doesNotMatch(postgres, /PostgresTaskRepository/);
  assert.doesNotMatch(postgres, /@appbasis\/database/);
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

test("checked ULC deployment files stay byte-identical to createAppSkeleton's canonical runtime generator", () => {
  const template = createIdentityRuntimeTemplate(ulcInput);
  for (const path of [
    "worker/index.ts",
    "worker/postgres.ts",
    "worker/security-events-postgres.ts",
    "migrations/0002_ulc_linz_security_event_log.sql",
    "test/worker.test.ts",
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

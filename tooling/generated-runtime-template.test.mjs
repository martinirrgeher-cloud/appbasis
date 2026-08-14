import assert from "node:assert/strict";
import test from "node:test";

import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

const input = {
  appId: "checklist",
  displayName: "Checklist",
};

test("renders the deterministic runnable identity runtime", () => {
  const first = createIdentityRuntimeTemplate(input);
  const second = createIdentityRuntimeTemplate(input);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.files), true);
  assert.deepEqual(
    first.files.map((entry) => entry.path),
    [
      "package.json",
      "test/app.test.ts",
      "tsconfig.json",
      "vitest.config.ts",
      "worker/app.ts",
    ],
  );
});

test("uses a collision-resistant app package namespace and shared identity HTTP adapter", () => {
  const template = createIdentityRuntimeTemplate(input);
  const worker = content(template, "worker/app.ts");
  const packageJson = JSON.parse(content(template, "package.json"));

  assert.equal(packageJson.name, "@appbasis/app-checklist");
  assert.match(worker, /from "@appbasis\/identity\/http"/);
  assert.match(worker, /createIdentityHttpHandlers/);
  assert.match(worker, /\/api\/auth\/sign-in/);
  assert.match(worker, /\/api\/auth\/session/);
  assert.match(worker, /\/api\/auth\/change-required-password/);
  assert.doesNotMatch(worker, /reference/i);
  assert.doesNotMatch(worker, /@appbasis\/permissions/);
  assert.doesNotMatch(worker, /tasks/);

  assert.deepEqual(packageJson.dependencies, {
    "@appbasis/identity": "workspace:*",
    hono: "4.13.1",
  });
});

test("wires the declared tasks module through its public workspace contract without exposing business routes", () => {
  const template = createIdentityRuntimeTemplate({ ...input, modules: ["tasks"] });
  const worker = content(template, "worker/app.ts");
  const packageJson = JSON.parse(content(template, "package.json"));
  const generatedTest = content(template, "test/app.test.ts");

  assert.deepEqual(packageJson.dependencies, {
    "@appbasis/identity": "workspace:*",
    "@appbasis/tasks": "workspace:*",
    hono: "4.13.1",
  });
  assert.match(generatedTest, /from "@appbasis\/tasks"/);
  assert.match(generatedTest, /InMemoryTaskRepository/);
  assert.match(generatedTest, /status: "completed"/);
  assert.doesNotMatch(worker, /\/api\/tasks/);
  assert.doesNotMatch(worker, /@appbasis\/permissions/);
  assert.equal(template.files.some((entry) => entry.path === "worker/postgres.ts"), false);
});

test("generates tasks HTTP routes and PostgreSQL infrastructure only with explicit permissions composition", () => {
  const template = createIdentityRuntimeTemplate({
    ...input,
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  });
  const worker = content(template, "worker/app.ts");
  const postgresRuntime = content(template, "worker/postgres.ts");
  const postgresTest = content(template, "test/app.postgres.e2e.ts");
  const packageJson = JSON.parse(content(template, "package.json"));
  const generatedTest = content(template, "test/app.test.ts");

  assert.deepEqual(packageJson.dependencies, {
    "@appbasis/database": "workspace:*",
    "@appbasis/identity": "workspace:*",
    "@appbasis/permissions": "workspace:*",
    "@appbasis/tasks": "workspace:*",
    hono: "4.13.1",
  });
  assert.equal(packageJson.scripts.test, "vitest run ./test/app.test.ts");
  assert.equal(
    packageJson.scripts["test:postgres"],
    "vitest run --config vitest.postgres.config.ts",
  );

  assert.match(worker, /from "@appbasis\/permissions"/);
  assert.match(worker, /TASK_CAPABILITIES/);
  assert.match(worker, /capabilityId\(TASK_CAPABILITIES\.manage\)/);
  assert.match(worker, /assertIdentityActionAllowed/);
  assert.match(worker, /assertPermission/);
  assert.match(worker, /app\.get\("\/api\/tasks"/);
  assert.match(worker, /app\.post\("\/api\/tasks"/);
  assert.match(worker, /app\.post\("\/api\/tasks\/:id\/toggle"/);

  assert.match(generatedTest, /InMemoryPermissionStore/);
  assert.match(generatedTest, /unauthenticated\.status\)\.toBe\(401\)/);
  assert.match(generatedTest, /denied\.status\)\.toBe\(403\)/);
  assert.match(generatedTest, /Generated HTTP task/);

  assert.match(postgresRuntime, /from "@appbasis\/database\/postgres-runtime"/);
  assert.match(postgresRuntime, /PostgresTaskRepository/);
  assert.match(postgresRuntime, /createGeneratedPostgresRuntime/);
  assert.match(postgresTest, /Persistent generated task/);
  assert.match(postgresTest, /DROP TABLE IF EXISTS appbasis_task CASCADE/);
  assert.match(postgresTest, /DATABASE_URL/);
  assert.deepEqual(
    template.files.map((entry) => entry.path),
    [
      "package.json",
      "test/app.test.ts",
      "test/app.postgres.e2e.ts",
      "tsconfig.json",
      "vitest.config.ts",
      "vitest.postgres.config.ts",
      "worker/app.ts",
      "worker/postgres.ts",
    ],
  );
});

test("generates a self-test that exercises the second consumer contract", () => {
  const generatedTest = content(
    createIdentityRuntimeTemplate(input),
    "test/app.test.ts",
  );

  assert.match(generatedTest, /createGeneratedApp/);
  assert.match(generatedTest, /\/api\/health/);
  assert.match(generatedTest, /\/api\/auth\/sign-in/);
  assert.match(generatedTest, /appbasis\.session=test-token/);
});

test("fails closed on invalid or unsupported runtime inputs", () => {
  assert.throws(
    () => createIdentityRuntimeTemplate({ ...input, appId: "Not Valid" }),
    /appId must match/,
  );
  assert.throws(
    () => createIdentityRuntimeTemplate({ ...input, displayName: " Checklist" }),
    /displayName must be a non-empty trimmed string/,
  );
  assert.throws(
    () => createIdentityRuntimeTemplate({ ...input, modules: ["future"] }),
    /does not support module future/,
  );
  assert.throws(
    () =>
      createIdentityRuntimeTemplate({
        ...input,
        platformServices: ["identity", "notifications"],
      }),
    /does not support platform service notifications/,
  );
  assert.throws(
    () =>
      createIdentityRuntimeTemplate({
        ...input,
        platformServices: ["identity", "identity"],
      }),
    /platform service is duplicated: identity/,
  );
  assert.throws(
    () =>
      createIdentityRuntimeTemplate({
        ...input,
        platformServices: ["permissions"],
      }),
    /requires the identity platform service/,
  );
});

function content(template, path) {
  const entry = template.files.find((candidate) => candidate.path === path);
  assert.notEqual(entry, undefined, `Missing generated file: ${path}`);
  return entry.content;
}

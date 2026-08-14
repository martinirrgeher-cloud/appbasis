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

test("fails closed on invalid runtime identity", () => {
  assert.throws(
    () => createIdentityRuntimeTemplate({ ...input, appId: "Not Valid" }),
    /appId must match/,
  );
  assert.throws(
    () => createIdentityRuntimeTemplate({ ...input, displayName: " Checklist" }),
    /displayName must be a non-empty trimmed string/,
  );
});

function content(template, path) {
  const entry = template.files.find((candidate) => candidate.path === path);
  assert.notEqual(entry, undefined, `Missing generated file: ${path}`);
  return entry.content;
}

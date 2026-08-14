import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";
import { renderGeneratedPreviewWranglerConfig } from "./generated-preview-deploy-config.mjs";

const generatedInput = {
  appId: "tasks-minimal",
  displayName: "AppBasis Tasks Minimal",
  modules: ["tasks"],
  platformServices: ["identity", "permissions"],
};

test("generated guarded tasks runtime includes a deployable Worker entrypoint", () => {
  const template = createIdentityRuntimeTemplate(generatedInput);
  const packageJson = JSON.parse(content(template, "package.json"));
  const workerIndex = content(template, "worker/index.ts");
  const workerTest = content(template, "test/worker.test.ts");
  const deployment = renderGeneratedPreviewWranglerConfig({
    appId: generatedInput.appId,
    hyperdriveId: "provider-id",
    baseURL: "https://tasks-preview.example.test",
  });

  assert.equal(deployment.main, "./worker/index.ts");
  assert.equal(packageJson.scripts.test, "vitest run ./test/app.test.ts ./test/worker.test.ts");
  assert.match(workerIndex, /createGeneratedPostgresApplicationRuntime/);
  assert.match(workerIndex, /HYPERDRIVE/);
  assert.match(workerIndex, /APPBASIS_BASE_URL/);
  assert.match(workerIndex, /BETTER_AUTH_SECRET/);
  assert.match(workerIndex, /RUNTIME_NOT_CONFIGURED/);
  assert.match(workerIndex, /env: unknown/);
  assert.doesNotMatch(workerIndex, /interface\s+.*Env/);
  assert.match(workerTest, /keeps liveness available without database or secret bindings/);
  assert.match(workerTest, /always closes it/);
});

test("checked Worker entrypoint output remains byte-identical to the generator", () => {
  const template = createIdentityRuntimeTemplate(generatedInput);

  assert.equal(
    content(template, "worker/index.ts"),
    readFileSync(
      new URL("../apps/tasks-minimal/worker/index.ts", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    content(template, "test/worker.test.ts"),
    readFileSync(
      new URL("../apps/tasks-minimal/test/worker.test.ts", import.meta.url),
      "utf8",
    ),
  );
});

function content(template, path) {
  const entry = template.files.find((candidate) => candidate.path === path);
  assert.notEqual(entry, undefined, `Missing generated file: ${path}`);
  return entry.content;
}

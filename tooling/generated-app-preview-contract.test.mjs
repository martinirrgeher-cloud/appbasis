import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";
import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "appbasis-generic-preview-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, "apps", "demo", "worker"), { recursive: true });
  await mkdir(path.join(root, "modules", "tasks"), { recursive: true });

  const definition = {
    schemaVersion: 2,
    appId: "demo",
    displayName: "Demo App",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  };
  await writeFile(
    path.join(root, "apps", "demo", "appbasis.app.json"),
    JSON.stringify(definition, null, 2),
  );
  await writeFile(
    path.join(root, "apps", "demo", "appbasis.theme.json"),
    JSON.stringify({
      schemaVersion: 1,
      brandMark: "D",
      accentColor: "#2563eb",
    }),
  );
  await writeFile(
    path.join(root, "apps", "demo", "appbasis.database.json"),
    JSON.stringify(createGeneratedDatabaseManifest(definition), null, 2),
  );
  await writeFile(
    path.join(root, "apps", "demo", "package.json"),
    JSON.stringify({ name: "@appbasis/app-demo" }),
  );
  await writeFile(
    path.join(root, "apps", "demo", "worker", "index.ts"),
    "export function createGeneratedWorker() {}\n",
  );
  await writeFile(
    path.join(root, "apps", "demo", "worker", "ui.ts"),
    "export function generatedUiResponse() {}\n",
  );
  return root;
}

test("loads only a complete generated app preview contract", async (t) => {
  const root = await createFixture(t);
  const contract = await loadGeneratedAppPreviewContract(root, "demo");

  assert.equal(contract.definition.appId, "demo");
  assert.equal(contract.packageName, "@appbasis/app-demo");
  assert.equal(contract.theme.brandMark, "D");
  assert.equal(contract.target.environment, "generated-preview-demo");
  assert.equal(contract.target.workerName, "appbasis-demo");
  assert.equal(contract.target.database, "appbasis_demo_preview");
});

test("fails closed when required generated preview artifacts are missing", async (t) => {
  const root = await createFixture(t);
  await rm(path.join(root, "apps", "demo", "worker", "ui.ts"));

  await assert.rejects(
    loadGeneratedAppPreviewContract(root, "demo"),
    /Generated preview web UI is missing or empty/,
  );
});

test("fails closed for an app without identity runtime composition", async (t) => {
  const root = await createFixture(t);
  const definition = {
    schemaVersion: 2,
    appId: "demo",
    displayName: "Demo App",
    modules: ["tasks"],
    platformServices: [],
  };
  await writeFile(
    path.join(root, "apps", "demo", "appbasis.app.json"),
    JSON.stringify(definition, null, 2),
  );

  await assert.rejects(
    loadGeneratedAppPreviewContract(root, "demo"),
    /requires the identity platform service/,
  );
});

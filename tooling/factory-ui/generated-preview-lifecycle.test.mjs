import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import { deriveGeneratedPreviewLifecycle } from "./generated-preview-lifecycle.mjs";

async function createPreviewFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-factory-preview-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const appRoot = join(root, "apps", "checklist");
  await mkdir(join(appRoot, "worker"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });

  const definition = {
    schemaVersion: 2,
    appId: "checklist",
    displayName: "Checklist",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  };

  await writeFile(
    join(appRoot, "appbasis.app.json"),
    `${JSON.stringify(definition, null, 2)}\n`,
  );
  await writeFile(
    join(appRoot, "appbasis.theme.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        brandMark: "CL",
        accentColor: "#0f766e",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: "@appbasis/app-checklist" }, null, 2)}\n`,
  );
  await writeFile(
    join(appRoot, "appbasis.database.json"),
    `${JSON.stringify(createGeneratedDatabaseManifest(definition), null, 2)}\n`,
  );
  await writeFile(
    join(appRoot, "worker", "index.ts"),
    "export function createGeneratedWorker() {}\n",
  );
  await writeFile(
    join(appRoot, "worker", "ui.ts"),
    "export function generatedUiResponse() {}\n",
  );
  await writeFile(
    join(appRoot, "worker", "preview.ts"),
    'export function createGeneratedPreviewWorker() {}\nconst path = "/api/health/database";\n',
  );

  return { root, definition };
}

test("Factory exposes the exact generic preview workflow for a canonical generated app", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition);

  assert.equal(lifecycle.status, "workflow-ready");
  assert.equal(lifecycle.nextOperation, "hyperdrive");
  assert.equal(lifecycle.requiresExplicitApply, true);
  assert.equal(
    lifecycle.workflowPath,
    ".github/workflows/generated-app-preview-lifecycle.yml",
  );
  assert.equal(
    lifecycle.workflowUrl,
    "https://github.com/martinirrgeher-cloud/appbasis/actions/workflows/generated-app-preview-lifecycle.yml",
  );
  assert.deepEqual(
    lifecycle.operations.map((operation) => operation.id),
    ["hyperdrive", "migrate", "bootstrap", "deploy"],
  );
  assert.deepEqual(lifecycle.target, {
    environment: "generated-preview-checklist",
    workerName: "appbasis-checklist",
    hyperdriveName: "appbasis-checklist-preview",
    database: "appbasis_checklist_preview",
  });
});

test("Factory keeps generic preview actions closed when the canonical preview wrapper is absent", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  await rm(join(root, "apps", "checklist", "worker", "preview.ts"));

  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition);

  assert.equal(lifecycle.status, "not-eligible");
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.target, null);
  assert.equal(lifecycle.requiresExplicitApply, true);
  assert.deepEqual(
    lifecycle.operations.map((operation) => operation.id),
    ["hyperdrive", "migrate", "bootstrap", "deploy"],
  );
});

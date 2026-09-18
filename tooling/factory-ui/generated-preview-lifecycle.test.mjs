import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import { deriveGeneratedPreviewLifecycle } from "./generated-preview-lifecycle.mjs";
import {
  GENERATED_PREVIEW_PUBLICATION_FILES,
  GENERATED_PREVIEW_ROOT_PUBLICATION_FILES,
  gitBlobSha,
} from "./generated-preview-publication.mjs";

async function createPreviewFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-factory-preview-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const appRoot = join(root, "apps", "checklist");
  await mkdir(join(appRoot, "worker"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

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

async function publicationFetch(root) {
  const tree = [];
  for (const relativePath of GENERATED_PREVIEW_PUBLICATION_FILES) {
    const source = await readFile(
      join(root, "apps", "checklist", ...relativePath.split("/")),
    );
    tree.push({
      path: `apps/checklist/${relativePath}`,
      type: "blob",
      sha: gitBlobSha(source),
    });
  }
  for (const relativePath of GENERATED_PREVIEW_ROOT_PUBLICATION_FILES) {
    const source = await readFile(join(root, relativePath));
    tree.push({
      path: relativePath,
      type: "blob",
      sha: gitBlobSha(source),
    });
  }
  return async () =>
    Response.json({
      truncated: false,
      tree,
    });
}

test("Factory exposes the exact generic preview workflow for a canonical generated app", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
  });

  assert.equal(lifecycle.status, "workflow-ready");
  assert.equal(lifecycle.publishedOnMain, true);
  assert.equal(lifecycle.workflowRef, "main");
  assert.equal(lifecycle.initialOperation, "hyperdrive");
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.progressEvidence, "not-observed");
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

test("Factory keeps a local generated app pending until its exact preview files are published", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: async () =>
      Response.json({ message: "not published" }, { status: 404 }),
  });

  assert.equal(lifecycle.status, "local-contract-ready");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.workflowRef, null);
  assert.equal(lifecycle.initialOperation, "hyperdrive");
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.progressEvidence, "not-observed");
  assert.notEqual(lifecycle.target, null);
});

test("Factory keeps generic preview actions closed when the canonical preview wrapper is absent", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  await rm(join(root, "apps", "checklist", "worker", "preview.ts"));

  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition);

  assert.equal(lifecycle.status, "not-eligible");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.initialOperation, null);
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.target, null);
  assert.equal(lifecycle.requiresExplicitApply, true);
  assert.deepEqual(
    lifecycle.operations.map((operation) => operation.id),
    ["hyperdrive", "migrate", "bootstrap", "deploy"],
  );
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadFactorySnapshot } from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("factory snapshot reports repository preview prerequisites without enabling deployment", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "appbasis-factory-preview-readiness-"));
  await mkdir(join(fixtureRoot, "apps"), { recursive: true });
  await mkdir(join(fixtureRoot, "modules", "tasks"), { recursive: true });

  try {
    await writeAppDefinition(fixtureRoot, {
      schemaVersion: 2,
      appId: "ready-app",
      displayName: "Ready App",
      modules: ["tasks"],
      platformServices: ["identity"],
    });
    await mkdir(join(fixtureRoot, "apps", "ready-app", "worker"), {
      recursive: true,
    });
    await writeFile(
      join(fixtureRoot, "apps", "ready-app", "worker", "index.ts"),
      "export default {};\n",
      "utf8",
    );
    await writeFile(
      join(fixtureRoot, "apps", "ready-app", "package.json"),
      "{}\n",
      "utf8",
    );
    await writeFile(
      join(fixtureRoot, "apps", "ready-app", "appbasis.database.json"),
      "{}\n",
      "utf8",
    );

    await writeAppDefinition(fixtureRoot, {
      schemaVersion: 2,
      appId: "missing-worker",
      displayName: "Missing Worker",
      modules: ["tasks"],
      platformServices: ["identity"],
    });
    await writeFile(
      join(fixtureRoot, "apps", "missing-worker", "package.json"),
      "{}\n",
      "utf8",
    );
    await writeFile(
      join(fixtureRoot, "apps", "missing-worker", "appbasis.database.json"),
      "{}\n",
      "utf8",
    );

    await writeAppDefinition(fixtureRoot, {
      schemaVersion: 2,
      appId: "definition-only",
      displayName: "Definition Only",
      modules: [],
      platformServices: [],
    });

    const snapshot = await loadFactorySnapshot(fixtureRoot);
    const ready = snapshot.apps.find((app) => app.appId === "ready-app");
    const missingWorker = snapshot.apps.find(
      (app) => app.appId === "missing-worker",
    );
    const definitionOnly = snapshot.apps.find(
      (app) => app.appId === "definition-only",
    );

    assert.deepEqual(ready?.previewReadiness, {
      status: "repository-ready",
      workerEntrypointPresent: true,
      packageManifestPresent: true,
      databaseManifestRequired: true,
      databaseManifestPresent: true,
    });
    assert.deepEqual(missingWorker?.previewReadiness, {
      status: "repository-incomplete",
      workerEntrypointPresent: false,
      packageManifestPresent: true,
      databaseManifestRequired: true,
      databaseManifestPresent: true,
    });
    assert.deepEqual(definitionOnly?.previewReadiness, {
      status: "repository-incomplete",
      workerEntrypointPresent: false,
      packageManifestPresent: false,
      databaseManifestRequired: false,
      databaseManifestPresent: false,
    });
    assert.equal(snapshot.capabilities.deployPreview, false);
    assert.equal(snapshot.capabilities.releaseProduction, false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("factory UI surfaces repository readiness while keeping provider state and preview actions separate", async () => {
  const appScript = await readFile(
    join(repositoryRoot, "tooling", "factory-ui", "app.js"),
    "utf8",
  );

  assert.match(appScript, /previewReadinessLabel\(app\.previewReadiness\)/);
  assert.match(appScript, /renderPreviewReadiness\(app\.previewReadiness\)/);
  assert.match(appScript, /Repository-Voraussetzungen erfüllt/);
  assert.match(appScript, /Provider-, Secret- und Preview-Datenbank-Status/);
  assert.match(appScript, /Preview bleibt gesperrt/);
  assert.doesNotMatch(appScript, /\/api\/factory\/preview/);
});

async function writeAppDefinition(root, definition) {
  const appDirectory = join(root, "apps", definition.appId);
  await mkdir(appDirectory, { recursive: true });
  await writeFile(
    join(appDirectory, "appbasis.app.json"),
    `${JSON.stringify(definition, null, 2)}\n`,
    "utf8",
  );
}

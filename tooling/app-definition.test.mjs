import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseAppDefinition, verifyAppDefinitions } from "./app-definition.mjs";

const validDefinition = {
  schemaVersion: 2,
  appId: "reference",
  displayName: "AppBasis Reference",
  modules: ["tasks"],
  platformServices: ["identity"],
};

test("accepts the versioned app definition with explicit platform services", () => {
  const definition = parseAppDefinition(validDefinition, {
    directoryName: "reference",
  });

  assert.deepEqual(definition, validDefinition);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.modules), true);
  assert.equal(Object.isFrozen(definition.platformServices), true);

  assert.deepEqual(
    parseAppDefinition({
      ...validDefinition,
      platformServices: ["identity", "permissions"],
    }),
    {
      ...validDefinition,
      platformServices: ["identity", "permissions"],
    },
  );
});

test("fails closed on unknown fields, old schemas and structural drift", () => {
  assert.throws(
    () => parseAppDefinition({ ...validDefinition, deployment: {} }),
    /Unknown app definition field: deployment/,
  );
  assert.throws(
    () => parseAppDefinition({ ...validDefinition, schemaVersion: 1 }),
    /schemaVersion must be 2/,
  );
  assert.throws(
    () =>
      parseAppDefinition(validDefinition, {
        directoryName: "different-app",
      }),
    /must match apps\/different-app/,
  );
  assert.throws(
    () =>
      parseAppDefinition({
        ...validDefinition,
        modules: ["tasks", "tasks"],
      }),
    /modules must not contain duplicates/,
  );
  assert.throws(
    () =>
      parseAppDefinition({
        ...validDefinition,
        platformServices: ["identity", "identity"],
      }),
    /platformServices must not contain duplicates/,
  );
});

test("supports only proven platform services", () => {
  assert.throws(
    () =>
      parseAppDefinition({
        ...validDefinition,
        platformServices: ["notifications"],
      }),
    /references unsupported platform service notifications/,
  );
  assert.throws(
    () => {
      const { platformServices: _platformServices, ...missingPlatformServices } =
        validDefinition;
      return parseAppDefinition(missingPlatformServices);
    },
    /platformServices must be an array/,
  );
});

test("verifies app directories and referenced module directories", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-app-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await writeTasksModule(root);
  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify(validDefinition, null, 2)}\n`,
  );

  const definitions = await verifyAppDefinitions(root);
  assert.deepEqual(definitions, [validDefinition]);

  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify({ ...validDefinition, modules: ["unknown"] }, null, 2)}\n`,
  );
  await assert.rejects(
    () => verifyAppDefinitions(root),
    /references unknown module unknown/,
  );
});

test("fails closed when an app selects a module incompatible with its schema", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-app-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await writeTasksModule(root, [3]);
  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify(validDefinition, null, 2)}\n`,
  );

  await assert.rejects(
    () => verifyAppDefinitions(root),
    /App reference schemaVersion 2 is not compatible with module tasks/,
  );
});

test("requires every app directory to have a manifest", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-app-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await mkdir(join(root, "modules"), { recursive: true });

  await assert.rejects(
    () => verifyAppDefinitions(root),
    /apps\/reference is missing appbasis\.app\.json/,
  );
});

async function writeTasksModule(root, compatibility = [2]) {
  const moduleRoot = join(root, "modules", "tasks");
  await mkdir(join(moduleRoot, "migrations"), { recursive: true });
  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        moduleId: "tasks",
        displayName: "Aufgaben",
        packageName: "@appbasis/tasks",
        compatibility: {
          appDefinitionSchemaVersions: compatibility,
        },
        capabilities: ["tasks:manage"],
        database: {
          schemaVersion: 1,
          migrations: [
            "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
          ],
        },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify(
      {
        name: "@appbasis/tasks",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(
      moduleRoot,
      "migrations",
      "0000_appbasis_tasks_foundation.sql",
    ),
    "SELECT 1;\n",
  );
}

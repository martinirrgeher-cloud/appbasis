import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseModuleDefinition,
  readModuleDefinitions,
  verifyModuleDefinitions,
} from "./module-definition.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("parses the minimal FC4 module contract", () => {
  const definition = parseModuleDefinition({
    schemaVersion: 1,
    moduleId: "countdown",
    displayName: "Intervall-Countdown",
    packageName: "@appbasis/countdown",
    compatibility: {
      appDefinitionSchemaVersions: [2],
    },
    capabilities: ["countdown:view"],
    database: null,
  });

  assert.deepEqual(definition, {
    schemaVersion: 1,
    moduleId: "countdown",
    displayName: "Intervall-Countdown",
    packageName: "@appbasis/countdown",
    compatibility: {
      appDefinitionSchemaVersions: [2],
    },
    capabilities: ["countdown:view"],
    database: null,
  });
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.compatibility), true);
  assert.equal(Object.isFrozen(definition.capabilities), true);
});

test("pins the existing tasks module to an explicit module-owned contract", async () => {
  const definitions = await verifyModuleDefinitions(repositoryRoot);
  assert.deepEqual(
    definitions.map((definition) => definition.moduleId),
    ["tasks"],
  );

  const tasks = definitions[0];
  assert.deepEqual(tasks, {
    schemaVersion: 1,
    moduleId: "tasks",
    displayName: "Aufgaben",
    packageName: "@appbasis/tasks",
    compatibility: {
      appDefinitionSchemaVersions: [2],
    },
    capabilities: ["tasks:manage"],
    database: {
      schemaVersion: 1,
      migrations: [
        "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
      ],
    },
  });
});

test("requires every module directory to publish its FC4 manifest", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "modules", "missing"), { recursive: true });

  await assert.rejects(
    () => readModuleDefinitions(root),
    /modules\/missing is missing appbasis\.module\.json/,
  );
});

test("rejects module identity, capability and compatibility drift", () => {
  const base = {
    schemaVersion: 1,
    moduleId: "countdown",
    displayName: "Intervall-Countdown",
    packageName: "@appbasis/countdown",
    compatibility: {
      appDefinitionSchemaVersions: [2],
    },
    capabilities: ["countdown:view"],
    database: null,
  };

  assert.throws(
    () => parseModuleDefinition({ ...base, extra: true }),
    /Unknown module definition field: extra/,
  );
  assert.throws(
    () =>
      parseModuleDefinition(base, {
        directoryName: "other",
      }),
    /must match modules\/other/,
  );
  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        packageName: "@appbasis/other",
      }),
    /packageName must be @appbasis\/countdown/,
  );
  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        capabilities: ["other:view"],
      }),
    /namespaced by countdown/,
  );
  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        compatibility: {
          appDefinitionSchemaVersions: [2, 2],
        },
      }),
    /must not contain duplicates/,
  );
});

test("keeps database ownership inside the module migration tree", () => {
  const base = {
    schemaVersion: 1,
    moduleId: "inventory",
    displayName: "Inventar",
    packageName: "@appbasis/inventory",
    compatibility: {
      appDefinitionSchemaVersions: [2],
    },
    capabilities: [],
  };

  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        database: {
          schemaVersion: 1,
          migrations: ["packages/identity/drizzle/0000.sql"],
        },
      }),
    /below modules\/inventory\/migrations/,
  );

  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        database: {
          schemaVersion: 1,
          migrations: [
            "modules/inventory/migrations/0000.sql",
            "modules/inventory/migrations/0000.sql",
          ],
        },
      }),
    /must not contain duplicates/,
  );
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-module-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "modules"), { recursive: true });
  return root;
}

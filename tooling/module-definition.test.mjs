import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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

test("pins the checked module inventory and tasks contract", async () => {
  const definitions = await verifyModuleDefinitions(repositoryRoot);
  assert.deepEqual(
    definitions.map((definition) => definition.moduleId),
    ["countdown", "tasks"],
  );

  const countdown = definitions.find(
    (definition) => definition.moduleId === "countdown",
  );
  assert.deepEqual(countdown, {
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

  const tasks = definitions.find(
    (definition) => definition.moduleId === "tasks",
  );
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

test("binds the module manifest to the real package and complete migration inventory", async (t) => {
  const root = await fixture(t);
  await writeModule(root, {
    moduleId: "inventory",
    packageName: "@appbasis/inventory",
    database: {
      schemaVersion: 2,
      migrations: [
        "modules/inventory/migrations/0000_foundation.sql",
        "modules/inventory/migrations/0001_extension.sql",
      ],
    },
  });
  await writeFile(
    join(root, "modules", "inventory", "migrations", "0001_extension.sql"),
    "SELECT 2;\n",
  );

  const definitions = await readModuleDefinitions(root);
  assert.deepEqual(definitions[0]?.database?.migrations, [
    "modules/inventory/migrations/0000_foundation.sql",
    "modules/inventory/migrations/0001_extension.sql",
  ]);

  await writeFile(
    join(root, "modules", "inventory", "migrations", "0002_unlisted.sql"),
    "SELECT 3;\n",
  );
  await assert.rejects(
    () => readModuleDefinitions(root),
    /must list every owned SQL migration/,
  );
});

test("rejects package drift and undeclared module SQL ownership", async (t) => {
  const root = await fixture(t);
  await writeModule(root, {
    moduleId: "countdown",
    packageName: "@appbasis/countdown",
    database: null,
  });
  await writeFile(
    join(root, "modules", "countdown", "package.json"),
    JSON.stringify(
      {
        name: "@appbasis/wrong",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );

  await assert.rejects(
    () => readModuleDefinitions(root),
    /package.json name must be @appbasis\/countdown/,
  );

  await rm(join(root, "modules", "countdown"), {
    recursive: true,
    force: true,
  });
  await writeModule(root, {
    moduleId: "countdown",
    packageName: "@appbasis/countdown",
    database: null,
  });
  await writeFile(
    join(root, "modules", "countdown", "migrations", "0000_hidden.sql"),
    "SELECT 1;\n",
  );

  await assert.rejects(
    () => readModuleDefinitions(root),
    /declares database null but owns SQL migrations/,
  );
});

test("rejects a symlinked module migration root", async (t) => {
  if (process.platform === "win32") {
    t.skip("Symlink creation is not a portable unprivileged Windows test.");
    return;
  }

  const root = await fixture(t);
  await writeModule(root, {
    moduleId: "inventory",
    packageName: "@appbasis/inventory",
    database: {
      schemaVersion: 1,
      migrations: ["modules/inventory/migrations/0000_foundation.sql"],
    },
  });

  const migrationRoot = join(root, "modules", "inventory", "migrations");
  const externalRoot = join(root, "outside-migrations");
  await rm(migrationRoot, { recursive: true, force: true });
  await mkdir(externalRoot);
  await writeFile(join(externalRoot, "0000_foundation.sql"), "SELECT 1;\n");
  await symlink(externalRoot, migrationRoot, "dir");

  await assert.rejects(
    () => readModuleDefinitions(root),
    /must not contain symbolic links: modules\/inventory\/migrations/,
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
  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        compatibility: {
          appDefinitionSchemaVersions: [3, 2],
        },
      }),
    /must use ascending order/,
  );
  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        capabilities: ["countdown:view", "countdown:edit"],
      }),
    /capabilities must use deterministic order/,
  );
});

test("keeps database ownership inside the module migration tree and deterministic", () => {
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

  assert.throws(
    () =>
      parseModuleDefinition({
        ...base,
        database: {
          schemaVersion: 1,
          migrations: [
            "modules/inventory/migrations/0001.sql",
            "modules/inventory/migrations/0000.sql",
          ],
        },
      }),
    /deterministic path order/,
  );
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-module-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "modules"), { recursive: true });
  return root;
}

async function writeModule(
  root,
  { moduleId, packageName, database },
) {
  const moduleRoot = join(root, "modules", moduleId);
  await mkdir(join(moduleRoot, "migrations"), { recursive: true });
  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        moduleId,
        displayName: moduleId === "countdown" ? "Intervall-Countdown" : "Inventar",
        packageName,
        compatibility: {
          appDefinitionSchemaVersions: [2],
        },
        capabilities: [],
        database,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
  if (database !== null) {
    await writeFile(
      join(moduleRoot, "migrations", "0000_foundation.sql"),
      "SELECT 1;\n",
    );
  }
}

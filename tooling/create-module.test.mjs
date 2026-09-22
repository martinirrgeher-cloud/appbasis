import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createModuleSkeleton,
  parseCreateModuleArguments,
} from "./create-module.mjs";
import { verifyModuleDefinitions } from "./module-definition.mjs";
import { writeTasksModuleFixture } from "./test-fixtures/module-fixtures.mjs";

test("parses the explicit module generator CLI contract", () => {
  assert.deepEqual(
    parseCreateModuleArguments([
      "--module-id",
      "countdown",
      "--display-name",
      "Intervall-Countdown",
      "--capability",
      "countdown:view",
      "--capability",
      "countdown:manage",
    ]),
    {
      moduleId: "countdown",
      displayName: "Intervall-Countdown",
      capabilities: ["countdown:view", "countdown:manage"],
    },
  );

  assert.throws(
    () => parseCreateModuleArguments(["--module-id", "countdown"]),
    /Missing required --display-name/,
  );
  assert.throws(
    () => parseCreateModuleArguments(["--unknown", "value"]),
    /Unknown module generator argument/,
  );
});

test("creates a verified deterministic database-free module skeleton", async (t) => {
  const root = await createRepositoryFixture(t);

  const result = await createModuleSkeleton(
    {
      moduleId: "countdown",
      displayName: "Intervall-Countdown",
      capabilities: ["countdown:view", "countdown:manage"],
    },
    testGeneratorOptions(root),
  );

  assert.equal(result.relativeDestination, join("modules", "countdown"));
  assert.deepEqual(result.definition, {
    schemaVersion: 1,
    moduleId: "countdown",
    displayName: "Intervall-Countdown",
    packageName: "@appbasis/countdown",
    compatibility: {
      appDefinitionSchemaVersions: [2],
    },
    capabilities: ["countdown:manage", "countdown:view"],
    database: null,
  });

  const manifest = JSON.parse(
    await readFile(
      join(root, "modules", "countdown", "appbasis.module.json"),
      "utf8",
    ),
  );
  assert.deepEqual(manifest, result.definition);

  const packageJson = JSON.parse(
    await readFile(join(root, "modules", "countdown", "package.json"), "utf8"),
  );
  assert.deepEqual(packageJson, {
    name: "@appbasis/countdown",
    version: "0.0.0",
    private: true,
    type: "module",
    exports: {
      ".": "./src/index.ts",
    },
    scripts: {
      typecheck: "tsc --noEmit -p tsconfig.json",
    },
    devDependencies: {
      typescript: "5.9.3",
    },
  });

  assert.equal(
    await readFile(join(root, "modules", "countdown", "tsconfig.json"), "utf8"),
    '{\n  "extends": "../../tsconfig.base.json",\n  "include": ["src/**/*.ts"]\n}\n',
  );

  const entrypoint = await readFile(
    join(root, "modules", "countdown", "src", "index.ts"),
    "utf8",
  );
  assert.match(entrypoint, /from "\.\.\/appbasis\.module\.json"/);
  assert.match(entrypoint, /export const MODULE_CAPABILITIES/);

  const definitions = await verifyModuleDefinitions(root);
  assert.deepEqual(
    definitions.map((definition) => definition.moduleId),
    ["countdown", "tasks"],
  );
  assert.equal(definitions[0]?.database, null);
});

test("rejects invalid capability ownership before writing", async (t) => {
  const root = await createRepositoryFixture(t);

  await assert.rejects(
    () =>
      createModuleSkeleton(
        {
          moduleId: "countdown",
          displayName: "Intervall-Countdown",
          capabilities: ["tasks:manage"],
        },
        testGeneratorOptions(root),
      ),
    /namespaced by countdown/,
  );

  assert.deepEqual(await readdir(join(root, "modules")), ["tasks"]);
  assert.equal(
    (await readdir(root)).some((entry) =>
      entry.startsWith(".appbasis-create-module-"),
    ),
    false,
  );
});

test("rejects duplicate capabilities instead of silently changing the contract", async (t) => {
  const root = await createRepositoryFixture(t);

  await assert.rejects(
    () =>
      createModuleSkeleton(
        {
          moduleId: "countdown",
          displayName: "Intervall-Countdown",
          capabilities: ["countdown:view", "countdown:view"],
        },
        testGeneratorOptions(root),
      ),
    /must not contain duplicates/,
  );

  assert.deepEqual(await readdir(join(root, "modules")), ["tasks"]);
});

test("never replaces a destination created after staging", async (t) => {
  const root = await createRepositoryFixture(t);
  const destination = join(root, "modules", "countdown");

  await assert.rejects(
    () =>
      createModuleSkeleton(
        {
          moduleId: "countdown",
          displayName: "Intervall-Countdown",
          capabilities: [],
        },
        testGeneratorOptions(root, {
          afterStage: async () => mkdir(destination),
        }),
      ),
    /Module destination already exists/,
  );

  assert.deepEqual(await readdir(destination), []);
  assert.equal(
    (await readdir(root)).some((entry) =>
      entry.startsWith(".appbasis-create-module-"),
    ),
    false,
  );
});

test("rolls back module publication and lockfile when workspace finalization fails", async (t) => {
  const root = await createRepositoryFixture(t);
  const lockfilePath = join(root, "pnpm-lock.yaml");
  const originalLockfile = await readFile(lockfilePath, "utf8");

  await assert.rejects(
    () =>
      createModuleSkeleton(
        {
          moduleId: "countdown",
          displayName: "Intervall-Countdown",
          capabilities: [],
        },
        testGeneratorOptions(root, {
          workspaceFinalizer: async () => {
            await writeFile(lockfilePath, "mutated\n");
            throw new Error("workspace finalization failed");
          },
        }),
      ),
    /workspace finalization failed/,
  );

  assert.equal(await readFile(lockfilePath, "utf8"), originalLockfile);
  assert.deepEqual(await readdir(join(root, "modules")), ["tasks"]);
  assert.equal(
    (await readdir(root)).some((entry) =>
      entry.startsWith(".appbasis-create-module-"),
    ),
    false,
  );
});

test("never overwrites an existing module", async (t) => {
  const root = await createRepositoryFixture(t);
  const input = {
    moduleId: "countdown",
    displayName: "Intervall-Countdown",
    capabilities: [],
  };

  await createModuleSkeleton(input, testGeneratorOptions(root));
  const manifestPath = join(
    root,
    "modules",
    "countdown",
    "appbasis.module.json",
  );
  const firstManifest = await readFile(manifestPath, "utf8");

  await assert.rejects(
    () => createModuleSkeleton(input, testGeneratorOptions(root)),
    /Module destination already exists/,
  );

  assert.equal(await readFile(manifestPath, "utf8"), firstManifest);
});

function testGeneratorOptions(root, hooks = {}) {
  return {
    repositoryRoot: root,
    testingHooks: {
      workspaceFinalizer: async () => {},
      ...hooks,
    },
  };
}

async function createRepositoryFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-create-module-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "modules"), { recursive: true });
  await writeTasksModuleFixture(root);
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n",
  );
  return root;
}

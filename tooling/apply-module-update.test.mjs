import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyModuleUpdate,
  parseApplyModuleUpdateArguments,
} from "./apply-module-update.mjs";
import { writeCountdownModuleFixture } from "./test-fixtures/module-fixtures.mjs";

test("parses the explicit FC5 executor CLI contract", () => {
  assert.deepEqual(
    parseApplyModuleUpdateArguments([
      "--app-id",
      "reference",
      "--module",
      "countdown",
    ]),
    {
      appId: "reference",
      moduleId: "countdown",
    },
  );
  assert.throws(
    () => parseApplyModuleUpdateArguments(["--app-id", "reference"]),
    /Missing required --module/,
  );
  assert.throws(
    () => parseApplyModuleUpdateArguments(["--unknown", "value"]),
    /Unknown module update executor argument/,
  );
});

test("installs countdown atomically without overwriting custom runtime files", async (t) => {
  const root = await createFixture(t);
  const customPath = join(root, "apps", "reference", "worker", "custom.ts");
  const databasePath = join(
    root,
    "apps",
    "reference",
    "appbasis.database.json",
  );
  const databaseBefore = await readFile(databasePath, "utf8");
  let finalized = false;

  const result = await applyModuleUpdate(
    {
      appId: "reference",
      moduleId: "countdown",
    },
    executorOptions(root, {
      workspaceFinalizer: async ({ lockfilePath }) => {
        finalized = true;
        const packageJson = JSON.parse(
          await readFile(
            join(root, "apps", "reference", "package.json"),
            "utf8",
          ),
        );
        assert.equal(
          packageJson.dependencies["@appbasis/countdown"],
          "workspace:*",
        );
        await writeFile(lockfilePath, fixtureLockfile({ includeCountdown: true }));
      },
    }),
  );

  assert.equal(finalized, true);
  assert.equal(result.state, "installed");

  const definition = JSON.parse(
    await readFile(
      join(root, "apps", "reference", "appbasis.app.json"),
      "utf8",
    ),
  );
  assert.deepEqual(definition.modules, ["countdown"]);

  const packageJson = JSON.parse(
    await readFile(join(root, "apps", "reference", "package.json"), "utf8"),
  );
  assert.equal(packageJson.dependencies["@appbasis/countdown"], "workspace:*");
  assert.deepEqual(Object.keys(packageJson.dependencies), [
    "@appbasis/countdown",
    "@appbasis/identity",
    "hono",
  ]);

  assert.match(
    await readFile(join(root, "pnpm-lock.yaml"), "utf8"),
    /'@appbasis\/countdown'/,
  );
  assert.equal(await readFile(databasePath, "utf8"), databaseBefore);
  assert.equal(
    await readFile(customPath, "utf8"),
    'export const customRuntime = "preserve-me";\n',
  );
});

test("publishes the app definition only after workspace finalization", async (t) => {
  const root = await createFixture(t);
  let observed = false;

  await applyModuleUpdate(
    {
      appId: "reference",
      moduleId: "countdown",
    },
    executorOptions(root, {
      workspaceFinalizer: async ({ lockfilePath }) => {
        await writeFile(lockfilePath, fixtureLockfile({ includeCountdown: true }));
      },
      afterWorkspaceFinalization: async () => {
        observed = true;
        const definition = JSON.parse(
          await readFile(
            join(root, "apps", "reference", "appbasis.app.json"),
            "utf8",
          ),
        );
        const packageJson = JSON.parse(
          await readFile(
            join(root, "apps", "reference", "package.json"),
            "utf8",
          ),
        );
        assert.deepEqual(definition.modules, []);
        assert.equal(
          packageJson.dependencies["@appbasis/countdown"],
          "workspace:*",
        );
        assert.match(
          await readFile(join(root, "pnpm-lock.yaml"), "utf8"),
          /'@appbasis\/countdown'/,
        );
      },
    }),
  );

  assert.equal(observed, true);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(root, "apps", "reference", "appbasis.app.json"),
        "utf8",
      ),
    ).modules,
    ["countdown"],
  );
});

test("rolls back package and lockfile when workspace finalization fails", async (t) => {
  const root = await createFixture(t);
  const appDefinitionPath = join(
    root,
    "apps",
    "reference",
    "appbasis.app.json",
  );
  const packagePath = join(root, "apps", "reference", "package.json");
  const databasePath = join(
    root,
    "apps",
    "reference",
    "appbasis.database.json",
  );
  const lockfilePath = join(root, "pnpm-lock.yaml");
  const customPath = join(root, "apps", "reference", "worker", "custom.ts");

  const before = {
    appDefinition: await readFile(appDefinitionPath, "utf8"),
    packageJson: await readFile(packagePath, "utf8"),
    database: await readFile(databasePath, "utf8"),
    lockfile: await readFile(lockfilePath, "utf8"),
    custom: await readFile(customPath, "utf8"),
  };

  await assert.rejects(
    () =>
      applyModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        executorOptions(root, {
          workspaceFinalizer: async ({ lockfilePath: actualLockfilePath }) => {
            await writeFile(
              actualLockfilePath,
              fixtureLockfile({ includeCountdown: true }),
            );
            throw new Error("synthetic workspace finalization failure");
          },
        }),
      ),
    /synthetic workspace finalization failure/,
  );

  assert.equal(await readFile(appDefinitionPath, "utf8"), before.appDefinition);
  assert.equal(await readFile(packagePath, "utf8"), before.packageJson);
  assert.equal(await readFile(databasePath, "utf8"), before.database);
  assert.equal(await readFile(lockfilePath, "utf8"), before.lockfile);
  assert.equal(await readFile(customPath, "utf8"), before.custom);
});

test("fails closed if an update input changes after planning", async (t) => {
  const root = await createFixture(t);
  const packagePath = join(root, "apps", "reference", "package.json");
  const lockfilePath = join(root, "pnpm-lock.yaml");
  const lockfileBefore = await readFile(lockfilePath, "utf8");

  await assert.rejects(
    () =>
      applyModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        executorOptions(root, {
          afterPlan: async () => {
            const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
            packageJson.description = "concurrent change";
            await writeFile(
              packagePath,
              `${JSON.stringify(packageJson, null, 2)}\n`,
            );
          },
          workspaceFinalizer: async () => {
            throw new Error("workspace finalizer must not run");
          },
        }),
      ),
    /Module update input changed during planning: app package/,
  );

  const packageAfter = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(packageAfter.description, "concurrent change");
  assert.equal(
    packageAfter.dependencies["@appbasis/countdown"],
    undefined,
  );
  assert.equal(await readFile(lockfilePath, "utf8"), lockfileBefore);
});

test("returns a no-op only for a fully consistent installed state", async (t) => {
  const root = await createFixture(t, { installed: true });
  const before = await snapshotFixture(root);

  const result = await applyModuleUpdate(
    {
      appId: "reference",
      moduleId: "countdown",
    },
    executorOptions(root, {
      workspaceFinalizer: async () => {
        throw new Error("workspace finalizer must not run for a no-op");
      },
    }),
  );

  assert.equal(result.state, "already-installed");
  assert.deepEqual(await snapshotFixture(root), before);
});

async function createFixture(t, { installed = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-fc5-executor-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference", "worker"), { recursive: true });
  await writeCountdownModuleFixture(root);

  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "reference",
        displayName: "Reference",
        modules: installed ? ["countdown"] : [],
        platformServices: ["identity"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "apps", "reference", "package.json"),
    `${JSON.stringify(
      {
        name: "@appbasis/app-reference",
        version: "0.0.0",
        description: "Custom existing app package",
        private: true,
        type: "module",
        dependencies: {
          "@appbasis/identity": "workspace:*",
          ...(installed
            ? { "@appbasis/countdown": "workspace:*" }
            : {}),
          hono: "4.13.1",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "apps", "reference", "appbasis.database.json"),
    `${JSON.stringify(
      {
        manifestVersion: 1,
        application: "reference",
        dialect: "postgresql",
        owners: [
          {
            id: "identity",
            root: "packages/identity",
            schemaVersion: 2,
            migrations: [
              "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
              "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "apps", "reference", "worker", "custom.ts"),
    'export const customRuntime = "preserve-me";\n',
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    fixtureLockfile({ includeCountdown: installed }),
  );

  return root;
}

function executorOptions(root, testingHooks) {
  return {
    repositoryRoot: root,
    testingHooks,
  };
}

async function snapshotFixture(root) {
  const paths = [
    "apps/reference/appbasis.app.json",
    "apps/reference/package.json",
    "apps/reference/appbasis.database.json",
    "apps/reference/worker/custom.ts",
    "pnpm-lock.yaml",
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        await readFile(join(root, path), "utf8"),
      ]),
    ),
  );
}

function fixtureLockfile({ includeCountdown }) {
  const countdown = includeCountdown
    ? `      '@appbasis/countdown':
        specifier: workspace:*
        version: link:../../modules/countdown
`
    : "";
  return `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}

  apps/reference:
    dependencies:
${countdown}      '@appbasis/identity':
        specifier: workspace:*
        version: link:../../packages/identity
      hono:
        specifier: 4.13.1
        version: 4.13.1

  modules/countdown:
    devDependencies:
      typescript:
        specifier: 5.9.3
        version: 5.9.3
`;
}

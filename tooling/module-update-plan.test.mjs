import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseModuleUpdatePlanArguments,
  planModuleUpdate,
  renderModuleUpdatePlan,
} from "./module-update-plan.mjs";
import { writeCountdownModuleFixture } from "./test-fixtures/module-fixtures.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("parses the explicit FC5 module planner CLI contract", () => {
  assert.deepEqual(
    parseModuleUpdatePlanArguments([
      "--app-id",
      "ulc-linz",
      "--module",
      "countdown",
    ]),
    {
      appId: "ulc-linz",
      moduleId: "countdown",
    },
  );
  assert.throws(
    () => parseModuleUpdatePlanArguments(["--app-id", "ulc-linz"]),
    /Missing required --module/,
  );
  assert.throws(
    () => parseModuleUpdatePlanArguments(["--unknown", "value"]),
    /Unknown module update planner argument/,
  );
});

test("plans the first ULC countdown install without touching custom runtime files", async () => {
  const plan = await planModuleUpdate(
    {
      appId: "ulc-linz",
      moduleId: "countdown",
    },
    { repositoryRoot },
  );

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.operation, "module-install");
  assert.equal(plan.state, "install");
  assert.deepEqual(plan.app, {
    appId: "ulc-linz",
    definitionSchemaVersion: 2,
    packageName: "@appbasis/app-ulc-linz",
    packageVersion: "0.0.0",
  });
  assert.deepEqual(plan.module, {
    moduleId: "countdown",
    manifestSchemaVersion: 1,
    packageName: "@appbasis/countdown",
    packageVersion: "0.0.0",
    databaseSchemaVersion: null,
  });
  assert.deepEqual(plan.changes.appDefinition, {
    path: "apps/ulc-linz/appbasis.app.json",
    beforeModules: [],
    afterModules: ["countdown"],
  });
  assert.deepEqual(plan.changes.packageDependency, {
    path: "apps/ulc-linz/package.json",
    dependency: "@appbasis/countdown",
    before: null,
    after: "workspace:*",
  });
  assert.equal(plan.changes.databaseManifest, null);
  assert.deepEqual(plan.changes.workspaceLockfile, {
    path: "pnpm-lock.yaml",
    action: "finalize-workspace",
  });
  assert.deepEqual(plan.writes, [
    "apps/ulc-linz/appbasis.app.json",
    "apps/ulc-linz/package.json",
    "pnpm-lock.yaml",
  ]);

  const rendered = renderModuleUpdatePlan(plan);
  assert.equal(rendered.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(rendered), plan);

  const currentUlcDefinition = JSON.parse(
    await readFile(
      join(repositoryRoot, "apps", "ulc-linz", "appbasis.app.json"),
      "utf8",
    ),
  );
  assert.deepEqual(currentUlcDefinition.modules, []);
});

test("fails closed before planning an incompatible module", async (t) => {
  const root = await createFixture(t, { compatibility: [3] });

  await assert.rejects(
    () =>
      planModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        { repositoryRoot: root },
      ),
    /schemaVersion 2 is not compatible with module countdown/,
  );
});

test("fails closed when package state already drifted ahead of the app manifest", async (t) => {
  const root = await createFixture(t, {
    extraDependencies: {
      "@appbasis/countdown": "workspace:*",
    },
  });

  await assert.rejects(
    () =>
      planModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        { repositoryRoot: root },
      ),
    /already depends on @appbasis\/countdown but does not declare module countdown/,
  );
});

test("returns a deterministic no-op for an already installed module", async (t) => {
  const root = await createFixture(t, {
    modules: ["countdown"],
    extraDependencies: {
      "@appbasis/countdown": "workspace:*",
    },
  });

  const plan = await planModuleUpdate(
    {
      appId: "reference",
      moduleId: "countdown",
    },
    { repositoryRoot: root },
  );

  assert.equal(plan.state, "already-installed");
  assert.equal(plan.changes.appDefinition, null);
  assert.equal(plan.changes.packageDependency, null);
  assert.equal(plan.changes.databaseManifest, null);
  assert.equal(plan.changes.workspaceLockfile, null);
  assert.deepEqual(plan.writes, []);
});

test("fails closed when an installed module has a stale lockfile importer", async (t) => {
  const root = await createFixture(t, {
    modules: ["countdown"],
    extraDependencies: {
      "@appbasis/countdown": "workspace:*",
    },
  });
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    fixtureLockfile({ includeCountdown: false }),
  );

  await assert.rejects(
    () =>
      planModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        { repositoryRoot: root },
      ),
    /lockfile importer is stale for @appbasis\/countdown/,
  );
});

test("fails closed when the lockfile is ahead of package.json", async (t) => {
  const root = await createFixture(t);
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    fixtureLockfile({ includeCountdown: true }),
  );

  await assert.rejects(
    () =>
      planModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        { repositoryRoot: root },
      ),
    /lockfile importer already declares @appbasis\/countdown while package.json does not/,
  );
});

test("fails closed when the current database ownership manifest has drifted", async (t) => {
  const root = await createFixture(t);
  const databasePath = join(
    root,
    "apps",
    "reference",
    "appbasis.database.json",
  );
  const database = JSON.parse(await readFile(databasePath, "utf8"));
  database.owners = [];
  await writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`);

  await assert.rejects(
    () =>
      planModuleUpdate(
        {
          appId: "reference",
          moduleId: "countdown",
        },
        { repositoryRoot: root },
      ),
    /database manifest has drifted/,
  );
});

async function createFixture(
  t,
  {
    compatibility = [2],
    modules = [],
    extraDependencies = {},
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-fc5-plan-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await writeCountdownModuleFixture(root, { compatibility });

  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "reference",
        displayName: "Reference",
        modules,
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
        private: true,
        type: "module",
        dependencies: {
          "@appbasis/identity": "workspace:*",
          ...extraDependencies,
          hono: "4.13.1",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    fixtureLockfile({
      includeCountdown:
        extraDependencies["@appbasis/countdown"] === "workspace:*",
    }),
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

  return root;
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
`;
}

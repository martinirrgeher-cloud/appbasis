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
import { writeCountdownModuleFixture, writeTasksModuleFixture } from "./test-fixtures/module-fixtures.mjs";

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

test("plans the canonical countdown install write set for an existing compatible app", async (t) => {
  const root = await createFixture(t);
  const plan = await planModuleUpdate(
    {
      appId: "reference",
      moduleId: "countdown",
    },
    { repositoryRoot: root },
  );

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.operation, "module-install");
  assert.equal(plan.state, "install");
  assert.deepEqual(plan.changes.appDefinition, {
    path: "apps/reference/appbasis.app.json",
    beforeModules: [],
    afterModules: ["countdown"],
  });
  assert.deepEqual(plan.changes.packageDependency, {
    path: "apps/reference/package.json",
    dependency: "@appbasis/countdown",
    before: null,
    after: "workspace:*",
  });
  assert.equal(plan.changes.databaseManifest, null);
  assert.equal(plan.changes.databaseMigrationDelta, null);
  assert.deepEqual(plan.changes.workspaceLockfile, {
    path: "pnpm-lock.yaml",
    action: "finalize-workspace",
  });
  assert.deepEqual(plan.writes, [
    "apps/reference/appbasis.app.json",
    "apps/reference/package.json",
    "pnpm-lock.yaml",
  ]);
});

test("FC6-A plans exactly one database-owner migration delta without writing the repository", async (t) => {
  const root = await createFixture(t);
  const observedPaths = [
    "apps/reference/appbasis.app.json",
    "apps/reference/package.json",
    "apps/reference/appbasis.database.json",
    "pnpm-lock.yaml",
  ];
  const before = Object.fromEntries(
    await Promise.all(
      observedPaths.map(async (relativePath) => [
        relativePath,
        await readFile(join(root, relativePath), "utf8"),
      ]),
    ),
  );

  const plan = await planModuleUpdate(
    {
      appId: "reference",
      moduleId: "tasks",
    },
    { repositoryRoot: root },
  );

  assert.equal(plan.state, "install");
  assert.equal(plan.module.databaseSchemaVersion, 1);
  assert.deepEqual(plan.changes.databaseMigrationDelta, {
    operation: "add-owner",
    beforeOwnerIds: ["identity"],
    afterOwnerIds: ["identity", "tasks"],
    addedOwner: {
      id: "tasks",
      root: "modules/tasks",
      schemaVersion: 1,
      migrations: [
        "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
      ],
    },
  });
  assert.deepEqual(plan.changes.databaseManifest?.before?.owners, [
    {
      id: "identity",
      root: "packages/identity",
      schemaVersion: 2,
      migrations: [
        "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
        "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
      ],
    },
  ]);
  assert.deepEqual(plan.changes.databaseManifest?.after?.owners, [
    ...plan.changes.databaseManifest.before.owners,
    plan.changes.databaseMigrationDelta.addedOwner,
  ]);
  assert.deepEqual(plan.writes, [
    "apps/reference/appbasis.app.json",
    "apps/reference/package.json",
    "apps/reference/appbasis.database.json",
    "pnpm-lock.yaml",
  ]);

  const after = Object.fromEntries(
    await Promise.all(
      observedPaths.map(async (relativePath) => [
        relativePath,
        await readFile(join(root, relativePath), "utf8"),
      ]),
    ),
  );
  assert.deepEqual(after, before);
});

test("recognizes the real ULC countdown installation as a deterministic no-op", async () => {
  const plan = await planModuleUpdate(
    {
      appId: "ulc-linz",
      moduleId: "countdown",
    },
    { repositoryRoot },
  );

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.operation, "module-install");
  assert.equal(plan.state, "already-installed");
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
  assert.equal(plan.changes.appDefinition, null);
  assert.equal(plan.changes.packageDependency, null);
  assert.equal(plan.changes.databaseManifest, null);
  assert.equal(plan.changes.databaseMigrationDelta, null);
  assert.equal(plan.changes.workspaceLockfile, null);
  assert.deepEqual(plan.writes, []);

  const rendered = renderModuleUpdatePlan(plan);
  assert.equal(rendered.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(rendered), plan);

  const currentUlcDefinition = JSON.parse(
    await readFile(
      join(repositoryRoot, "apps", "ulc-linz", "appbasis.app.json"),
      "utf8",
    ),
  );
  assert.deepEqual(currentUlcDefinition.modules, ["countdown"]);
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

test("FC6-A fails closed when the new module owner collides with an existing app database owner", async (t) => {
  const root = await createOwnerCollisionFixture(t);

  await assert.rejects(
    () =>
      planModuleUpdate(
        {
          appId: "ulc-linz",
          moduleId: "ulc-linz-lifecycle",
        },
        { repositoryRoot: root },
      ),
    /database owner collides with an existing database owner/,
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
  await writeTasksModuleFixture(root, { compatibility });

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

async function createOwnerCollisionFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-fc6-owner-collision-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const appRoot = join(root, "apps", "ulc-linz");
  const moduleRoot = join(root, "modules", "ulc-linz-lifecycle");
  await mkdir(appRoot, { recursive: true });
  await mkdir(join(moduleRoot, "migrations"), { recursive: true });

  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        moduleId: "ulc-linz-lifecycle",
        displayName: "Collision",
        packageName: "@appbasis/ulc-linz-lifecycle",
        compatibility: { appDefinitionSchemaVersions: [2] },
        capabilities: ["ulc-linz-lifecycle:view"],
        database: {
          schemaVersion: 1,
          migrations: [
            "modules/ulc-linz-lifecycle/migrations/0000_collision.sql",
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(moduleRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@appbasis/ulc-linz-lifecycle",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(moduleRoot, "migrations", "0000_collision.sql"),
    "SELECT 1;\n",
  );

  await writeFile(
    join(appRoot, "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "ulc-linz",
        displayName: "ULC Linz",
        modules: [],
        platformServices: ["identity"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@appbasis/app-ulc-linz",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          "@appbasis/identity": "workspace:*",
          hono: "4.13.1",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(appRoot, "appbasis.database.json"),
    `${JSON.stringify(
      {
        manifestVersion: 1,
        application: "ulc-linz",
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
          {
            id: "ulc-linz-lifecycle",
            root: "apps/ulc-linz",
            schemaVersion: 4,
            migrations: [
              "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
              "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
              "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
              "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}

  apps/ulc-linz:
    dependencies:
      '@appbasis/identity':
        specifier: workspace:*
        version: link:../../packages/identity
      hono:
        specifier: 4.13.1
        version: 4.13.1
`,
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

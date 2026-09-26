import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
} from "./database-migration-executor.mjs";
import {
  applyModuleUpdateMigrations,
  ModuleUpdateMigrationExecutionError,
} from "./module-update-migration-executor.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for FC6-B PostgreSQL E2E tests.");
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseName = "appbasis_fc6_module_update_e2e";
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;
const expectedPrincipal = decodeURIComponent(new URL(databaseUrl).username);

test("FC6-B applies tasks atomically to a non-empty existing app baseline and refuses a rerun", async (t) => {
  const root = await createExistingAppFixture(t);
  const admin = createPostgresDatabase(databaseUrl);

  try {
    await resetIdentityBaseline(admin, root);

    const result = await applyModuleUpdateMigrations(
      {
        appId: "existing",
        moduleId: "tasks",
        connectionString: targetUrl.toString(),
        expectedDatabase: databaseName,
        expectedPrincipal,
      },
      { repositoryRoot: root },
    );

    assert.equal(result.state, "applied");
    assert.equal(result.application, "existing");
    assert.equal(result.moduleId, "tasks");
    assert.equal(result.migrationCount, 1);
    assert.ok(result.statementCount > 0);
    assert.ok(result.baselineMarkerCount > 0);
    assert.ok(result.targetMarkerCount > 0);

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const taskTables = await verification.client`
        SELECT count(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'appbasis_task'
      `;
      assert.equal(taskTables[0]?.count, 1);

      const seed = await verification.client`
        SELECT display_name
        FROM appbasis_person
        WHERE id = 'fc6-existing-person'
      `;
      assert.deepEqual(
        seed.map((row) => ({ display_name: row.display_name })),
        [{ display_name: "Existing Person" }],
      );
    } finally {
      await verification.client.end();
    }

    await assert.rejects(
      applyModuleUpdateMigrations(
        {
          appId: "existing",
          moduleId: "tasks",
          connectionString: targetUrl.toString(),
          expectedDatabase: databaseName,
          expectedPrincipal,
        },
        { repositoryRoot: root },
      ),
      (error) =>
        error instanceof ModuleUpdateMigrationExecutionError &&
        /already or partially applied/.test(error.message),
    );
  } finally {
    await admin.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await admin.client.end();
  }
});

test("FC6-B rejects baseline drift before executing target module SQL", async (t) => {
  const root = await createExistingAppFixture(t);
  const admin = createPostgresDatabase(databaseUrl);

  try {
    await resetIdentityBaseline(admin, root);

    const drift = createPostgresDatabase(targetUrl.toString());
    try {
      await drift.client.unsafe(
        "ALTER TABLE appbasis_person DROP COLUMN display_name",
      );
    } finally {
      await drift.client.end();
    }

    await assert.rejects(
      applyModuleUpdateMigrations(
        {
          appId: "existing",
          moduleId: "tasks",
          connectionString: targetUrl.toString(),
          expectedDatabase: databaseName,
          expectedPrincipal,
        },
        { repositoryRoot: root },
      ),
      (error) =>
        error instanceof ModuleUpdateMigrationExecutionError &&
        /baseline does not match/.test(error.message),
    );

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const rows = await verification.client`
        SELECT count(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'appbasis_task'
      `;
      assert.equal(rows[0]?.count, 0);
    } finally {
      await verification.client.end();
    }
  } finally {
    await admin.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await admin.client.end();
  }
});

test("FC6-B rolls the complete module delta back when a later target statement fails", async (t) => {
  const root = await createExistingAppFixture(t);
  const taskMigrationPath = join(
    root,
    "modules",
    "tasks",
    "migrations",
    "0000_appbasis_tasks_foundation.sql",
  );
  const originalTasksMigration = await readFile(taskMigrationPath, "utf8");
  await writeFile(
    taskMigrationPath,
    `${originalTasksMigration}
--> statement-breakpoint
CREATE TABLE appbasis_task_failure (
  id integer REFERENCES appbasis_missing_parent(id)
);
`,
  );

  const admin = createPostgresDatabase(databaseUrl);
  try {
    await resetIdentityBaseline(admin, root);

    await assert.rejects(
      applyModuleUpdateMigrations(
        {
          appId: "existing",
          moduleId: "tasks",
          connectionString: targetUrl.toString(),
          expectedDatabase: databaseName,
          expectedPrincipal,
        },
        { repositoryRoot: root },
      ),
      (error) =>
        error instanceof ModuleUpdateMigrationExecutionError &&
        /transaction failed and was rolled back/.test(error.message),
    );

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const rows = await verification.client`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('appbasis_task', 'appbasis_task_failure')
        ORDER BY table_name
      `;
      assert.deepEqual(rows.map((row) => row.table_name), []);

      const seed = await verification.client`
        SELECT display_name
        FROM appbasis_person
        WHERE id = 'fc6-existing-person'
      `;
      assert.deepEqual(
        seed.map((row) => ({ display_name: row.display_name })),
        [{ display_name: "Existing Person" }],
      );
    } finally {
      await verification.client.end();
    }
  } finally {
    await admin.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await admin.client.end();
  }
});

async function resetIdentityBaseline(admin, root) {
  await admin.client.unsafe(
    `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
  );
  await admin.client.unsafe(`CREATE DATABASE ${databaseName}`);

  const baselinePlan = await loadRepositoryMigrationPlan({
    repositoryRoot: root,
    manifestPath: join(
      root,
      "apps",
      "existing",
      "appbasis.database.json",
    ),
    expectedApplication: "existing",
    expectedOwners: {
      identity: "packages/identity",
    },
  });
  await applyRepositoryMigrationPlan({
    connectionString: targetUrl.toString(),
    expectedDatabase: databaseName,
    plan: baselinePlan,
    createDatabase: createPostgresDatabase,
  });

  const seed = createPostgresDatabase(targetUrl.toString());
  try {
    await seed.client`
      INSERT INTO appbasis_person (id, display_name)
      VALUES ('fc6-existing-person', 'Existing Person')
    `;
  } finally {
    await seed.client.end();
  }
}

async function createExistingAppFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-fc6-b-postgres-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "existing"), { recursive: true });
  await mkdir(join(root, "packages", "identity", "drizzle"), {
    recursive: true,
  });
  await mkdir(join(root, "modules"), { recursive: true });

  for (const migration of [
    "0000_appbasis_identity_foundation.sql",
    "0001_appbasis_identity_foundation.sql",
  ]) {
    await cp(
      join(repositoryRoot, "packages", "identity", "drizzle", migration),
      join(root, "packages", "identity", "drizzle", migration),
    );
  }
  await cp(join(repositoryRoot, "modules", "tasks"), join(root, "modules", "tasks"), {
    recursive: true,
  });

  await writeFile(
    join(root, "apps", "existing", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "existing",
        displayName: "Existing",
        modules: [],
        platformServices: ["identity"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "apps", "existing", "package.json"),
    `${JSON.stringify(
      {
        name: "@appbasis/app-existing",
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
    join(root, "apps", "existing", "appbasis.database.json"),
    `${JSON.stringify(
      {
        manifestVersion: 1,
        application: "existing",
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
    join(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}

  apps/existing:
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

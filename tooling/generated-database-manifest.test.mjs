import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createAppSkeleton } from "./create-app.mjs";
import {
  createGeneratedDatabaseManifest,
  renderGeneratedDatabaseManifest,
} from "./generated-database-manifest.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("renders deterministic migration ownership from the declared app composition", () => {
  const rendered = renderGeneratedDatabaseManifest({
    appId: "checklist",
    platformServices: ["permissions", "identity"],
    modules: ["tasks"],
  });

  assert.equal(
    rendered,
    '{\n  "manifestVersion": 1,\n  "application": "checklist",\n  "dialect": "postgresql",\n  "owners": [\n    {\n      "id": "identity",\n      "root": "packages/identity",\n      "schemaVersion": 2,\n      "migrations": [\n        "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",\n        "packages/identity/drizzle/0001_appbasis_identity_foundation.sql"\n      ]\n    },\n    {\n      "id": "permissions",\n      "root": "packages/permissions",\n      "schemaVersion": 4,\n      "migrations": [\n        "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",\n        "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",\n        "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",\n        "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql"\n      ]\n    },\n    {\n      "id": "tasks",\n      "root": "modules/tasks",\n      "schemaVersion": 1,\n      "migrations": [\n        "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql"\n      ]\n    }\n  ]\n}\n',
  );
});

test("createAppSkeleton publishes the generated database manifest before the app definition", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-database-manifest-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n",
  );

  const input = {
    appId: "checklist",
    displayName: "Checklist",
    platformServices: ["identity", "permissions"],
    modules: ["tasks"],
  };
  await createAppSkeleton(input, {
    repositoryRoot: root,
    testingHooks: { lockfileFinalizer: async () => {} },
  });

  assert.equal(
    await readFile(join(root, "apps", "checklist", "appbasis.database.json"), "utf8"),
    renderGeneratedDatabaseManifest(input),
  );
});

test("omits a database manifest only when the app declares no database owner", () => {
  assert.equal(
    createGeneratedDatabaseManifest({
      appId: "plain",
      platformServices: [],
      modules: [],
    }),
    null,
  );
});

test("fails closed when migration ownership for a selected component is undeclared", () => {
  assert.throws(
    () =>
      createGeneratedDatabaseManifest({
        appId: "unknown-service",
        platformServices: ["notifications"],
        modules: [],
      }),
    /ownership is not declared for platform service notifications/,
  );
  assert.throws(
    () =>
      createGeneratedDatabaseManifest({
        appId: "unknown-module",
        platformServices: [],
        modules: ["inventory"],
      }),
    /ownership is not declared for module inventory/,
  );
  assert.throws(
    () =>
      createGeneratedDatabaseManifest({
        appId: "prototype-key",
        platformServices: [],
        modules: ["constructor"],
      }),
    /ownership is not declared for module constructor/,
  );
});

test("checked generated tasks database manifest is byte-identical and migration-complete", async () => {
  const definitionPath = join(
    repositoryRoot,
    "apps",
    "tasks-minimal",
    "appbasis.app.json",
  );
  const databaseManifestPath = join(
    repositoryRoot,
    "apps",
    "tasks-minimal",
    "appbasis.database.json",
  );
  const definition = JSON.parse(await readFile(definitionPath, "utf8"));
  const checked = await readFile(databaseManifestPath, "utf8");
  const rendered = renderGeneratedDatabaseManifest(definition);

  assert.equal(checked, rendered);
  assert.doesNotMatch(checked, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(checked, /secret|password|token|provider/i);

  const parsed = JSON.parse(checked);
  for (const owner of parsed.owners) {
    const migrationDirectories = new Set(
      owner.migrations.map((migration) => posix.dirname(migration)),
    );
    for (const migrationDirectory of migrationDirectories) {
      const actualSqlFiles = await collectSqlFiles(
        migrationDirectory,
        join(repositoryRoot, ...migrationDirectory.split("/")),
      );
      const expectedSqlFiles = owner.migrations
        .filter((migration) => isAtOrWithinPath(migrationDirectory, migration))
        .sort((left, right) => left.localeCompare(right));

      assert.deepEqual(
        actualSqlFiles,
        expectedSqlFiles,
        `${owner.id} must list every SQL migration below ${migrationDirectory}`,
      );
    }
  }
});

async function collectSqlFiles(relativeDirectory, absoluteDirectory) {
  const sqlFiles = [];
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const relativeEntry = posix.join(relativeDirectory, entry.name);
    const absoluteEntry = join(absoluteDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Generated database migration tree must not contain symbolic links: ${relativeEntry}.`,
      );
    }
    if (entry.isDirectory()) {
      sqlFiles.push(...(await collectSqlFiles(relativeEntry, absoluteEntry)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".sql")) {
      sqlFiles.push(relativeEntry);
    }
  }

  return sqlFiles.sort((left, right) => left.localeCompare(right));
}

function isAtOrWithinPath(root, candidate) {
  const relative = posix.relative(root, candidate);
  return relative !== ".." && !relative.startsWith("../");
}

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
    '{\n  "manifestVersion": 1,\n  "application": "checklist",\n  "dialect": "postgresql",\n  "owners": [\n    {\n      "id": "identity",\n      "root": "packages/identity",\n      "schemaVersion": 2,\n      "migrations": [\n        "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",\n        "packages/identity/drizzle/0001_appbasis_identity_foundation.sql"\n      ]\n    },\n    {\n      "id": "permissions",\n      "root": "packages/permissions",\n      "schemaVersion": 1,\n      "migrations": [\n        "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql"\n      ]\n    },\n    {\n      "id": "tasks",\n      "root": "modules/tasks",\n      "schemaVersion": 1,\n      "migrations": [\n        "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql"\n      ]\n    }\n  ]\n}\n',
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
});

test("checked generated tasks database manifest is byte-identical and repository-local", async () => {
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
    for (const migration of owner.migrations) {
      await access(join(repositoryRoot, ...migration.split("/")));
    }
  }
});

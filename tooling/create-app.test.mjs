import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyAppDefinitions } from "./app-definition.mjs";
import {
  createAppSkeleton,
  parseCreateAppArguments,
} from "./create-app.mjs";

test("parses the explicit generator CLI contract", () => {
  assert.deepEqual(
    parseCreateAppArguments([
      "--app-id",
      "checklist",
      "--display-name",
      "Checklist",
      "--module",
      "tasks",
    ]),
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
    },
  );
  assert.throws(
    () => parseCreateAppArguments(["--app-id", "checklist"]),
    /Missing required --display-name/,
  );
  assert.throws(
    () => parseCreateAppArguments(["--unknown", "value"]),
    /Unknown app generator argument/,
  );
});

test("creates a deterministic skeleton that passes the app manifest contract", async (t) => {
  const root = await createRepositoryFixture(t);

  const result = await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
    },
    { repositoryRoot: root },
  );

  assert.equal(result.relativeDestination, join("apps", "checklist"));
  assert.equal(
    await readFile(join(root, "apps", "checklist", "appbasis.app.json"), "utf8"),
    '{\n  "schemaVersion": 1,\n  "appId": "checklist",\n  "displayName": "Checklist",\n  "modules": [\n    "tasks"\n  ]\n}\n',
  );
  assert.match(
    await readFile(join(root, "apps", "checklist", "README.md"), "utf8"),
    /intentionally contains only the versioned app definition/,
  );

  const definitions = await verifyAppDefinitions(root);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0]?.appId, "checklist");
});

test("an interrupted root staging directory never enters app discovery", async (t) => {
  const root = await createRepositoryFixture(t);
  await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
    },
    { repositoryRoot: root },
  );

  await mkdir(join(root, ".appbasis-create-other-interrupted"));

  assert.deepEqual(await readdir(join(root, "apps")), ["checklist"]);
  const definitions = await verifyAppDefinitions(root);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0]?.appId, "checklist");
});

test("fails before writing when a module is unknown", async (t) => {
  const root = await createRepositoryFixture(t);

  await assert.rejects(
    () =>
      createAppSkeleton(
        {
          appId: "checklist",
          displayName: "Checklist",
          modules: ["unknown"],
        },
        { repositoryRoot: root },
      ),
    /Unknown AppBasis module: unknown/,
  );

  assert.deepEqual(await readdir(join(root, "apps")), []);
});

test("never overwrites an existing app directory", async (t) => {
  const root = await createRepositoryFixture(t);
  const input = {
    appId: "checklist",
    displayName: "Checklist",
    modules: ["tasks"],
  };

  await createAppSkeleton(input, { repositoryRoot: root });
  const manifestPath = join(root, "apps", "checklist", "appbasis.app.json");
  const firstManifest = await readFile(manifestPath, "utf8");

  await assert.rejects(
    () => createAppSkeleton(input, { repositoryRoot: root }),
    /App destination already exists/,
  );
  assert.equal(await readFile(manifestPath, "utf8"), firstManifest);
});

async function createRepositoryFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-create-app-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });
  return root;
}

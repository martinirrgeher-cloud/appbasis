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
import { setTimeout as delay } from "node:timers/promises";
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

test("serializes verification until a live publication is complete", async (t) => {
  const root = await createRepositoryFixture(t);
  await writeExistingApp(root, {
    schemaVersion: 1,
    appId: "reference",
    displayName: "Reference",
    modules: ["tasks"],
  });

  let verificationOutcome;
  let verificationSettled = false;

  await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
    },
    {
      repositoryRoot: root,
      testingHooks: {
        afterReserve: async () => {
          assert.deepEqual(await readdir(join(root, "apps")), [
            "checklist",
            "reference",
          ]);
          verificationOutcome = verifyAppDefinitions(root)
            .then((definitions) => ({ ok: true, definitions }))
            .catch((error) => ({ ok: false, error }))
            .finally(() => {
              verificationSettled = true;
            });
          await delay(60);
          assert.equal(verificationSettled, false);
        },
      },
    },
  );

  assert.notEqual(verificationOutcome, undefined);
  const outcome = await verificationOutcome;
  assert.equal(outcome.ok, true);
  assert.deepEqual(
    outcome.definitions.map((definition) => definition.appId),
    ["checklist", "reference"],
  );
});

test("does not replace a destination created after staging", async (t) => {
  const root = await createRepositoryFixture(t);
  const destination = join(root, "apps", "checklist");

  await assert.rejects(
    () =>
      createAppSkeleton(
        {
          appId: "checklist",
          displayName: "Checklist",
          modules: ["tasks"],
        },
        {
          repositoryRoot: root,
          testingHooks: {
            afterStage: async () => mkdir(destination),
          },
        },
      ),
    /App destination already exists/,
  );

  assert.deepEqual(await readdir(destination), []);
  const rootEntries = await readdir(root);
  assert.equal(
    rootEntries.some((entry) => entry.startsWith(".appbasis-create-checklist-")),
    false,
  );
  assert.equal(rootEntries.includes(".appbasis-app-registry.lock"), false);
  assert.equal(
    rootEntries.some((entry) =>
      entry.startsWith(".appbasis-app-registry-candidate-"),
    ),
    false,
  );
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

async function writeExistingApp(root, definition) {
  const directory = join(root, "apps", definition.appId);
  await mkdir(directory);
  await writeFile(
    join(directory, "appbasis.app.json"),
    `${JSON.stringify(definition, null, 2)}\n`,
  );
}

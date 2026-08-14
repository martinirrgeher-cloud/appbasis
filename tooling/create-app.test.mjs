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
      "--platform-service",
      "identity",
    ]),
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
      platformServices: ["identity"],
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

test("creates a deterministic identity app that passes the app manifest contract", async (t) => {
  const root = await createRepositoryFixture(t);

  const result = await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
      platformServices: ["identity"],
    },
    testGeneratorOptions(root),
  );

  assert.equal(result.relativeDestination, join("apps", "checklist"));
  assert.equal(
    await readFile(join(root, "apps", "checklist", "appbasis.app.json"), "utf8"),
    '{\n  "schemaVersion": 2,\n  "appId": "checklist",\n  "displayName": "Checklist",\n  "modules": [\n    "tasks"\n  ],\n  "platformServices": [\n    "identity"\n  ]\n}\n',
  );

  const readme = await readFile(
    join(root, "apps", "checklist", "README.md"),
    "utf8",
  );
  assert.match(readme, /Platform services: identity/);
  assert.match(readme, /generated identity runtime/);
  assert.match(readme, /@appbasis\/identity\/http/);

  const packageJson = JSON.parse(
    await readFile(join(root, "apps", "checklist", "package.json"), "utf8"),
  );
  assert.equal(packageJson.name, "@appbasis/app-checklist");
  assert.deepEqual(packageJson.dependencies, {
    "@appbasis/identity": "workspace:*",
    "@appbasis/tasks": "workspace:*",
    hono: "4.13.1",
  });

  const worker = await readFile(
    join(root, "apps", "checklist", "worker", "app.ts"),
    "utf8",
  );
  assert.match(worker, /from "@appbasis\/identity\/http"/);
  assert.match(worker, /\/api\/auth\/session/);
  assert.doesNotMatch(worker, /reference/i);

  const definitions = await verifyAppDefinitions(root);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0]?.appId, "checklist");
  assert.deepEqual(definitions[0]?.platformServices, ["identity"]);
});

test("finalizes the workspace lockfile before publishing the manifest", async (t) => {
  const root = await createRepositoryFixture(t);
  const lockfilePath = join(root, "pnpm-lock.yaml");
  const originalLockfile = await readFile(lockfilePath, "utf8");
  let finalized = false;

  await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: [],
      platformServices: ["identity"],
    },
    testGeneratorOptions(root, {
      lockfileFinalizer: async ({ lockfilePath: actualLockfilePath, destination }) => {
        finalized = true;
        assert.equal(actualLockfilePath, lockfilePath);
        assert.match(
          await readFile(join(destination, "package.json"), "utf8"),
          /@appbasis\/app-checklist/,
        );
        await assert.rejects(
          () => readFile(join(destination, "appbasis.app.json"), "utf8"),
          { code: "ENOENT" },
        );
        await writeFile(lockfilePath, `${originalLockfile}# finalized\n`);
      },
    }),
  );

  assert.equal(finalized, true);
  assert.equal(
    await readFile(lockfilePath, "utf8"),
    `${originalLockfile}# finalized\n`,
  );
  assert.match(
    await readFile(join(root, "apps", "checklist", "appbasis.app.json"), "utf8"),
    /"appId": "checklist"/,
  );
});

test("rolls back app and lockfile when workspace finalization fails", async (t) => {
  const root = await createRepositoryFixture(t);
  const lockfilePath = join(root, "pnpm-lock.yaml");
  const originalLockfile = await readFile(lockfilePath, "utf8");

  await assert.rejects(
    () =>
      createAppSkeleton(
        {
          appId: "checklist",
          displayName: "Checklist",
          modules: [],
          platformServices: ["identity"],
        },
        testGeneratorOptions(root, {
          lockfileFinalizer: async ({ lockfilePath: actualLockfilePath }) => {
            assert.equal(actualLockfilePath, lockfilePath);
            await writeFile(lockfilePath, "mutated lockfile\n");
            throw new Error("synthetic lockfile finalization failure");
          },
        }),
      ),
    /synthetic lockfile finalization failure/,
  );

  assert.equal(await readFile(lockfilePath, "utf8"), originalLockfile);
  assert.deepEqual(await readdir(join(root, "apps")), []);
  const rootEntries = await readdir(root);
  assert.equal(
    rootEntries.some((entry) => entry.startsWith(".appbasis-create-checklist-")),
    false,
  );
});

test("does not generate runtime files when no platform service is selected", async (t) => {
  const root = await createRepositoryFixture(t);

  await createAppSkeleton(
    {
      appId: "plain",
      displayName: "Plain",
      modules: [],
      platformServices: [],
    },
    testGeneratorOptions(root),
  );

  assert.deepEqual((await readdir(join(root, "apps", "plain"))).sort(), [
    "README.md",
    "appbasis.app.json",
  ]);
  assert.doesNotMatch(
    await readFile(join(root, "apps", "plain", "README.md"), "utf8"),
    /identity runtime/,
  );
});

test("an interrupted root staging directory never enters app discovery", async (t) => {
  const root = await createRepositoryFixture(t);
  await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
      platformServices: ["identity"],
    },
    testGeneratorOptions(root),
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
    schemaVersion: 2,
    appId: "reference",
    displayName: "Reference",
    modules: ["tasks"],
    platformServices: ["identity"],
  });

  let verificationOutcome;
  let verificationSettled = false;

  await createAppSkeleton(
    {
      appId: "checklist",
      displayName: "Checklist",
      modules: ["tasks"],
      platformServices: ["identity"],
    },
    testGeneratorOptions(root, {
      afterReserve: async () => {
        assert.deepEqual(await readdir(join(root, "apps")), [
          "checklist",
          "reference",
        ]);
        assert.deepEqual(await readdir(join(root, "apps", "checklist")), []);
        verificationOutcome = verifyAppDefinitions(root)
          .then((definitions) => ({ ok: true, definitions }))
          .catch((error) => ({ ok: false, error }))
          .finally(() => {
            verificationSettled = true;
          });
        await delay(60);
        assert.equal(verificationSettled, false);
      },
    }),
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
          platformServices: ["identity"],
        },
        testGeneratorOptions(root, {
          afterStage: async () => mkdir(destination),
        }),
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
          platformServices: ["identity"],
        },
        testGeneratorOptions(root),
      ),
    /Unknown AppBasis module: unknown/,
  );

  assert.deepEqual(await readdir(join(root, "apps")), []);
});

test("fails before writing when a platform service is unsupported", async (t) => {
  const root = await createRepositoryFixture(t);

  await assert.rejects(
    () =>
      createAppSkeleton(
        {
          appId: "checklist",
          displayName: "Checklist",
          modules: [],
          platformServices: ["notifications"],
        },
        testGeneratorOptions(root),
      ),
    /references unsupported platform service notifications/,
  );

  assert.deepEqual(await readdir(join(root, "apps")), []);
});

test("never overwrites an existing app directory", async (t) => {
  const root = await createRepositoryFixture(t);
  const input = {
    appId: "checklist",
    displayName: "Checklist",
    modules: ["tasks"],
    platformServices: ["identity"],
  };

  await createAppSkeleton(input, testGeneratorOptions(root));
  const manifestPath = join(root, "apps", "checklist", "appbasis.app.json");
  const firstManifest = await readFile(manifestPath, "utf8");

  await assert.rejects(
    () => createAppSkeleton(input, testGeneratorOptions(root)),
    /App destination already exists/,
  );
  assert.equal(await readFile(manifestPath, "utf8"), firstManifest);
});

function testGeneratorOptions(root, hooks = {}) {
  return {
    repositoryRoot: root,
    testingHooks: {
      lockfileFinalizer: async () => {},
      ...hooks,
    },
  };
}

async function createRepositoryFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-create-app-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n",
  );
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

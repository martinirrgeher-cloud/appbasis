import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleSkeleton } from "./create-module.mjs";
import { writeTasksModuleFixture } from "./test-fixtures/module-fixtures.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("countdown preserves the canonical FC4 scaffold contract while extending it with product behavior", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-countdown-generated-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "modules"), { recursive: true });
  await writeTasksModuleFixture(root);
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n",
  );

  await createModuleSkeleton(
    {
      moduleId: "countdown",
      displayName: "Intervall-Countdown",
      capabilities: ["countdown:view"],
    },
    {
      repositoryRoot: root,
      testingHooks: {
        workspaceFinalizer: async () => {},
      },
    },
  );

  const generatedManifest = await readFile(
    join(root, "modules", "countdown", "appbasis.module.json"),
    "utf8",
  );
  const checkedManifest = await readFile(
    join(repositoryRoot, "modules", "countdown", "appbasis.module.json"),
    "utf8",
  );
  assert.equal(
    checkedManifest,
    generatedManifest,
    "the scaffold-owned countdown module manifest must remain canonical",
  );

  const generatedPackage = JSON.parse(
    await readFile(join(root, "modules", "countdown", "package.json"), "utf8"),
  );
  const checkedPackage = JSON.parse(
    await readFile(
      join(repositoryRoot, "modules", "countdown", "package.json"),
      "utf8",
    ),
  );
  for (const field of ["name", "version", "private", "type"]) {
    assert.deepEqual(
      checkedPackage[field],
      generatedPackage[field],
      `countdown package field drifted from scaffold: ${field}`,
    );
  }
  assert.deepEqual(checkedPackage.exports, generatedPackage.exports);
  assert.equal(
    checkedPackage.devDependencies.typescript,
    generatedPackage.devDependencies.typescript,
  );
  assert.equal(checkedPackage.scripts.typecheck, generatedPackage.scripts.typecheck);
  assert.equal(checkedPackage.scripts.test, "vitest run");
  assert.equal(checkedPackage.devDependencies.vitest, "4.1.10");

  const checkedTsconfig = JSON.parse(
    await readFile(
      join(repositoryRoot, "modules", "countdown", "tsconfig.json"),
      "utf8",
    ),
  );
  assert.equal(checkedTsconfig.extends, "../../tsconfig.base.json");
  assert.deepEqual(checkedTsconfig.include, ["src/**/*.ts", "test/**/*.ts"]);

  const implementation = await readFile(
    join(repositoryRoot, "modules", "countdown", "src", "countdown.ts"),
    "utf8",
  );
  assert.ok(implementation.includes("createCountdownTimeline"));
  assert.ok(implementation.includes("getCountdownSnapshot"));
});

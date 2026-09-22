import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleSkeleton } from "./create-module.mjs";
import { writeTasksModuleFixture } from "./test-fixtures/module-fixtures.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const GENERATED_FILES = [
  "appbasis.module.json",
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "README.md",
];

test("checked countdown module is byte-identical to the canonical FC4 scaffolder", async (t) => {
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

  for (const relativePath of GENERATED_FILES) {
    const generated = await readFile(
      join(root, "modules", "countdown", relativePath),
      "utf8",
    );
    const checked = await readFile(
      join(repositoryRoot, "modules", "countdown", relativePath),
      "utf8",
    );
    assert.equal(
      checked,
      generated,
      `modules/countdown/${relativePath} drifted from the canonical scaffolder`,
    );
  }
});

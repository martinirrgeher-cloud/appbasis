import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseAppDefinition, verifyAppDefinitions } from "./app-definition.mjs";

const validDefinition = {
  schemaVersion: 1,
  appId: "reference",
  displayName: "AppBasis Reference",
  modules: ["tasks"],
};

test("accepts the minimal versioned app definition", () => {
  const definition = parseAppDefinition(validDefinition, {
    directoryName: "reference",
  });

  assert.deepEqual(definition, validDefinition);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.modules), true);
});

test("fails closed on unknown fields and structural drift", () => {
  assert.throws(
    () => parseAppDefinition({ ...validDefinition, deployment: {} }),
    /Unknown app definition field: deployment/,
  );
  assert.throws(
    () =>
      parseAppDefinition(validDefinition, {
        directoryName: "different-app",
      }),
    /must match apps\/different-app/,
  );
  assert.throws(
    () =>
      parseAppDefinition({
        ...validDefinition,
        modules: ["tasks", "tasks"],
      }),
    /must not contain duplicates/,
  );
});

test("verifies app directories and referenced module directories", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-app-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });
  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify(validDefinition, null, 2)}\n`,
  );

  const definitions = await verifyAppDefinitions(root);
  assert.deepEqual(definitions, [validDefinition]);

  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify({ ...validDefinition, modules: ["unknown"] }, null, 2)}\n`,
  );
  await assert.rejects(
    () => verifyAppDefinitions(root),
    /references unknown module unknown/,
  );
});

test("requires every app directory to have a manifest", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-app-definition-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await mkdir(join(root, "modules"), { recursive: true });

  await assert.rejects(
    () => verifyAppDefinitions(root),
    /apps\/reference is missing appbasis\.app\.json/,
  );
});

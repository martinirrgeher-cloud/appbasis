import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  evaluateAppProductionComposition,
  parseAppProductionContract,
  parseModuleProductionContract,
} from "./production-contract.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("ULC production composition evaluates only selected modules and reports modular blockers", async () => {
  const result = await evaluateAppProductionComposition(
    repositoryRoot,
    "ulc-linz",
  );

  assert.equal(result.application, "ulc-linz");
  assert.deepEqual(
    result.modules.map((entry) => entry.moduleId),
    [
      "countdown",
      "athletes",
      "exercise-catalog",
      "training-blocks",
      "training-plans",
    ],
  );
  assert.equal(
    result.modules.some((entry) => entry.moduleId === "tasks"),
    false,
  );
  assert.equal(result.compositionReady, false);
  assert.deepEqual(
    result.modules
      .filter((entry) => entry.status === "blocked")
      .map((entry) => entry.moduleId),
    ["exercise-catalog", "training-blocks", "training-plans"],
  );
  assert.equal(result.productionReleaseAuthorized, false);
});

test("module contracts fail closed on database/status mismatch", () => {
  const definition = {
    moduleId: "sample",
    database: {
      schemaVersion: 1,
      migrations: ["modules/sample/migrations/0000.sql"],
    },
  };
  assert.throws(
    () =>
      parseModuleProductionContract(
        {
          schemaVersion: 1,
          moduleId: "sample",
          status: "ready",
          requirements: {
            authorization: "verified",
            database: "not-applicable",
            lifecycle: "verified",
          },
          blockers: [],
        },
        definition,
      ),
    /with a database cannot mark database production readiness not-applicable/,
  );
  assert.throws(
    () =>
      parseModuleProductionContract(
        {
          schemaVersion: 1,
          moduleId: "sample",
          status: "ready",
          requirements: {
            authorization: "verified",
            database: "verified",
            lifecycle: "blocked",
          },
          blockers: [],
        },
        definition,
      ),
    /cannot be ready with blocked requirements/,
  );
});

test("app contracts are bound to the exact selected composition", () => {
  const definition = {
    appId: "sample",
    modules: ["one"],
    platformServices: ["identity"],
  };
  assert.throws(
    () =>
      parseAppProductionContract(
        {
          schemaVersion: 1,
          appId: "sample",
          modules: ["one", "two"],
          platformServices: ["identity"],
          status: "ready",
          crossCutting: {
            dataExport: "verified",
            applicationLifecycle: "verified",
            privacy: "verified",
          },
          blockers: [],
        },
        definition,
      ),
    /must match the exact selected module and platform-service composition/,
  );
});

test("a ready composition does not care about blocked unselected modules", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-production-contract-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "sample"), { recursive: true });
  await mkdir(join(root, "modules", "selected"), { recursive: true });
  await mkdir(join(root, "modules", "unselected"), { recursive: true });

  await writeModule(root, "selected", {
    schemaVersion: 1,
    moduleId: "selected",
    status: "ready",
    requirements: {
      authorization: "verified",
      database: "not-applicable",
      lifecycle: "not-applicable",
    },
    blockers: [],
  });
  await writeModule(root, "unselected", {
    schemaVersion: 1,
    moduleId: "unselected",
    status: "blocked",
    requirements: {
      authorization: "verified",
      database: "not-applicable",
      lifecycle: "blocked",
    },
    blockers: ["not production ready"],
  });

  await writeFile(
    join(root, "apps", "sample", "appbasis.app.json"),
    JSON.stringify(
      {
        schemaVersion: 2,
        appId: "sample",
        displayName: "Sample",
        modules: ["selected"],
        platformServices: [],
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(root, "apps", "sample", "appbasis.production.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        appId: "sample",
        modules: ["selected"],
        platformServices: [],
        status: "ready",
        crossCutting: {
          dataExport: "not-applicable",
          applicationLifecycle: "not-applicable",
          privacy: "not-applicable",
        },
        blockers: [],
      },
      null,
      2,
    ) + "\n",
  );

  const result = await evaluateAppProductionComposition(root, "sample");
  assert.equal(result.compositionReady, true);
  assert.deepEqual(result.modules.map((entry) => entry.moduleId), ["selected"]);
});

async function writeModule(root, moduleId, productionContract) {
  const moduleRoot = join(root, "modules", moduleId);
  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        moduleId,
        displayName: moduleId,
        packageName: `@appbasis/${moduleId}`,
        compatibility: { appDefinitionSchemaVersions: [2] },
        capabilities: [],
        database: null,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify(
      {
        name: `@appbasis/${moduleId}`,
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(moduleRoot, "appbasis.production.json"),
    JSON.stringify(productionContract, null, 2) + "\n",
  );
}

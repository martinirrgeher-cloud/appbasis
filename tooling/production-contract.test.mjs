import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
          evidence: {
            authorization: [
              {
                path: "modules/sample/test/authorization.test.ts",
                gitBlobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
            database: [],
            lifecycle: [
              {
                path: "modules/sample/test/lifecycle.test.ts",
                gitBlobSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            ],
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
          evidence: {
            authorization: [
              {
                path: "modules/sample/test/authorization.test.ts",
                gitBlobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
            database: [
              {
                path: "modules/sample/migrations/0000.sql",
                gitBlobSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            ],
            lifecycle: [],
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
          evidence: {
            dataExport: [
              {
                path: "apps/sample/test/export.test.ts",
                gitBlobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
            applicationLifecycle: [
              {
                path: "apps/sample/test/lifecycle.test.ts",
                gitBlobSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            ],
            privacy: [
              {
                path: "apps/sample/test/privacy.test.ts",
                gitBlobSha: "cccccccccccccccccccccccccccccccccccccccc",
              },
            ],
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

  const selectedEvidenceContent = "export const selectedProductionEvidence = true;\\n";
  const selectedEvidencePath = "modules/selected/test/production.test.mjs";
  await writeModule(root, "selected", {
    schemaVersion: 1,
    moduleId: "selected",
    status: "ready",
    requirements: {
      authorization: "verified",
      database: "not-applicable",
      lifecycle: "not-applicable",
    },
    evidence: {
      authorization: [
        {
          path: selectedEvidencePath,
          gitBlobSha: gitBlobSha(selectedEvidenceContent),
        },
      ],
      database: [],
      lifecycle: [],
    },
    blockers: [],
  }, {
    [selectedEvidencePath]: selectedEvidenceContent,
  });
  await writeModule(root, "unselected", {
    schemaVersion: 1,
    moduleId: "unselected",
    status: "blocked",
    requirements: {
      authorization: "blocked",
      database: "not-applicable",
      lifecycle: "blocked",
    },
    evidence: {
      authorization: [],
      database: [],
      lifecycle: [],
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
        evidence: {
          dataExport: [],
          applicationLifecycle: [],
          privacy: [],
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

test("selected production evidence fails closed on content drift", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-production-drift-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "sample"), { recursive: true });
  await mkdir(join(root, "modules", "selected"), { recursive: true });

  const evidencePath = "modules/selected/test/production.test.mjs";
  await writeModule(root, "selected", {
    schemaVersion: 1,
    moduleId: "selected",
    status: "ready",
    requirements: {
      authorization: "verified",
      database: "not-applicable",
      lifecycle: "not-applicable",
    },
    evidence: {
      authorization: [
        {
          path: evidencePath,
          gitBlobSha: gitBlobSha("original\\n"),
        },
      ],
      database: [],
      lifecycle: [],
    },
    blockers: [],
  }, {
    [evidencePath]: "changed\\n",
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
    ) + "\\n",
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
        evidence: {
          dataExport: [],
          applicationLifecycle: [],
          privacy: [],
        },
        blockers: [],
      },
      null,
      2,
    ) + "\\n",
  );

  await assert.rejects(
    () => evaluateAppProductionComposition(root, "sample"),
    /Production evidence drifted: modules\/selected\/test\/production\.test\.mjs/,
  );
});

async function writeModule(root, moduleId, productionContract, evidenceFiles = {}) {
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
  for (const [relativePath, content] of Object.entries(evidenceFiles)) {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
  await writeFile(
    join(moduleRoot, "appbasis.production.json"),
    JSON.stringify(productionContract, null, 2) + "\n",
  );
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

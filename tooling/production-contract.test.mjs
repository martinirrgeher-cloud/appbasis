import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";
import {
  evaluateAppProductionComposition,
  parseAppProductionContract,
  parseModuleProductionContract,
} from "./production-contract.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("ULC production composition fails closed after attendance changes bound production evidence", async () => {
  await assert.rejects(
    () => evaluateAppProductionComposition(repositoryRoot, "ulc-linz"),
    /Production evidence drifted: (?:modules\/athletes\/|apps\/ulc-linz\/privacy\/m5-)/,
  );
});


test("ULC current export inventory is reviewed, pinned and still excludes sensitive training data", async () => {
  const appRoot = join(repositoryRoot, "apps", "ulc-linz");
  const productionContract = JSON.parse(
    await readFile(join(appRoot, "appbasis.production.json"), "utf8"),
  );
  assert.equal(productionContract.status, "blocked");
  assert.equal(productionContract.crossCutting.dataExport, "verified");
  assert.equal(productionContract.crossCutting.applicationLifecycle, "blocked");
  assert.equal(productionContract.crossCutting.privacy, "blocked");
  const entries = productionContract.evidence.dataExport;
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    const content = await readFile(join(repositoryRoot, entry.path), "utf8");
    assert.equal(gitBlobSha(content), entry.gitBlobSha, entry.path);
  }

  const exportContract = JSON.parse(
    await readFile(join(appRoot, "privacy", "m5-export-contract.json"), "utf8"),
  );
  const exported = exportContract.datasets.flatMap((dataset) =>
    dataset.sourceTables.map((table) => table.owner + ":" + table.table)
  );
  const excluded = exportContract.excludedTables.map((table) =>
    table.owner + ":" + table.table
  );
  assert.equal(exportContract.unknownDataset, "deny");
  assert.deepEqual(exportContract.datasets.map((dataset) => dataset.id), ["member-contact"]);
  for (const sensitive of [
    "athletes:appbasis_athlete_contact",
    "ulc-linz-lifecycle:ulc_linz_training_registration",
    "ulc-linz-lifecycle:ulc_linz_training_registration_change",
    "training-documentation:appbasis_training_documentation",
    "training-documentation:appbasis_training_documentation_revision",
    "training-plans:appbasis_training_plan_subject_deletion",
  ]) {
    assert.equal(exported.includes(sensitive), false, sensitive);
    assert.ok(excluded.includes(sensitive), sensitive);
  }
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

test("capability-bearing modules cannot bypass authorization readiness", () => {
  const baseContract = {
    schemaVersion: 1,
    moduleId: "sample",
    status: "ready",
    requirements: {
      authorization: "not-applicable",
      database: "not-applicable",
      lifecycle: "not-applicable",
    },
    evidence: {
      authorization: [],
      database: [],
      lifecycle: [],
    },
    blockers: [],
  };

  assert.throws(
    () =>
      parseModuleProductionContract(baseContract, {
        moduleId: "sample",
        capabilities: ["sample:view"],
        database: null,
      }),
    /with capabilities cannot mark authorization production readiness not-applicable/,
  );

  const parsed = parseModuleProductionContract(baseContract, {
    moduleId: "sample",
    capabilities: [],
    database: null,
  });
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.requirements.authorization, "not-applicable");
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

test("a ready composition does not inspect malformed unselected modules", async (t) => {
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
  await rm(join(root, "modules", "unselected", "package.json"));

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

test("selected module compatibility is enforced by the production evaluator", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-production-compat-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "sample"), { recursive: true });
  await mkdir(join(root, "modules", "selected"), { recursive: true });

  const evidencePath = "modules/selected/test/production.test.mjs";
  const evidenceContent = "export const selectedProductionEvidence = true;\n";
  await writeModule(
    root,
    "selected",
    {
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
            gitBlobSha: gitBlobSha(evidenceContent),
          },
        ],
        database: [],
        lifecycle: [],
      },
      blockers: [],
    },
    { [evidencePath]: evidenceContent },
    [1],
  );

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

  await assert.rejects(
    () => evaluateAppProductionComposition(root, "sample"),
    /schemaVersion 2 is not compatible with module selected/,
  );
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

  await assert.rejects(
    () => evaluateAppProductionComposition(root, "sample"),
    /Production evidence drifted: modules\/selected\/test\/production\.test\.mjs/,
  );
});

test("production evidence rejects symlinked paths even when target content matches", async (t) => {
  if (process.platform === "win32") {
    t.skip("Symlink creation is not a portable unprivileged Windows test.");
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "appbasis-production-symlink-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "sample"), { recursive: true });
  await mkdir(join(root, "modules", "selected"), { recursive: true });
  await mkdir(join(root, "modules", "outside"), { recursive: true });

  const evidencePath = "modules/selected/test/production.test.mjs";
  const evidenceContent = "export const sharedProductionEvidence = true;\n";
  await writeModule(
    root,
    "selected",
    {
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
            gitBlobSha: gitBlobSha(evidenceContent),
          },
        ],
        database: [],
        lifecycle: [],
      },
      blockers: [],
    },
    { [evidencePath]: evidenceContent },
  );

  const externalEvidence = join(root, "modules", "outside", "proof.mjs");
  await writeFile(externalEvidence, evidenceContent);
  const selectedEvidence = join(root, evidencePath);
  await rm(selectedEvidence);
  await symlink(externalEvidence, selectedEvidence);

  await writeReadySampleApp(root);

  await assert.rejects(
    () => evaluateAppProductionComposition(root, "sample"),
    /Production evidence must not contain symbolic links/,
  );
});

test("database manifest validation rejects wrong targets and duplicate owners", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-production-database-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "sample"), { recursive: true });
  await mkdir(join(root, "modules", "selected"), { recursive: true });

  const evidencePath = "modules/selected/test/production.test.mjs";
  const evidenceContent = "export const selectedProductionEvidence = true;\n";
  await writeModule(
    root,
    "selected",
    {
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
            gitBlobSha: gitBlobSha(evidenceContent),
          },
        ],
        database: [],
        lifecycle: [],
      },
      blockers: [],
    },
    { [evidencePath]: evidenceContent },
  );
  await writeReadySampleApp(root);

  const databasePath = join(root, "apps", "sample", "appbasis.database.json");
  await writeFile(
    databasePath,
    JSON.stringify(
      {
        manifestVersion: 1,
        application: "other",
        dialect: "postgresql",
        owners: [],
      },
      null,
      2,
    ) + "\n",
  );
  await assert.rejects(
    () => evaluateAppProductionComposition(root, "sample"),
    /App database manifest does not match canonical generated ownership/,
  );

  const duplicateOwner = {
    id: "identity",
    root: "packages/identity",
    schemaVersion: 1,
    migrations: ["packages/identity/migrations/0000.sql"],
  };
  await writeFile(
    databasePath,
    JSON.stringify(
      {
        manifestVersion: 1,
        application: "sample",
        dialect: "postgresql",
        owners: [duplicateOwner, duplicateOwner],
      },
      null,
      2,
    ) + "\n",
  );
  await assert.rejects(
    () => evaluateAppProductionComposition(root, "sample"),
    /App database manifest does not match canonical generated ownership/,
  );
});

test("database manifest must match canonical platform and app-owned owners", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-production-canonical-db-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "modules", "selected"), { recursive: true });

  const evidencePath = "modules/selected/test/production.test.mjs";
  const evidenceContent = "export const selectedProductionEvidence = true;\n";
  await writeModule(
    root,
    "selected",
    {
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
            gitBlobSha: gitBlobSha(evidenceContent),
          },
        ],
        database: [],
        lifecycle: [],
      },
      blockers: [],
    },
    { [evidencePath]: evidenceContent },
  );

  const appDefinition = {
    schemaVersion: 2,
    appId: "ulc-linz",
    displayName: "ULC Linz",
    modules: ["selected"],
    platformServices: ["identity", "permissions"],
  };
  await writeReadySampleApp(root, {
    appId: appDefinition.appId,
    platformServices: appDefinition.platformServices,
  });

  const canonical = createGeneratedDatabaseManifest(appDefinition, {
    moduleDefinitions: [{ moduleId: "selected", database: null }],
  });
  assert.ok(canonical);
  const databasePath = join(
    root,
    "apps",
    appDefinition.appId,
    "appbasis.database.json",
  );

  await writeFile(
    databasePath,
    JSON.stringify(
      {
        ...canonical,
        owners: canonical.owners.slice(1),
      },
      null,
      2,
    ) + "\n",
  );
  await assert.rejects(
    () => evaluateAppProductionComposition(root, appDefinition.appId),
    /App database manifest does not match canonical generated ownership/,
  );

  await writeFile(
    databasePath,
    JSON.stringify(
      {
        ...canonical,
        owners: canonical.owners.slice(0, -1),
      },
      null,
      2,
    ) + "\n",
  );
  await assert.rejects(
    () => evaluateAppProductionComposition(root, appDefinition.appId),
    /App database manifest does not match canonical generated ownership/,
  );

  await writeFile(databasePath, JSON.stringify(canonical, null, 2) + "\n");
  const result = await evaluateAppProductionComposition(
    root,
    appDefinition.appId,
  );
  assert.equal(result.compositionReady, true);
});

async function writeReadySampleApp(root, options = {}) {
  const appId = options.appId ?? "sample";
  const platformServices = options.platformServices ?? [];
  await mkdir(join(root, "apps", appId), { recursive: true });
  await writeFile(
    join(root, "apps", appId, "appbasis.app.json"),
    JSON.stringify(
      {
        schemaVersion: 2,
        appId,
        displayName: appId === "sample" ? "Sample" : "ULC Linz",
        modules: ["selected"],
        platformServices,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(root, "apps", appId, "appbasis.production.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        appId,
        modules: ["selected"],
        platformServices,
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
}

async function writeModule(root, moduleId, productionContract, evidenceFiles = {}, compatibilityVersions = [2]) {
  const moduleRoot = join(root, "modules", moduleId);
  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        moduleId,
        displayName: moduleId,
        packageName: `@appbasis/${moduleId}`,
        compatibility: { appDefinitionSchemaVersions: compatibilityVersions },
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
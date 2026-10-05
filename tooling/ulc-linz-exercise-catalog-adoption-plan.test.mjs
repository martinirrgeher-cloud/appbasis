import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  planUlcExerciseCatalogAdoption,
} from "./ulc-linz-exercise-catalog-adoption-plan.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("E6G-C1 produces a read-only exact ULC exercise-catalog adoption plan", async () => {
  const plan = await planUlcExerciseCatalogAdoption({ repositoryRoot });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.operation, "ulc-exercise-catalog-adoption");
  assert.equal(plan.state, "ready-for-isolated-adoption-proof");
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.source.ownerId, "ulc-linz-lifecycle");
  assert.equal(plan.source.ownerSchemaVersion, 8);
  assert.equal(plan.target.moduleId, "exercise-catalog");
  assert.equal(plan.target.schemaVersion, 2);
  assert.deepEqual(
    plan.copy.tables.map((table) => [
      table.sourceTable,
      table.targetTable,
    ]),
    [
      [
        "ulc_linz_exercise_catalog_item",
        "appbasis_exercise_catalog_item",
      ],
      [
        "ulc_linz_exercise_parameter",
        "appbasis_exercise_catalog_parameter",
      ],
      [
        "ulc_linz_exercise_group",
        "appbasis_exercise_catalog_audience",
      ],
      [
        "ulc_linz_exercise_favorite",
        "appbasis_exercise_catalog_favorite",
      ],
    ],
  );
  assert.equal(
    plan.copy.tables[2].columns.find(
      (column) => column.source === "group_id",
    )?.target,
    "audience_id",
  );
  assert.equal(
    plan.copy.tables[3].columns.find(
      (column) => column.source === "identity_id",
    )?.target,
    "principal_id",
  );
  assert.equal(plan.databaseAccess, false);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.cutoverGuard, {
    strategy: "quiesce-and-verify",
    quiesceSourceWritesBeforeFinalVerification: true,
    requireFinalMappedContentEquality: true,
    abortOnMismatch: true,
    runtimeSwitchOnlyAfterSuccessfulFinalVerification: true,
    releaseSourceWriteQuiescenceOnlyAfterCutoverOrRollback: true,
  });
  assert.equal(
    plan.verification.finalEqualityUnderSourceWriteQuiescence,
    true,
  );
  assert.deepEqual(
    plan.phases.map((phase) => phase.id),
    [
      "repository-install",
      "target-schema-migration",
      "copy-and-verify",
      "runtime-cutover",
      "source-retirement",
    ],
  );
  const runtimeCutover = plan.phases.find(
    (phase) => phase.id === "runtime-cutover",
  );
  assert.equal(
    runtimeCutover?.gate,
    "guarded-source-quiescence-and-final-equality",
  );
  assert.deepEqual(runtimeCutover?.prerequisites, [
    "source-writes-quiesced",
    "final-source-target-equality-pass",
  ]);
});

test("E6G-C1 fails closed when the pinned source migration drifts", async (t) => {
  const root = await createFixture(t);
  const path = join(
    root,
    "apps",
    "ulc-linz",
    "migrations",
    "0007_ulc_linz_exercise_catalog.sql",
  );
  await writeFile(path, (await readFile(path, "utf8")) + "\n-- drift\n");

  await assert.rejects(
    planUlcExerciseCatalogAdoption({ repositoryRoot: root }),
    /source migration content drifted/,
  );
});

test("E6G-C1 refuses a target owner that is already present", async (t) => {
  const root = await createFixture(t);
  const path = join(root, "apps", "ulc-linz", "appbasis.database.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.owners.push({
    id: "exercise-catalog",
    root: "modules/exercise-catalog",
    schemaVersion: 2,
    migrations: [
      "modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
      "modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
    ],
  });
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");

  await assert.rejects(
    planUlcExerciseCatalogAdoption({ repositoryRoot: root }),
    /target owner is already present/,
  );
});

test("E6G-C1 refuses a weakened table mapping", async (t) => {
  const root = await createFixture(t);
  const path = join(
    root,
    "apps",
    "ulc-linz",
    "exercise-catalog-adoption.json",
  );
  const contract = JSON.parse(await readFile(path, "utf8"));
  contract.tables[3].columns = contract.tables[3].columns.filter(
    (column) => column.source !== "identity_id",
  );
  await writeFile(path, JSON.stringify(contract, null, 2) + "\n");

  await assert.rejects(
    planUlcExerciseCatalogAdoption({ repositoryRoot: root }),
    /table mapping drifted/,
  );
});

test("E6G-C1 refuses a weakened runtime cutover freshness guard", async (t) => {
  const root = await createFixture(t);
  const path = join(
    root,
    "apps",
    "ulc-linz",
    "exercise-catalog-adoption.json",
  );
  const contract = JSON.parse(await readFile(path, "utf8"));
  contract.cutoverGuard.abortOnMismatch = false;
  await writeFile(path, JSON.stringify(contract, null, 2) + "\n");

  await assert.rejects(
    planUlcExerciseCatalogAdoption({ repositoryRoot: root }),
    /guarded cutover contract drifted/,
  );
});

test("E6G-C1 requires the pre-adoption app state", async (t) => {
  const root = await createFixture(t);
  const path = join(root, "apps", "ulc-linz", "appbasis.app.json");
  const definition = JSON.parse(await readFile(path, "utf8"));
  definition.modules.push("exercise-catalog");
  await writeFile(path, JSON.stringify(definition, null, 2) + "\n");

  await assert.rejects(
    planUlcExerciseCatalogAdoption({ repositoryRoot: root }),
    /target module is already declared/,
  );
});

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-e6g-c1-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const paths = [
    "apps/ulc-linz/appbasis.app.json",
    "apps/ulc-linz/appbasis.database.json",
    "apps/ulc-linz/package.json",
    "apps/ulc-linz/exercise-catalog-adoption.json",
    "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
    "modules/exercise-catalog/appbasis.module.json",
    "modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
    "modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
  ];

  for (const relativePath of paths) {
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(repositoryRoot, relativePath), target);
  }
  return root;
}

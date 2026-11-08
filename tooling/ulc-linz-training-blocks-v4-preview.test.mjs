import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  classifyUlcTrainingBlocksV4PreviewShape,
  loadUlcTrainingBlocksV4PreviewPlan,
  UlcTrainingBlocksV4PreviewConfigurationError,
  UlcTrainingBlocksV4PreviewExecutionError,
} from "./ulc-linz-training-blocks-v4-preview.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

test("training-blocks category v4 migration is one additive target", async () => {
  const plan = await loadUlcTrainingBlocksV4PreviewPlan({ repositoryRoot });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "training-blocks");
  assert.equal(plan.target.schemaVersion, 4);
  assert.equal(
    plan.target.migrationPath,
    "modules/training-blocks/migrations/0003_appbasis_training_block_category.sql",
  );
  assert.equal(plan.migration.statements.length, 2);
  assert.ok(plan.deltaCatalogContract.some(
    (marker) => marker.kind === "column" &&
      marker.table === "appbasis_training_block_revision" &&
      marker.name === "category" && marker.present === true,
  ));
  assert.equal(plan.productionChanged, false);
});

test("training-blocks v4 category schema distinguishes absent, current and drifted delta", () => {
  assert.equal(classifyUlcTrainingBlocksV4PreviewShape({
    categoryColumn: false, categoryLengthConstraint: false,
  }), "migration-required");
  assert.equal(classifyUlcTrainingBlocksV4PreviewShape({
    categoryColumn: true, categoryLengthConstraint: true,
  }), "current");
  assert.throws(
    () => classifyUlcTrainingBlocksV4PreviewShape({
      categoryColumn: true, categoryLengthConstraint: false,
    }),
    UlcTrainingBlocksV4PreviewExecutionError,
  );
  assert.throws(
    () => classifyUlcTrainingBlocksV4PreviewShape({}),
    UlcTrainingBlocksV4PreviewConfigurationError,
  );
});

test("E7B9 v4 Preview gate supports the canonical published v6 module without falsely requiring v5/v6 DB tables", async () => {
  const manifest=JSON.parse(await readFile(
    new URL("../apps/ulc-linz/appbasis.database.json",import.meta.url),"utf8"));
  const owner=manifest.owners.find(x=>x.id==="training-blocks");
  assert.equal(owner.schemaVersion,6);
  assert.equal(owner.migrations.length,6);
  const plan=await loadUlcTrainingBlocksV4PreviewPlan({repositoryRoot});
  assert.equal(plan.target.schemaVersion,4);
  assert.equal(plan.migration.relativePath,
    "modules/training-blocks/migrations/0003_appbasis_training_block_category.sql");
  assert.ok(plan.targetCatalogContract.some(x=>
    x.kind==="column" && x.table==="appbasis_training_block_revision" &&
    x.name==="category" && x.present===true));
  const markers=plan.targetCatalogContract.map(x=>JSON.stringify(x)).join("\n");
  assert.doesNotMatch(markers,/appbasis_training_block_favorite_deletion/);
  assert.doesNotMatch(markers,/appbasis_training_block_usage_subject/);
  assert.ok(plan.targetCatalogContract.length>plan.deltaCatalogContract.length,
    "v4 target still validates its full foundational schema, not only category.");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";
import { buildGeneratedAppPreviewPlan } from "./generated-app-preview-plan.mjs";
import { buildUlcLinzD4PreviewPlan } from "./ulc-linz-d4-preview-plan.mjs";
import { loadGeneratedAppPreviewMigrationPlan } from "./generated-app-preview-migrate.mjs";
import { renderGeneratedPreviewWorker } from "./generated-preview-worker-template.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("ULC Linz satisfies the canonical generated preview contract for D4", async () => {
  const contract = await loadGeneratedAppPreviewContract(
    repositoryRoot,
    "ulc-linz",
  );

  assert.equal(contract.definition.appId, "ulc-linz");
  assert.deepEqual(contract.definition.modules, [
    "countdown",
    "athletes",
    "exercise-catalog",
  ]);
  assert.equal(contract.target.environment, "generated-preview-ulc-linz");
  assert.equal(contract.target.workerName, "appbasis-ulc-linz");
  assert.equal(contract.target.database, "appbasis_ulc_linz_preview");
  assert.equal(contract.databaseManifest.application, "ulc-linz");
});

test("ULC Linz is excluded from the generic generated preview lifecycle", async () => {
  await assert.rejects(
    buildGeneratedAppPreviewPlan({ appId: "ulc-linz" }),
    /must use the dedicated D4 preview lifecycle/,
  );
});

test("ULC Linz D4 dedicated preview plan resolves the reserved ULC target", async () => {
  const plan = await buildUlcLinzD4PreviewPlan();

  assert.equal(plan.appId, "ulc-linz");
  assert.equal(plan.environment, "generated-preview-ulc-linz");
  assert.equal(plan.workerName, "appbasis-ulc-linz");
  assert.equal(plan.migrationTarget, "appbasis_ulc_linz_preview");
  assert.equal(plan.entrypoint, "./worker/preview.ts");
});

test("ULC Linz D4 migration plan includes all app-owned lifecycle and security migrations", async () => {
  const { plan } = await loadGeneratedAppPreviewMigrationPlan({
    appId: "ulc-linz",
  });

  assert.equal(plan.length, 21);
  assert.deepEqual(
    plan
      .filter(({ ownerId }) => ownerId === "identity")
      .map(({ relativePath }) => relativePath),
    [
      "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
      "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
      "packages/identity/drizzle/0002_appbasis_identity_provisioning_audit.sql",
    ],
  );
  assert.deepEqual(
    plan
      .filter(({ ownerId }) => ownerId === "athletes")
      .map(({ relativePath }) => relativePath),
    [
      "modules/athletes/migrations/0000_appbasis_athletes_foundation.sql",
      "modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
    ],
  );
  assert.deepEqual(
    plan
      .filter(({ ownerId }) => ownerId === "exercise-catalog")
      .map(({ relativePath }) => relativePath),
    [
      "modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
      "modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
      "modules/exercise-catalog/migrations/0002_appbasis_exercise_catalog_parity.sql",
      "modules/exercise-catalog/migrations/0003_appbasis_exercise_catalog_private_media_delete_state.sql",
    ],
  );
  assert.deepEqual(
    plan
      .filter(({ ownerId }) => ownerId === "ulc-linz-lifecycle")
      .map(({ relativePath }) => relativePath),
    [
      "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
      "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
      "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
      "apps/ulc-linz/migrations/0004_ulc_linz_training_sessions.sql",
      "apps/ulc-linz/migrations/0005_ulc_linz_trainer_identity_audit.sql",
      "apps/ulc-linz/migrations/0006_ulc_linz_training_module_groups.sql",
      "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
    ],
  );
});

test("ULC Linz D4 uses the canonical generated preview wrapper without app-specific drift", async () => {
  const actual = await readFile(
    resolve(repositoryRoot, "apps/ulc-linz/worker/preview.ts"),
    "utf8",
  );
  const expected = renderGeneratedPreviewWorker({ appId: "ulc-linz" });

  assert.equal(actual, expected);
});

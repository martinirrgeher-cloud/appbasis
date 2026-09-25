import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";
import { buildGeneratedAppPreviewPlan } from "./generated-app-preview-plan.mjs";
import { loadGeneratedAppPreviewMigrationPlan } from "./generated-app-preview-migrate.mjs";
import { renderGeneratedPreviewWorker } from "./generated-preview-worker-template.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("ULC Linz satisfies the canonical generated preview contract for D4", async () => {
  const contract = await loadGeneratedAppPreviewContract(
    repositoryRoot,
    "ulc-linz",
  );

  assert.equal(contract.definition.appId, "ulc-linz");
  assert.deepEqual(contract.definition.modules, ["countdown"]);
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

test("ULC Linz D4 migration plan includes all app-owned lifecycle and security migrations", async () => {
  const { plan } = await loadGeneratedAppPreviewMigrationPlan({
    appId: "ulc-linz",
  });

  assert.equal(plan.length, 10);
  assert.deepEqual(
    plan
      .filter(({ ownerId }) => ownerId === "ulc-linz-lifecycle")
      .map(({ relativePath }) => relativePath),
    [
      "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
      "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
      "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
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

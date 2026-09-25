import assert from "node:assert/strict";
import test from "node:test";

import {
  createGeneratedAppPreviewDatabaseManifest,
  loadGeneratedAppPreviewMigrationPlan,
} from "./generated-app-preview-migrate.mjs";
import { verifyModuleDefinitions } from "./module-definition.mjs";

test("ignores inherited prototype keys when resolving app-specific preview owners", async () => {
  const definition = {
    schemaVersion: 2,
    appId: "constructor",
    displayName: "Constructor App",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  };
  const moduleDefinitions = await verifyModuleDefinitions();
  const manifest = createGeneratedAppPreviewDatabaseManifest(definition, {
    moduleDefinitions,
  });

  assert.ok(manifest);
  assert.equal(
    manifest.owners.some((owner) => owner.id === "unterrichtsverwaltung-master-data"),
    false,
  );
});

test("keeps app-owned Unterrichtsverwaltung migrations out of the generic generator but canonical in preview", async () => {
  const definition = {
    schemaVersion: 2,
    appId: "unterrichtsverwaltung",
    displayName: "Unterrichtsverwaltung",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  };
  const moduleDefinitions = await verifyModuleDefinitions();
  const manifest = createGeneratedAppPreviewDatabaseManifest(definition, {
    moduleDefinitions,
  });

  assert.equal(manifest?.owners.at(-1)?.id, "unterrichtsverwaltung-master-data");
  assert.deepEqual(manifest?.owners.at(-1)?.migrations, [
    "apps/unterrichtsverwaltung/migrations/0000_unterrichtsverwaltung_master_data.sql",
  ]);

  const { contract, plan } = await loadGeneratedAppPreviewMigrationPlan({
    appId: "unterrichtsverwaltung",
  });
  assert.equal(contract.definition.appId, "unterrichtsverwaltung");
  assert.equal(plan.at(-1)?.ownerId, "unterrichtsverwaltung-master-data");
  assert.equal(
    plan.at(-1)?.relativePath,
    "apps/unterrichtsverwaltung/migrations/0000_unterrichtsverwaltung_master_data.sql",
  );
});

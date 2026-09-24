import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";
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

test("ULC Linz D4 uses the canonical generated preview wrapper without app-specific drift", async () => {
  const actual = await readFile(
    resolve(repositoryRoot, "apps/ulc-linz/worker/preview.ts"),
    "utf8",
  );
  const expected = renderGeneratedPreviewWorker({ appId: "ulc-linz" });

  assert.equal(actual, expected);
});

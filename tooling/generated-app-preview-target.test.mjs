import assert from "node:assert/strict";
import test from "node:test";

import {
  defineGeneratedAppPreviewTarget,
  generatedPreviewDatabaseName,
  generatedPreviewWorkerName,
} from "./generated-app-preview-target.mjs";

test("derives isolated generic preview resource names from the app id", () => {
  assert.deepEqual(defineGeneratedAppPreviewTarget({ appId: "checklist" }), {
    appId: "checklist",
    environment: "generated-preview-checklist",
    migrationTarget: "generated-preview-checklist",
    workerName: "appbasis-checklist",
    hyperdriveName: "appbasis-checklist-preview",
    database: "appbasis_checklist_preview",
  });
});

test("keeps long app ids inside Cloudflare and PostgreSQL name bounds deterministically", () => {
  const appId = "a" + "b".repeat(62);
  const worker = generatedPreviewWorkerName(appId);
  const database = generatedPreviewDatabaseName(appId);

  assert.ok(worker.length <= 63);
  assert.ok(database.length <= 63);
  assert.match(worker, /^appbasis-[a-z0-9-]+-[0-9a-f]{8}$/);
  assert.match(database, /^appbasis_[a-z0-9_]+_[0-9a-f]{8}_preview$/);
  assert.equal(generatedPreviewWorkerName(appId), worker);
  assert.equal(generatedPreviewDatabaseName(appId), database);
});

test("rejects non-canonical app identifiers before deriving provider names", () => {
  for (const appId of ["", "Demo", "demo_", "demo-", "../demo", "a" + "b".repeat(63)]) {
    assert.throws(
      () => defineGeneratedAppPreviewTarget({ appId }),
      /appId must match/,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { generatedAppPreviewHyperdriveTarget } from "./generated-app-preview-hyperdrive.mjs";

test("derives a dedicated Hyperdrive target from the selected generated app", () => {
  assert.deepEqual(generatedAppPreviewHyperdriveTarget("checklist"), {
    appId: "checklist",
    environment: "generated-preview-checklist",
    name: "appbasis-checklist-preview",
    database: "appbasis_checklist_preview",
  });
});

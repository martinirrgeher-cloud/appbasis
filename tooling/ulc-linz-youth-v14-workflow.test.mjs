import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const path = resolve(root, ".github/workflows/ulc-linz-youth-v14-preview.yml");

test("isolated youth migration is manual, main-only, preview-only and requires apply", async () => {
  const workflow = await readFile(path, "utf8");
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.match(workflow, /options: \[inspect, migrate\]/);
  assert.match(workflow, /test "\$EXPECTED_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$APPROVED" = "1"/);
  assert.match(workflow, /name: generated-preview-ulc-linz/);
  assert.match(workflow, /group: generated-preview-ulc-linz/);
  assert.match(workflow, /appbasis_ulc_linz_preview/);
  assert.match(workflow, /appbasis_ulc_linz_preview_migration/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /appbasis_ulc_linz_production|APPBASIS_PRODUCTION|secrets\.PRODUCTION/);
  assert.doesNotMatch(workflow, /training-blocks-v4-preview|training-documentation-preview|training-plans-preview/);
});

test("youth v13 and v14 operations are ordered, conditional, and verified with role reconciliation", async () => {
  const workflow = await readFile(path, "utf8");
  const steps = [
    "Inspect v13",
    "Apply v13 when required",
    "Verify v13 before v14",
    "Inspect v14",
    "Apply v14 when required",
    "Reconcile preview runtime database access",
    "Verify v13 after migration",
    "Verify v14 after migration",
    "Verify preview runtime database access",
  ];
  let previous = -1;
  for (const step of steps) {
    const index = workflow.indexOf("- name: " + step);
    assert.ok(index > previous, "Missing or unordered step: " + step);
    previous = index;
  }
  assert.match(workflow, /steps\.v13\.outputs\.state == 'migration-required'/);
  assert.match(workflow, /steps\.v14\.outputs\.state == 'migration-required'/);
  assert.match(workflow, /inputs\.operation == 'migrate' && steps\.v14\.outputs\.state == 'migration-required'/);
  assert.match(workflow, /APPBASIS_APPLY_YOUTH_CONTENT_PREVIEW: "1"/);
  assert.match(workflow, /APPBASIS_APPLY_YOUTH_CATEGORIES_PREVIEW: "1"/);
  assert.match(workflow, /APPBASIS_APPLY_DATABASE_ACCESS: "1"/);
  assert.match(workflow, /ulc-linz-youth-content-preview\.mjs verify/);
  assert.match(workflow, /ulc-linz-youth-categories-preview\.mjs verify/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs preflight-existing/);
});

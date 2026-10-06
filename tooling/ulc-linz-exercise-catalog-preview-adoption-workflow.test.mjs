import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowPath = join(
  repositoryRoot,
  ".github/workflows/ulc-linz-e6g-c3b-preview-adoption.yml",
);

test("E6G-C3B workflow is manual, main-only and requires explicit apply", async () => {
  const source = await readFile(workflowPath, "utf8");

  assert.match(source, /\n  workflow_dispatch:\n/);
  assert.doesNotMatch(source, /\n  push:\n/);
  assert.match(source, /type: boolean/);
  assert.match(source, /default: false/);
  assert.match(source, /refs\/heads\/main/);
  assert.match(
    source,
    /if: \$\{\{ inputs\.apply == true \}\}/,
  );
  assert.match(source, /name: generated-preview-ulc-linz/);
  assert.match(
    source,
    /APPBASIS_MIGRATION_TARGET: appbasis_ulc_linz_preview/,
  );
  assert.match(source, /APPBASIS_APPLY_MIGRATIONS: "1"/);
  assert.match(
    source,
    /APPBASIS_APPLY_EXERCISE_CATALOG_ADOPTION: "1"/,
  );
  assert.match(
    source,
    /secrets\.APPBASIS_MIGRATION_DATABASE_URL/,
  );
  assert.match(source, /secrets\.APPBASIS_DATABASE_URL/);
  assert.match(
    source,
    /secrets\.APPBASIS_SECURITY_LOG_DATABASE_URL/,
  );
  assert.match(
    source,
    /ulc-linz-d4-preview-migration-state\.mjs/,
  );
  assert.match(source, /\.mode.*current|current ULC preview source schema/s);
  assert.match(
    source,
    /ulc-linz-exercise-catalog-preview-adoption-apply\.mjs/,
  );
  assert.match(source, /Runtime cutover was not executed/);
  assert.doesNotMatch(source, /wrangler deploy/);
  assert.doesNotMatch(source, /runtime-cutover/i);
});

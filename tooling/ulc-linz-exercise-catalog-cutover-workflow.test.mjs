import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowPath = join(
  repositoryRoot,
  ".github/workflows/ulc-linz-e6g-c3c-runtime-cutover.yml",
);

test("E6G-C3C workflow enforces quiesce before standard runtime cutover", async () => {
  const source = await readFile(workflowPath, "utf8");

  assert.match(source, /\n  workflow_dispatch:\n/);
  assert.doesNotMatch(source, /\n  push:\n/);
  assert.match(source, /- inspect\n/);
  assert.match(source, /- quiesce\n/);
  assert.match(source, /- cutover\n/);
  assert.match(source, /default: false/);
  assert.match(source, /refs\/heads\/main/);
  assert.match(source, /name: generated-preview-ulc-linz/);
  assert.match(
    source,
    /api\/health\/exercise-catalog-storage/,
  );
  assert.match(source, /quiesce:legacy\|cutover:quiesced/);
  assert.match(
    source,
    /ulc-linz-exercise-catalog-cutover-readiness\.mjs/,
  );
  assert.match(
    source,
    /ulc-linz-exercise-catalog-cutover-access\.mjs inspect/,
  );
  assert.match(
    source,
    /ulc-linz-exercise-catalog-cutover-access\.mjs quiesce/,
  );
  assert.match(
    source,
    /ulc-linz-exercise-catalog-cutover-access\.mjs standard/,
  );
  assert.match(
    source,
    /APPBASIS_APPLY_EXERCISE_CATALOG_CUTOVER_ACCESS: "1"/,
  );
  assert.match(source, /exerciseCatalogStorageMode: mode/);
  assert.match(source, /mode =.*quiesced.*standard/s);
  assert.match(source, /Enforce database Source quiescence/);
  assert.match(source, /Re-verify equality after write quiescence/);
  assert.match(source, /Source DML revoked/);
  assert.match(
    source,
    /Standard runtime cutover remains separately authorized/,
  );
  assert.match(source, /Production was not modified/);
  assert.doesNotMatch(source, /appbasis-ulc-linz-production/);
});

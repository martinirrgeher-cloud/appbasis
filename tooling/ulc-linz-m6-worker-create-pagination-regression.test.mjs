import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/m6-ulc-production-worker-create.yml",
);

test("M6 Worker inventory validates returned page identity and stable pagination", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /const seenPages = new Set\(\);/);
  assert.match(workflow, /let expectedTotalPages;/);
  assert.match(workflow, /const returnedPage = payload\?\.result_info\?\.page;/);
  assert.match(workflow, /!Number\.isInteger\(returnedPage\)/);
  assert.match(workflow, /returnedPage !== page/);
  assert.match(workflow, /seenPages\.has\(returnedPage\)/);
  assert.match(workflow, /seenPages\.add\(returnedPage\)/);
  assert.match(workflow, /totalPages !== expectedTotalPages/);
  assert.match(workflow, /pagination metadata is invalid, duplicated or misaligned/);
  assert.match(workflow, /total_pages changed during inventory/);
});

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

test("M6 Worker create reconciles interrupted exact-target creates before create gates", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /- name: Reconcile an already-existing exact Worker before create gates/);
  assert.match(workflow, /id: reconcile/);
  assert.match(workflow, /workers\/workers\/\$TARGET_WORKER/);
  assert.match(workflow, /if \[ "\$STATUS" = "404" \]; then/);
  assert.match(workflow, /echo 'mode=create' >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /echo 'mode=reconciled' >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /Existing exact ULC production Worker is not provably closed and undeployed/);
  assert.match(workflow, /if: steps\.reconcile\.outputs\.mode == 'create'/);
  assert.match(workflow, /if: always\(\) && steps\.reconcile\.outputs\.mode == 'create'/);
  assert.equal((workflow.match(/timeout-minutes: 4/g) ?? []).length, 2);
  assert.match(workflow, /m6-worker-reconcile\.json/);
});

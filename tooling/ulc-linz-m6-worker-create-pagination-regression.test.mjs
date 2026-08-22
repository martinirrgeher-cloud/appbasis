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

function extractWorkerInventoryProgram(workflow) {
  const startMarker = "          function isUlcProductionCandidate(name) {";
  const endMarker = "          NODE\n          echo 'Fresh provider state";
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start);
  assert.notEqual(start, -1, "worker inventory program start must exist");
  assert.notEqual(end, -1, "worker inventory program end must exist");
  return workflow.slice(start, end);
}

function makeWorkers(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({ name: `${prefix}-${index}` }));
}

test("M6 Worker inventory accepts optional pagination metadata without weakening completeness checks", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /const seenWorkerNames = new Set\(\);/);
  assert.match(workflow, /let expectedTotalPages;/);
  assert.match(workflow, /let expectedPerPage;/);
  assert.match(workflow, /const resultInfo = payload\?\.result_info;/);
  assert.match(workflow, /returnedPage !== undefined/);
  assert.match(workflow, /totalPages !== undefined/);
  assert.match(workflow, /returnedPerPage !== undefined/);
  assert.match(workflow, /expectedTotalPages !== undefined && totalPages === undefined/);
  assert.match(workflow, /expectedPerPage !== undefined && returnedPerPage === undefined/);
  assert.match(workflow, /returnedPerPage !== expectedPerPage/);
  assert.match(workflow, /seenWorkerNames\.has\(worker\.name\)/);
  assert.match(workflow, /effectivePerPage = expectedPerPage \?\? perPage/);
  assert.match(workflow, /payload\.result\.length < effectivePerPage/);
  assert.match(workflow, /Cloudflare Beta Worker inventory repeated a Worker across pages/);
  assert.match(workflow, /Cloudflare Beta Worker inventory exceeded the safe pagination bound/);
  assert.match(workflow, /if \(!inventoryComplete\)/);
});

test("M6 Worker inventory fails closed when observed per_page disappears on a later full page", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const program = extractWorkerInventoryProgram(workflow);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "fetch",
    "AbortSignal",
    "accountId",
    "token",
    "target",
    "maxPages",
    "perPage",
    `${program}\nreturn inventoryComplete;`,
  );

  const responses = [
    {
      success: true,
      result: makeWorkers("page-1-worker", 20),
      result_info: { page: 1, per_page: 20 },
    },
    {
      success: true,
      result: makeWorkers("page-2-worker", 20),
    },
    {
      success: true,
      result: [{ name: "appbasis-ulc-linz-production" }],
    },
  ];
  const requestedPages = [];
  const mockFetch = async (url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    requestedPages.push(page);
    const payload = responses[page - 1];
    assert.ok(payload, `unexpected page ${page}`);
    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  };

  await assert.rejects(
    execute(
      mockFetch,
      { timeout: () => undefined },
      "account-id",
      "token",
      "appbasis-ulc-linz-production",
      100,
      100,
    ),
    /Cloudflare Beta Worker per_page disappeared during inventory/,
  );
  assert.deepEqual(requestedPages, [1, 2]);
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

test("M6 Worker reconciliation, create response and read-back prove every closed writable field", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /!Array\.isArray\(existing\?\.tags\)/);
  assert.match(workflow, /existing\.tags\.length !== 0/);
  assert.match(workflow, /existing\?\.observability\?\.enabled !== false/);
  assert.match(workflow, /existing\?\.logpush !== false/);
  assert.match(workflow, /!Array\.isArray\(existing\?\.tail_consumers\)/);
  assert.match(workflow, /existing\.tail_consumers\.length !== 0/);

  assert.equal((workflow.match(/!Array\.isArray\(result\?\.tags\)/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\.tags\.length !== 0/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\?\.observability\?\.enabled !== false/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\?\.logpush !== false/g) ?? []).length, 2);
  assert.equal((workflow.match(/!Array\.isArray\(result\?\.tail_consumers\)/g) ?? []).length, 2);
  assert.equal((workflow.match(/result\.tail_consumers\.length !== 0/g) ?? []).length, 2);
});

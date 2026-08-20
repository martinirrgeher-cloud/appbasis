import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EXPECTED_EXACT_HEAD_REF =
  "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";

test("CI checks out the literal pull request head in every job", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const checkoutCount = [...workflow.matchAll(/uses: actions\/checkout@/gu)].length;
  const exactHeadCount = workflow.split(EXPECTED_EXACT_HEAD_REF).length - 1;

  assert.equal(checkoutCount, 2);
  assert.equal(exactHeadCount, checkoutCount);
  assert.equal(workflow.includes("github.event.pull_request.head.sha"), true);
});

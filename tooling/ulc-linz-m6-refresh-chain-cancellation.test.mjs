import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH_CHAIN = new URL("../.github/workflows/m6-ulc-production-refresh-chain.yml", import.meta.url);

test("M6 refresh chain propagates parent cancellation to the exact dispatched child", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    'echo "M6_CHILD_RUN_ID=$run_id"',
    'echo "M6_CHILD_WORKFLOW=$workflow"',
    'echo "M6_CHILD_LABEL=$label"',
    "trap cancel_on_signal TERM INT",
    "parent received a cancellation signal",
    "- name: Cancel exact child if parent is cancelled",
    "if: ${{ cancelled() && env.M6_CHILD_RUN_ID != '' }}",
    'run_id="$M6_CHILD_RUN_ID"',
    'workflow="$M6_CHILD_WORKFLOW"',
    'gh run cancel "$run_id" --repo "$GITHUB_REPOSITORY" || true',
    "parent workflow was cancelled; cancelling exact child run",
    "parent-cancellation status poll failed transiently",
    "after parent cancellation",
    "propagates manual cancellation to that child",
  ]) {
    assert.equal(source.includes(marker), true, `missing parent-cancellation guard: ${marker}`);
  }
});

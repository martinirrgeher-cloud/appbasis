import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH_CHAIN = new URL("../.github/workflows/m6-ulc-production-refresh-chain.yml", import.meta.url);

test("M6 refresh chain bounds child tracking and cleanup by wall clock", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "local wait_deadline=$(( $(date +%s) + 9000 ))",
    'while test "$(date +%s)" -lt "$wait_deadline"',
    "wall-clock 150-minute queue/execution wait deadline",
    "local cleanup_deadline=$(( $(date +%s) + 1200 ))",
    'while test "$(date +%s)" -lt "$cleanup_deadline"',
    "reserved 20-minute cleanup window",
    "150-minute wall-clock child wait",
    "20-minute wall-clock cleanup window",
    "timeout-minutes: 180",
  ]) {
    assert.equal(source.includes(marker), true, `missing wall-clock refresh-chain guard: ${marker}`);
  }

  assert.equal(source.includes("for _ in $(seq 1 1800)"), false);
  assert.equal(source.includes("for _ in $(seq 1 120)"), false);
});

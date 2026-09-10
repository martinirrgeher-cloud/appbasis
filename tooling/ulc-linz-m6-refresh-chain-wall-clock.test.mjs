import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH_CHAIN = new URL("../.github/workflows/m6-ulc-production-refresh-chain.yml", import.meta.url);

test("M6 refresh chain bounds dispatch recovery, child tracking and cleanup by wall clock", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "CHAIN_WORK_DEADLINE=$(( $(date +%s) + 9000 ))",
    "local discovery_deadline=$(( $(date +%s) + 1200 ))",
    'if test "$discovery_deadline" -gt "$CHAIN_WORK_DEADLINE"',
    'local wait_deadline="$CHAIN_WORK_DEADLINE"',
    'while test "$(date +%s)" -lt "$wait_deadline"',
    "Exceeded the shared wall-clock work deadline.",
    "local cleanup_deadline=$(( $(date +%s) + 1200 ))",
    'while test "$(date +%s)" -lt "$cleanup_deadline"',
    "reserved 20-minute cleanup window",
    "shares one 150-minute wall-clock work budget across dispatch recovery and child waiting",
    "timeout-minutes: 180",
  ]) {
    assert.equal(source.includes(marker), true, `missing wall-clock refresh-chain guard: ${marker}`);
  }

  assert.equal(source.includes("local wait_deadline=$(( $(date +%s) + 9000 ))"), false);
  assert.equal(source.includes("for _ in $(seq 1 1800)"), false);
  assert.equal(source.includes("for _ in $(seq 1 120)"), false);
});

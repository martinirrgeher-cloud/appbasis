import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production retention preflight redacts backup self-check and cleanup failures", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-security-log-retention.yml", import.meta.url),
    "utf8",
  );
  const preflightStep = workflow.match(
    /- name: Verify canonical protected audit access boundary before production delete[\s\S]*?- name: Run exact server-owned twelve-calendar-month cleanup/,
  )?.[0] ?? "";

  assert.match(preflightStep, /catch \{[\s\S]*ULC Linz M5-F production retention pre-delete verification failed\.[\s\S]*process\.exitCode = 1/);
  assert.match(preflightStep, /finally \{[\s\S]*await Promise\.all\([\s\S]*rm\(value, \{ force: true \}\)[\s\S]*catch \{[\s\S]*process\.exitCode = 1/);
  assert.doesNotMatch(preflightStep, /catch \([^)]*\) \{[\s\S]*console\.(?:error|log)\([^\n]*(?:error|message|stack)/);
});

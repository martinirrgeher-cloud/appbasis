import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("backup-role diagnostic emits only bounded failure phases for observer failures", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-security-log-retention-backup-role-diagnostic.yml", import.meta.url),
    "utf8",
  );

  for (const phase of ["binding", "connect", "catalog-query", "classification", "close", "complete"]) {
    assert.match(workflow, new RegExp(`phase = '${phase}'`));
  }
  assert.match(workflow, /await connection\.client\.unsafe\('SELECT 1 AS diagnostic_probe'\)/);
  assert.match(workflow, /failurePhase: phase/);
  assert.match(workflow, /ULC Linz M5-F backup role diagnostic failed\./);
  assert.match(workflow, /process\.exitCode = 1/);
  assert.doesNotMatch(workflow, /catch \([^)]*\) \{[\s\S]*console\.(?:error|log)\([^\n]*(?:error|message|stack)/);
  assert.doesNotMatch(workflow, /failurePhase:[^\n]*(?:error|message|stack|host|database|user|role)/i);
});

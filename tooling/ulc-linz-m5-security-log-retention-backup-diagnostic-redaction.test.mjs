import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("backup-role diagnostic redacts observer database failures", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-security-log-retention-backup-role-diagnostic.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /catch \{[\s\S]*ULC Linz M5-F backup role diagnostic failed\.[\s\S]*process\.exitCode = 1/);
  assert.match(workflow, /connection\?\.client\.end\(\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(workflow, /catch \([^)]*\) \{[\s\S]*console\.(?:error|log)\([^\n]*(?:error|message|stack)/);
});

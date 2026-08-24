import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url);
const restoredExportTestUrl = new URL(
  "../apps/ulc-linz/test/restored-production-export.postgres.e2e.test.ts",
  import.meta.url,
);

test("M5 restore evidence executes canonical authorized data export before attesting application smoke", async () => {
  const [workflow, restoredExportTest] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(restoredExportTestUrl, "utf8"),
  ]);

  const restoreTestIndex = workflow.indexOf("./test/restored-production.postgres.e2e.test.ts");
  const exportTestIndex = workflow.indexOf("./test/restored-production-export.postgres.e2e.test.ts");
  const observationIndex = workflow.indexOf("Record sanitized controlled restore observation");
  assert.ok(restoreTestIndex >= 0);
  assert.ok(exportTestIndex > restoreTestIndex);
  assert.ok(observationIndex > exportTestIndex);

  assert.match(restoredExportTest, /PostgresUlcLinzExportDatasetReader/);
  assert.match(restoredExportTest, /exportUlcLinzDataWithCanonicalAuthorization/);
  assert.match(restoredExportTest, /PostgresUlcLinzScopePersistence/);
  assert.match(restoredExportTest, /PostgresPermissionStore/);
  assert.match(restoredExportTest, /scope: "organization"/);
  assert.match(restoredExportTest, /AUTHORIZATION_MISMATCH/);
  assert.match(restoredExportTest, /expect\(readDatasets\)\.not\.toHaveBeenCalled\(\)/);
  assert.match(restoredExportTest, /expect\(recordExportAudit\)\.toHaveBeenCalledTimes\(1\)/);
});

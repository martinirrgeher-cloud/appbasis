import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cleanup security-log evidence keeps TRUNCATE fail-closed", async () => {
  const source = await readFile(
    new URL("./ulc-linz-m5-security-log-access-evidence.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /"tableSelect", "tableInsert", "tableDelete", "tableUpdate", "tableTruncate", "anyColumnInsert", "anyColumnUpdate"/,
  );
  assert.match(
    source,
    /cleanup\.tableSelect \|\| cleanup\.tableInsert \|\| cleanup\.tableDelete \|\| cleanup\.tableUpdate \|\| cleanup\.tableTruncate/,
  );
  assert.match(
    source,
    /tableUpdate: row\.table_update, tableTruncate: row\.table_truncate,/,
  );
});

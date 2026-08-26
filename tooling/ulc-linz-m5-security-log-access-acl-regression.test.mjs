import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SOURCE_URL = new URL("./ulc-linz-m5-security-log-access-evidence.mjs", import.meta.url);

test("column ACL inventory preserves PostgreSQL null ACL semantics", async () => {
  const source = await readFile(SOURCE_URL, "utf8");

  assert.match(
    source,
    /CROSS JOIN LATERAL pg_catalog\.aclexplode\(attribute\.attacl\) acl/,
  );
  assert.doesNotMatch(
    source,
    /COALESCE\(attribute\.attacl,\s*ARRAY\[\]::aclitem\[\]\)/,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SOURCE_URL = new URL("./ulc-linz-m5-security-log-access-evidence.mjs", import.meta.url);
const RESTORE_E2E_URL = new URL(
  "../apps/ulc-linz/test/restored-production.postgres.e2e.test.ts",
  import.meta.url,
);
const DIRECT_NULL_ACL_PATTERN =
  /CROSS JOIN LATERAL pg_catalog\.aclexplode\(attribute\.attacl\) acl/;
const DIMENSIONLESS_EMPTY_ACL_PATTERN =
  /COALESCE\(attribute\.attacl,\s*ARRAY\[\]::aclitem\[\]\)/;

test("column ACL inventory preserves PostgreSQL null ACL semantics", async () => {
  const [source, restoreE2e] = await Promise.all([
    readFile(SOURCE_URL, "utf8"),
    readFile(RESTORE_E2E_URL, "utf8"),
  ]);

  for (const implementation of [source, restoreE2e]) {
    assert.match(implementation, DIRECT_NULL_ACL_PATTERN);
    assert.doesNotMatch(implementation, DIMENSIONLESS_EMPTY_ACL_PATTERN);
  }
});
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

test("restore ACL inventory distinguishes operational memberships from safe creator back-references", async () => {
  const restoreE2e = await readFile(RESTORE_E2E_URL, "utf8");

  assert.match(restoreE2e, /grantor\.rolsuper AS grantor_superuser/);
  assert.match(restoreE2e, /membership\.inherit_option/);
  assert.match(restoreE2e, /membership\.set_option/);
  assert.match(restoreE2e, /member === membershipBoundary\.restoreOwner/);
  assert.match(restoreE2e, /expect\(row\.grantor_superuser\)\.toBe\(true\)/);
  assert.match(restoreE2e, /expect\(row\.admin_option\)\.toBe\(true\)/);
  assert.match(restoreE2e, /expect\(row\.inherit_option\)\.toBe\(false\)/);
  assert.match(restoreE2e, /expect\(row\.set_option\)\.toBe\(false\)/);
  assert.match(restoreE2e, /expectedOperationalMembers/);
  assert.match(restoreE2e, /readRestoredAuditObjectOwner/);
  assert.match(restoreE2e, /pg_catalog\.pg_get_userbyid\(relation\.relowner\)/);
  assert.match(restoreE2e, /pg_catalog\.pg_get_userbyid\(procedure\.proowner\)/);
  assert.match(restoreE2e, /expect\(uniqueOwners\.size\)\.toBe\(1\)/);
  assert.match(restoreE2e, /restoreOwner,\s*\n\s*operationalMembers:/);
  assert.doesNotMatch(restoreE2e, /restoreOwner:\s*target\.username/);
  assert.doesNotMatch(
    restoreE2e,
    /expect\(membershipRows\)\.toHaveLength\(SECURITY_GROUPS\.length\)/,
  );
});

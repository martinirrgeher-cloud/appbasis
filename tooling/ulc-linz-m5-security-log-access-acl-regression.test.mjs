import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const SOURCE_URL = new URL("./ulc-linz-m5-security-log-access-evidence.mjs", import.meta.url);
const RESTORE_E2E_URL = new URL(
  "../apps/ulc-linz/test/restored-production.postgres.e2e.test.ts",
  import.meta.url,
);
const PRIVATE_SMOKE_WORKFLOW_URL = new URL(
  "../.github/workflows/m5-ulc-private-security-smoke.yml",
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

test("live and restore ACL inventories distinguish operational memberships from safe creator back-references", async () => {
  const [source, restoreE2e] = await Promise.all([
    readFile(SOURCE_URL, "utf8"),
    readFile(RESTORE_E2E_URL, "utf8"),
  ]);

  assert.match(source, /grantor\.rolsuper AS grantor_superuser/);
  assert.match(source, /membership\.inherit_option AS inherit_option/);
  assert.match(source, /membership\.set_option AS set_option/);
  assert.match(source, /count\(DISTINCT owner\.rolname\)::integer AS distinct_owner_count/);
  assert.match(source, /const protectedOwner = roleName\(ownerRows\[0\]\.owner_name\)/);
  assert.match(source, /const protectedParentRoles = new Set\(protectedRoles\)/);
  assert.match(source, /member === protectedOwner && protectedParentRoles\.has\(parent\)/);
  assert.match(source, /bool\(row\.grantor_superuser\) === true/);
  assert.match(source, /bool\(row\.admin_option\) === true/);
  assert.match(source, /bool\(row\.inherit_option\) === false/);
  assert.match(source, /bool\(row\.set_option\) === false/);
  assert.match(source, /!seenCreatorBackReferences\.has\(parent\)/);
  assert.match(source, /bool\(row\.admin_option\) === false/);
  assert.match(source, /bool\(row\.inherit_option\) === true/);
  assert.match(source, /bool\(row\.set_option\) === true/);

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
  assert.match(restoreE2e, /decodeCredentialPrincipal\(target\.username\)/);
  assert.match(restoreE2e, /decodeCredentialPrincipal\(ingestTarget\.username\)/);
  assert.match(restoreE2e, /decodeCredentialPrincipal\(readTarget\.username\)/);
  assert.match(restoreE2e, /return decodeURIComponent\(username\)/);
  assert.match(restoreE2e, /restoreOwner,\s*\n\s*operationalMembers:/);
  assert.match(restoreE2e, /\["ulc_linz_security_event_ingest", ingestPrincipal\]/);
  assert.match(restoreE2e, /\["ulc_linz_security_event_read", readPrincipal\]/);
  assert.doesNotMatch(restoreE2e, /restoreOwner:\s*target\.username/);
  assert.doesNotMatch(restoreE2e, /operationalMembers:[\s\S]*ingestTarget\.username/);
  assert.doesNotMatch(restoreE2e, /operationalMembers:[\s\S]*readTarget\.username/);
  assert.doesNotMatch(
    restoreE2e,
    /expect\(membershipRows\)\.toHaveLength\(SECURITY_GROUPS\.length\)/,
  );
});

test("live ACL evidence binds the exact dedicated backup principal and grants", async () => {
  const [source, workflow] = await Promise.all([
    readFile(SOURCE_URL, "utf8"),
    readFile(PRIVATE_SMOKE_WORKFLOW_URL, "utf8"),
  ]);

  assert.match(source, /const backup = parseUlcLinzProductionDatabaseUrl\(backupDatabaseUrl\)/);
  assert.match(source, /backup\.host !== production\.host \|\| backup\.database !== production\.database/);
  assert.match(source, /backup: roleName\(backup\.user\)/);
  assert.match(source, /new Set\(Object\.values\(users\)\)\.size !== 5/);
  assert.match(source, /role\(client, users\.backup\)/);
  assert.match(source, /backupRole\.login !== true \|\| elevated\(backupRole\)/);
  assert.match(source, /memberships\(backupRole\)\.length !== 0/);
  assert.match(source, /grantKey\("table", "ulc_linz_security_event_log", null, backup, "SELECT"\)/);
  assert.match(source, /grantKey\("sequence", "ulc_linz_security_event_log_id_seq", null, backup, "SELECT"\)/);
  assert.doesNotMatch(source, /verifyImplicitBackupReadOnlyGrants/);

  assert.match(workflow, /ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL: \$\{\{ secrets\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL \}\}/);
  assert.match(workflow, /parseUlcLinzProductionDatabaseUrl\(process\.env\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL\)/);
  assert.match(workflow, /new Set\(urls\.map\(\(entry\) => entry\.user\)\)\.size !== 5/);
  assert.match(workflow, /backupDatabaseUrl: process\.env\.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL/);
});

test("all exact ULC production database credentials reject a noncanonical port", () => {
  assert.throws(
    () => parseUlcLinzProductionDatabaseUrl(
      "postgresql://backup:pw@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech:6432/neondb",
    ),
    /exact ULC production Neon endpoint/,
  );
});

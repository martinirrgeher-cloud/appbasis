import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateUlcLinzM5SecurityLogAccessSnapshot } from "./ulc-linz-m5-security-log-access-evidence.mjs";

function role(name, { login = false, memberships = [], membershipAdminOption = false } = {}) {
  return {
    name,
    login,
    superuser: false,
    createDb: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    membershipAdminOption,
    memberships,
  };
}

function validSnapshot() {
  return {
    applicationRole: role("ulc_application_login", { login: true }),
    groupRoles: {
      ingest: role("ulc_linz_security_event_ingest"),
      cleanup: role("ulc_linz_security_event_cleanup"),
      read: role("ulc_linz_security_event_read"),
    },
    loginRoles: {
      ingest: role("ulc_security_ingest_login", {
        login: true,
        memberships: ["ulc_linz_security_event_ingest"],
      }),
      cleanup: role("ulc_security_cleanup_login", {
        login: true,
        memberships: ["ulc_linz_security_event_cleanup"],
      }),
      read: role("ulc_security_read_login", {
        login: true,
        memberships: ["ulc_linz_security_event_read"],
      }),
    },
    applicationPrivileges: {
      tableSelect: false,
      tableInsert: false,
      tableDelete: false,
      tableUpdate: false,
      tableTruncate: false,
      anyColumnSelect: false,
      anyColumnInsert: false,
      anyColumnUpdate: false,
      sequenceUsage: false,
      sequenceSelect: false,
      sequenceUpdate: false,
      cleanupExecute: false,
    },
    ingestPrivileges: {
      tableSelect: false,
      tableDelete: false,
      tableUpdate: false,
      tableTruncate: false,
      anyColumnSelect: false,
      anyColumnUpdate: false,
      allowedColumnInsert: true,
      forbiddenColumnInsert: false,
      identityColumnInsert: false,
      recordedAtColumnInsert: false,
      sequenceUsage: true,
      sequenceSelect: false,
      sequenceUpdate: false,
      cleanupExecute: false,
    },
    cleanupPrivileges: {
      tableSelect: false,
      tableInsert: false,
      tableDelete: false,
      tableUpdate: false,
      tableTruncate: false,
      anyColumnInsert: false,
      anyColumnUpdate: false,
      retainedUntilSelect: true,
      forbiddenColumnSelect: false,
      eventDataSelect: false,
      sequenceUsage: false,
      sequenceSelect: false,
      sequenceUpdate: false,
      cleanupExecute: true,
    },
    readPrivileges: {
      tableSelect: true,
      tableInsert: false,
      tableDelete: false,
      tableUpdate: false,
      tableTruncate: false,
      anyColumnInsert: false,
      anyColumnUpdate: false,
      sequenceUsage: false,
      sequenceSelect: false,
      sequenceUpdate: false,
      cleanupExecute: false,
    },
    aclBoundary: {
      missingExpectedGrantCount: 0,
      unexpectedProtectedGrantCount: 0,
      protectedGrantOptionCount: 0,
      protectedOwnerCount: 0,
      unexpectedGroupMemberCount: 0,
      groupMembershipAdminOptionCount: 0,
    },
    retentionContract: {
      calendarConstraintVerified: true,
      cleanupFunctionVerified: true,
      publicFunctionExecute: false,
      unexpectedTriggerCount: 0,
    },
  };
}

test("accepts only the exact three-principal least-privilege M5-F access boundary", () => {
  assert.deepEqual(evaluateUlcLinzM5SecurityLogAccessSnapshot(validSnapshot()), {
    leastPrivilegeAccessVerified: true,
    protectedOperationalAccessVerified: true,
    providerMinimumRetentionVerified: true,
  });
});

test("rejects an elevated or delegated application database role before ACL evidence can pass", () => {
  for (const mutate of [
    (value) => { value.applicationRole.login = false; },
    (value) => { value.applicationRole.superuser = true; },
    (value) => { value.applicationRole.createDb = true; },
    (value) => { value.applicationRole.createRole = true; },
    (value) => { value.applicationRole.replication = true; },
    (value) => { value.applicationRole.bypassRls = true; },
    (value) => { value.applicationRole.membershipAdminOption = true; },
    (value) => { value.applicationRole.memberships.push("unexpected_parent") },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(
      () => evaluateUlcLinzM5SecurityLogAccessSnapshot(value),
      /application database role is not least privilege/,
    );
  }
});

test("rejects any application-role access to the security-event owner", () => {
  for (const field of [
    "tableSelect",
    "tableInsert",
    "tableDelete",
    "tableUpdate",
    "tableTruncate",
    "anyColumnSelect",
    "anyColumnInsert",
    "anyColumnUpdate",
    "sequenceUsage",
    "sequenceSelect",
    "sequenceUpdate",
    "cleanupExecute",
  ]) {
    const value = validSnapshot();
    value.applicationPrivileges[field] = true;
    assert.throws(
      () => evaluateUlcLinzM5SecurityLogAccessSnapshot(value),
      /application role can access the security log/,
    );
  }
});

test("rejects elevated, delegated or cross-group role boundaries", () => {
  for (const mutate of [
    (value) => { value.groupRoles.ingest.login = true; },
    (value) => { value.groupRoles.cleanup.superuser = true; },
    (value) => { value.groupRoles.read.createRole = true; },
    (value) => { value.groupRoles.read.membershipAdminOption = true; },
    (value) => { value.loginRoles.ingest.bypassRls = true; },
    (value) => { value.loginRoles.ingest.membershipAdminOption = true; },
    (value) => { value.loginRoles.cleanup.memberships.push("ulc_linz_security_event_read"); },
    (value) => { value.loginRoles.read.memberships = []; },
    (value) => { value.loginRoles.read.name = value.loginRoles.cleanup.name; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(value));
  }
});

test("rejects ingest rights outside the approved column-only append boundary", () => {
  for (const mutate of [
    (value) => { value.ingestPrivileges.tableSelect = true; },
    (value) => { value.ingestPrivileges.tableDelete = true; },
    (value) => { value.ingestPrivileges.tableUpdate = true; },
    (value) => { value.ingestPrivileges.tableTruncate = true; },
    (value) => { value.ingestPrivileges.anyColumnSelect = true; },
    (value) => { value.ingestPrivileges.anyColumnUpdate = true; },
    (value) => { value.ingestPrivileges.allowedColumnInsert = false; },
    (value) => { value.ingestPrivileges.forbiddenColumnInsert = true; },
    (value) => { value.ingestPrivileges.identityColumnInsert = true; },
    (value) => { value.ingestPrivileges.recordedAtColumnInsert = true; },
    (value) => { value.ingestPrivileges.sequenceUsage = false; },
    (value) => { value.ingestPrivileges.sequenceSelect = true; },
    (value) => { value.ingestPrivileges.sequenceUpdate = true; },
    (value) => { value.ingestPrivileges.cleanupExecute = true; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(value));
  }
});

test("rejects cleanup rights beyond retained-until read plus server cleanup execute", () => {
  for (const mutate of [
    (value) => { value.cleanupPrivileges.tableSelect = true; },
    (value) => { value.cleanupPrivileges.tableInsert = true; },
    (value) => { value.cleanupPrivileges.tableDelete = true; },
    (value) => { value.cleanupPrivileges.tableUpdate = true; },
    (value) => { value.cleanupPrivileges.tableTruncate = true; },
    (value) => { value.cleanupPrivileges.anyColumnInsert = true; },
    (value) => { value.cleanupPrivileges.anyColumnUpdate = true; },
    (value) => { value.cleanupPrivileges.retainedUntilSelect = false; },
    (value) => { value.cleanupPrivileges.forbiddenColumnSelect = true; },
    (value) => { value.cleanupPrivileges.eventDataSelect = true; },
    (value) => { value.cleanupPrivileges.sequenceUsage = true; },
    (value) => { value.cleanupPrivileges.sequenceSelect = true; },
    (value) => { value.cleanupPrivileges.sequenceUpdate = true; },
    (value) => { value.cleanupPrivileges.cleanupExecute = false; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(value));
  }
});

test("rejects operational read credentials with any mutation or cleanup authority", () => {
  for (const mutate of [
    (value) => { value.readPrivileges.tableSelect = false; },
    (value) => { value.readPrivileges.tableInsert = true; },
    (value) => { value.readPrivileges.tableDelete = true; },
    (value) => { value.readPrivileges.tableUpdate = true; },
    (value) => { value.readPrivileges.tableTruncate = true; },
    (value) => { value.readPrivileges.anyColumnInsert = true; },
    (value) => { value.readPrivileges.anyColumnUpdate = true; },
    (value) => { value.readPrivileges.sequenceUsage = true; },
    (value) => { value.readPrivileges.sequenceSelect = true; },
    (value) => { value.readPrivileges.sequenceUpdate = true; },
    (value) => { value.readPrivileges.cleanupExecute = true; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(value));
  }
});

test("rejects missing, unexpected, delegable, runtime-owned or extra-member ACL boundaries", () => {
  for (const field of [
    "missingExpectedGrantCount",
    "unexpectedProtectedGrantCount",
    "protectedGrantOptionCount",
    "protectedOwnerCount",
    "unexpectedGroupMemberCount",
    "groupMembershipAdminOptionCount",
  ]) {
    const value = validSnapshot();
    value.aclBoundary[field] = 1;
    assert.throws(
      () => evaluateUlcLinzM5SecurityLogAccessSnapshot(value),
      /ACL delegation boundary is invalid/,
    );
  }
});

test("rejects early-delete escape hatches or an unverified server calendar contract", () => {
  for (const mutate of [
    (value) => { value.retentionContract.calendarConstraintVerified = false; },
    (value) => { value.retentionContract.cleanupFunctionVerified = false; },
    (value) => { value.retentionContract.publicFunctionExecute = true; },
    (value) => { value.retentionContract.unexpectedTriggerCount = 1; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(value));
  }
});

test("ACL inventory covers all non-owner grants, delegation, ownership and protected group membership", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-access-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /m\.admin_option AS admin_option/);
  assert.match(source, /pg_catalog\.aclexplode/);
  assert.match(source, /attribute\.attacl/);
  assert.match(source, /acl\.is_grantable/);
  assert.match(source, /WHERE grantee = 0 OR grantee <> owner_oid/);
  assert.doesNotMatch(source, /pg_catalog\.pg_get_userbyid\(grantee\) = ANY/);
  assert.match(source, /protectedGrantOptionCount/);
  assert.match(source, /protectedOwnerCount/);
  assert.match(source, /relation\.relowner AS owner_oid/);
  assert.match(source, /procedure\.proowner AS owner_oid/);
  assert.match(source, /unexpectedProtectedGrantCount/);
  assert.match(source, /missingExpectedGrantCount/);
  assert.match(source, /unexpectedGroupMemberCount/);
  assert.match(source, /groupMembershipAdminOptionCount/);
  assert.match(source, /WHERE parent\.rolname = ANY/);
});

test("forbidden-column inventory uses an unfiltered PostgreSQL catalog", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-access-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /FROM pg_catalog\.pg_attribute attribute/);
  assert.match(source, /attribute\.attrelid = 'public\.ulc_linz_security_event_log'::regclass/);
  assert.match(source, /attribute\.attnum > 0/);
  assert.match(source, /NOT attribute\.attisdropped/);
  assert.doesNotMatch(source, /FROM information_schema\.columns/);
});

test("rejects decorated or accessor-based access evidence", () => {
  const extra = validSnapshot();
  extra.extra = true;
  assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(extra));

  const decorated = validSnapshot();
  Object.defineProperty(decorated.ingestPrivileges, "tableSelect", {
    enumerable: true,
    get() { return false; },
  });
  assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(decorated));

  const symbol = validSnapshot();
  symbol.loginRoles[Symbol("hidden")] = true;
  assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(symbol));
});

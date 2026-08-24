import assert from "node:assert/strict";
import test from "node:test";

import { evaluateUlcLinzM5SecurityLogAccessSnapshot } from "./ulc-linz-m5-security-log-access-evidence.mjs";

function role(name, { login = false, memberships = [] } = {}) {
  return {
    name,
    login,
    superuser: false,
    createDb: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    memberships,
  };
}

function validSnapshot() {
  return {
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
      cleanupExecute: false,
    },
    cleanupPrivileges: {
      tableSelect: false,
      tableInsert: false,
      tableDelete: false,
      tableUpdate: false,
      anyColumnInsert: false,
      anyColumnUpdate: false,
      retainedUntilSelect: true,
      forbiddenColumnSelect: false,
      eventDataSelect: false,
      sequenceUsage: false,
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
      cleanupExecute: false,
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

test("rejects elevated, login-enabled or cross-group role boundaries", () => {
  for (const mutate of [
    (value) => { value.groupRoles.ingest.login = true; },
    (value) => { value.groupRoles.cleanup.superuser = true; },
    (value) => { value.groupRoles.read.createRole = true; },
    (value) => { value.loginRoles.ingest.bypassRls = true; },
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
    (value) => { value.cleanupPrivileges.anyColumnInsert = true; },
    (value) => { value.cleanupPrivileges.anyColumnUpdate = true; },
    (value) => { value.cleanupPrivileges.retainedUntilSelect = false; },
    (value) => { value.cleanupPrivileges.forbiddenColumnSelect = true; },
    (value) => { value.cleanupPrivileges.eventDataSelect = true; },
    (value) => { value.cleanupPrivileges.sequenceUsage = true; },
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
    (value) => { value.readPrivileges.cleanupExecute = true; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogAccessSnapshot(value));
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

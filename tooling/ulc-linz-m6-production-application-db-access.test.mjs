import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUlcLinzM6ProductionApplicationDbAccess,
  UlcLinzM6ProductionApplicationDbAccessError,
} from "./ulc-linz-m6-production-application-db-access.mjs";

const NOW = new Date("2026-08-26T07:45:00.000Z");

function validEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-26T07:44:00.000Z",
    validUntilOrReviewAt: "2026-08-26T08:44:00.000Z",
    runtime: {
      connectionPath: "cloudflare-hyperdrive",
      productionBindingVerified: true,
      localFallbackPersistenceAbsent: true,
    },
    databasePrincipal: {
      identitySource: "postgres-system-catalog",
      roleIdentity: "app-runtime-opaque-1",
      migrationRoleIdentity: "migration-opaque-1",
      login: true,
      superuser: false,
      bypassRls: false,
      createDb: false,
      createRole: false,
      replication: false,
      unexpectedRoleMembershipAbsent: true,
      requiredApplicationAccessVerified: true,
    },
  };
}

function expectBlocked(evidence, code) {
  assert.throws(
    () => evaluateUlcLinzM6ProductionApplicationDbAccess(evidence, { now: NOW }),
    (error) => {
      assert.equal(
        error instanceof UlcLinzM6ProductionApplicationDbAccessError,
        true,
      );
      assert.equal(error.code, code);
      return true;
    },
  );
}

test("accepts only the dedicated least-privilege production application database path and emits no role identifiers", () => {
  const result = evaluateUlcLinzM6ProductionApplicationDbAccess(validEvidence(), {
    now: NOW,
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-26T07:44:00.000Z",
    validUntilOrReviewAt: "2026-08-26T08:44:00.000Z",
    productionDatabasePathVerified: true,
    localFallbackPersistenceAbsent: true,
    dedicatedApplicationPrincipalVerified: true,
    migrationPrincipalSeparated: true,
    privilegedDatabaseCapabilitiesAbsent: true,
    requiredApplicationAccessVerified: true,
    scopeComplete: true,
  });
  assert.ok(Object.isFrozen(result));
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("app-runtime-opaque-1"), false);
  assert.equal(serialized.includes("migration-opaque-1"), false);
});

test("fails closed unless production runtime uses the verified Hyperdrive binding with no local fallback persistence", () => {
  for (const mutate of [
    (evidence) => (evidence.runtime.connectionPath = "direct-postgres"),
    (evidence) => (evidence.runtime.productionBindingVerified = false),
    (evidence) => (evidence.runtime.localFallbackPersistenceAbsent = false),
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    expectBlocked(evidence, "RUNTIME_DATABASE_PATH_MISMATCH");
  }
});

test("fails closed unless the application principal is distinct from migration and has no privileged database capabilities", () => {
  for (const mutate of [
    (evidence) =>
      (evidence.databasePrincipal.migrationRoleIdentity =
        evidence.databasePrincipal.roleIdentity),
    (evidence) => (evidence.databasePrincipal.login = false),
    (evidence) => (evidence.databasePrincipal.superuser = true),
    (evidence) => (evidence.databasePrincipal.bypassRls = true),
    (evidence) => (evidence.databasePrincipal.createDb = true),
    (evidence) => (evidence.databasePrincipal.createRole = true),
    (evidence) => (evidence.databasePrincipal.replication = true),
    (evidence) =>
      (evidence.databasePrincipal.unexpectedRoleMembershipAbsent = false),
    (evidence) =>
      (evidence.databasePrincipal.requiredApplicationAccessVerified = false),
    (evidence) =>
      (evidence.databasePrincipal.identitySource = "configuration-name"),
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    expectBlocked(evidence, "APPLICATION_PRINCIPAL_MISMATCH");
  }
});

test("rejects stale, future and malformed evidence timestamps", () => {
  const stale = validEvidence();
  stale.validUntilOrReviewAt = NOW.toISOString();
  expectBlocked(stale, "STALE_EVIDENCE");

  const future = validEvidence();
  future.observedAt = "2026-08-26T07:46:00.000Z";
  expectBlocked(future, "STALE_EVIDENCE");

  const malformed = validEvidence();
  malformed.observedAt = "2026-08-26 07:44:00Z";
  expectBlocked(malformed, "INVALID_EVIDENCE");
});

test("rejects secret-like fields, connection strings, accessors and inherited evidence", () => {
  const secretField = validEvidence();
  secretField.databaseUrl = "opaque";
  expectBlocked(secretField, "UNSAFE_EVIDENCE");

  const connectionString = validEvidence();
  connectionString.databasePrincipal.roleIdentity =
    "postgresql://user:password@example.test/app";
  expectBlocked(connectionString, "UNSAFE_EVIDENCE");

  let getterCalls = 0;
  const accessor = validEvidence();
  Object.defineProperty(accessor.runtime, "connectionPath", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "cloudflare-hyperdrive";
    },
  });
  expectBlocked(accessor, "UNSAFE_EVIDENCE");
  assert.equal(getterCalls, 0);

  const inherited = Object.create(validEvidence());
  expectBlocked(inherited, "UNSAFE_EVIDENCE");
});

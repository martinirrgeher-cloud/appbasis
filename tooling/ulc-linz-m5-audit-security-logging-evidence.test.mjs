import assert from "node:assert/strict";
import test from "node:test";

import { deriveUlcLinzM5FAuditSecurityLoggingEvidence } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST } from "./ulc-linz-m6-production-resource-binding.mjs";

const NOW = new Date("2026-08-18T16:00:00.000Z");
const OBSERVED_AT = "2026-08-18T15:55:00.000Z";
const VALID_UNTIL = "2026-08-18T17:00:00.000Z";

function resourceBindingEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "neon-project",
      branchBindingId: "neon-branch",
      databaseBindingId: "neon-db",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "cf-account",
      runtimeBindingId: "cf-runtime",
      hostnameBinding: "ulc.example.test",
      databaseBindingId: "cf-hyperdrive",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function loggingEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    inventorySource: "provider-api",
    runtimeBindingId: "cf-runtime",
    sinkBindingId: "security-log-sink",
    sinkIdentitySource: "provider-api",
    structuredEventCaptureEnabled: true,
    protectedOperationalAccess: true,
    retentionMonths: 12,
    retentionSource: "provider-api",
    sinkInventoryComplete: true,
    publicReadEndpointPresent: false,
  };
}

function input() {
  return {
    resourceBindingEvidence: resourceBindingEvidence(),
    loggingEvidence: loggingEvidence(),
  };
}

test("verifies M5-F only from a fresh production-bound protected retained sink", () => {
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(input(), { now: NOW }),
    { auditSecurityLogging: true },
  );
});

test("keeps M5-F fail-closed for missing retention, access, capture or runtime binding", () => {
  for (const mutate of [
    (value) => { value.loggingEvidence.retentionMonths = 1; },
    (value) => { value.loggingEvidence.protectedOperationalAccess = false; },
    (value) => { value.loggingEvidence.structuredEventCaptureEnabled = false; },
    (value) => { value.loggingEvidence.runtimeBindingId = "other-runtime"; },
    (value) => { value.loggingEvidence.publicReadEndpointPresent = true; },
  ]) {
    const value = input();
    mutate(value);
    assert.deepEqual(
      deriveUlcLinzM5FAuditSecurityLoggingEvidence(value, { now: NOW }),
      {},
    );
  }
});

test("rejects stale, cross-app and decorated M5-F evidence", () => {
  const stale = input();
  stale.loggingEvidence.observedAt = "2026-08-17T15:55:00.000Z";
  stale.resourceBindingEvidence.observedAt = stale.loggingEvidence.observedAt;
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(stale, { now: NOW }),
    {},
  );

  const crossApp = input();
  crossApp.loggingEvidence.application = "reference";
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(crossApp, { now: NOW }),
    {},
  );

  const decorated = input();
  decorated.loggingEvidence.extra = true;
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(decorated, { now: NOW }),
    {},
  );
});

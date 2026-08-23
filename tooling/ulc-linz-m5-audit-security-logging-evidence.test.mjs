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

function providerNativeRetentionEvidence() {
  return {
    source: "provider-api-and-authoritative-contract",
    retentionValue: 12,
    retentionUnit: "calendar-months",
    calendarSemanticsVerified: true,
    noEarlyDeleteVerified: true,
    noUncontrolledOverRetentionVerified: true,
  };
}

function controlledRetentionEvidence() {
  return {
    source: "controlled-calendar-enforcement",
    providerMinimumRetentionVerified: true,
    cutoffSemantics: "created-at-strictly-older-than-12-calendar-months",
    cleanupExecutionBound: true,
    cleanupLastSucceededAt: "2026-08-18T15:50:00.000Z",
    cleanupResultVerified: true,
    boundaryEventPreserved: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: `sha256:${"a".repeat(64)}`,
  };
}

function loggingEvidence(retentionMode = "provider-native-calendar", retentionEvidence = providerNativeRetentionEvidence()) {
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
    retentionMode,
    retentionEvidence,
    sinkInventoryComplete: true,
    publicReadEndpointPresent: false,
  };
}

function input(retentionMode, retentionEvidence) {
  return {
    resourceBindingEvidence: resourceBindingEvidence(),
    loggingEvidence: loggingEvidence(retentionMode, retentionEvidence),
  };
}

test("verifies M5-F with authoritative provider-native calendar retention", () => {
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(input(), { now: NOW }),
    { auditSecurityLogging: true },
  );
});

test("verifies M5-F with controlled exact calendar enforcement", () => {
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(
      input("controlled-calendar-enforcement", controlledRetentionEvidence()),
      { now: NOW },
    ),
    { auditSecurityLogging: true },
  );
});

test("rejects day-based or unverified provider retention as twelve calendar months", () => {
  for (const mutate of [
    (value) => { value.retentionValue = 365; value.retentionUnit = "days"; },
    (value) => { value.calendarSemanticsVerified = false; },
    (value) => { value.noEarlyDeleteVerified = false; },
    (value) => { value.noUncontrolledOverRetentionVerified = false; },
  ]) {
    const retention = providerNativeRetentionEvidence();
    mutate(retention);
    assert.deepEqual(
      deriveUlcLinzM5FAuditSecurityLoggingEvidence(
        input("provider-native-calendar", retention),
        { now: NOW },
      ),
      {},
    );
  }
});

test("rejects controlled retention without exact boundary, fresh cleanup or server-side cutoff", () => {
  for (const mutate of [
    (value) => { value.providerMinimumRetentionVerified = false; },
    (value) => { value.cutoffSemantics = "older-than-365-days"; },
    (value) => { value.cleanupExecutionBound = false; },
    (value) => { value.cleanupLastSucceededAt = "2026-08-17T15:00:00.000Z"; },
    (value) => { value.cleanupResultVerified = false; },
    (value) => { value.boundaryEventPreserved = false; },
    (value) => { value.clientCutoffOverridePresent = true; },
    (value) => { value.enforcementContractDigest = "not-a-digest"; },
  ]) {
    const retention = controlledRetentionEvidence();
    mutate(retention);
    assert.deepEqual(
      deriveUlcLinzM5FAuditSecurityLoggingEvidence(
        input("controlled-calendar-enforcement", retention),
        { now: NOW },
      ),
      {},
    );
  }
});

test("keeps M5-F fail-closed for missing access, capture or runtime binding", () => {
  for (const mutate of [
    (value) => { value.loggingEvidence.protectedOperationalAccess = false; },
    (value) => { value.loggingEvidence.structuredEventCaptureEnabled = false; },
    (value) => { value.loggingEvidence.runtimeBindingId = "other-runtime"; },
    (value) => { value.loggingEvidence.publicReadEndpointPresent = true; },
    (value) => { value.loggingEvidence.retentionMode = "unknown"; },
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

  const decoratedRetention = input();
  decoratedRetention.loggingEvidence.retentionEvidence.extra = true;
  assert.deepEqual(
    deriveUlcLinzM5FAuditSecurityLoggingEvidence(decoratedRetention, { now: NOW }),
    {},
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzM5ProviderProductionEvidence,
  evaluateUlcLinzProviderCompliance,
  ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES,
} from "./ulc-linz-m5-provider-evidence.mjs";

const NOW = "2026-08-17T21:00:00.000Z";
const OBSERVED_AT = "2026-08-17T20:00:00.000Z";
const VALID_UNTIL = "2026-08-18T20:00:00.000Z";

function legalEntry({
  provider,
  documentType,
  canonicalSource,
  accountSpecific = false,
  publicBaseline = true,
  transferModelConsistentWithAdr022 = null,
  validUntilOrReviewAt = VALID_UNTIL,
}) {
  return {
    provider,
    documentType,
    canonicalSource,
    documentVersionOrUpdatedAt: "2026-08-17",
    serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[provider],
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt,
    accountSpecific,
    publicBaseline,
    transferModelConsistentWithAdr022,
  };
}

function fullLegalEvidence() {
  return [
    legalEntry({
      provider: "cloudflare",
      documentType: "dpa",
      canonicalSource: "https://www.cloudflare.com/cloudflare-customer-dpa/",
    }),
    legalEntry({
      provider: "cloudflare",
      documentType: "dpa-account-binding",
      canonicalSource: "https://dash.cloudflare.com/",
      accountSpecific: true,
      publicBaseline: false,
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "terms",
      canonicalSource: "https://neon.com/platform-terms",
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "dpa",
      canonicalSource: "https://www.databricks.com/legal/data-processing-addendum",
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "dpa-account-binding",
      canonicalSource: "https://console.neon.tech/",
      accountSpecific: true,
      publicBaseline: false,
    }),
    legalEntry({
      provider: "cloudflare",
      documentType: "subprocessors",
      canonicalSource: "https://www.cloudflare.com/cloudflare-subprocessors/",
      transferModelConsistentWithAdr022: true,
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "subprocessors",
      canonicalSource: "https://www.databricks.com/legal/subprocessors",
      transferModelConsistentWithAdr022: true,
    }),
    legalEntry({
      provider: "cloudflare",
      documentType: "security",
      canonicalSource: "https://developers.cloudflare.com/ssl/",
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "security",
      canonicalSource: "https://neon.com/docs/security/security-overview",
    }),
  ];
}

function completeEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    providerModel: "standard-workers-global-transient",
    euOnly: false,
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    dataFlowInventoryComplete: true,
    providers: {
      cloudflare: {
        resourceClass: "production",
        runtimeBound: true,
        routeBound: true,
        runtimeClass: "standard-workers",
        bindingsInventoryComplete: true,
        bindings: [
          { type: "hyperdrive", personalDataDisposition: "none" },
          { type: "service", personalDataDisposition: "transient" },
        ],
        telemetryInventoryComplete: true,
        transportEncryptionObserved: true,
        regionalServicesEnabled: false,
        customerMetadataBoundaryEnabled: false,
      },
      "neon-postgresql": {
        resourceClass: "production",
        projectBound: true,
        databaseBound: true,
        regionId: "aws-eu-central-1",
        regionSource: "provider-api",
        transportEncryptionObserved: true,
        atRestEncryptionObserved: true,
      },
    },
    legalEvidence: fullLegalEvidence(),
    dataFlows: [
      {
        from: "ulc-linz-user",
        to: "cloudflare",
        purpose: "application-request-processing",
        status: "verified",
      },
      {
        from: "cloudflare",
        to: "neon-postgresql",
        purpose: "application-persistence",
        status: "verified",
      },
      {
        from: "appbasis-control-plane",
        to: "cloudflare",
        purpose: "provider-evidence-read",
        status: "verified",
      },
      {
        from: "appbasis-control-plane",
        to: "neon-postgresql",
        purpose: "provider-evidence-read",
        status: "verified",
      },
      {
        from: "neon-postgresql",
        to: "neon-postgresql",
        purpose: "managed-backup-recovery",
        status: "verified",
      },
    ],
  };
}

function baselineWithoutProductionResources() {
  const evidence = completeEvidence();
  evidence.dataFlowInventoryComplete = false;
  evidence.providers.cloudflare.resourceClass = "preview";
  evidence.providers.cloudflare.runtimeBound = false;
  evidence.providers.cloudflare.routeBound = false;
  evidence.providers.cloudflare.bindingsInventoryComplete = false;
  evidence.providers.cloudflare.bindings = [];
  evidence.providers.cloudflare.telemetryInventoryComplete = false;
  evidence.providers.cloudflare.transportEncryptionObserved = false;
  evidence.providers["neon-postgresql"].resourceClass = "preview";
  evidence.providers["neon-postgresql"].projectBound = false;
  evidence.providers["neon-postgresql"].databaseBound = false;
  evidence.providers["neon-postgresql"].regionId = "aws-eu-central-1";
  evidence.providers["neon-postgresql"].transportEncryptionObserved = false;
  evidence.providers["neon-postgresql"].atRestEncryptionObserved = false;
  evidence.legalEvidence = [];
  evidence.dataFlows = evidence.dataFlows.map((flow) => ({ ...flow, status: "open" }));
  return evidence;
}

function evaluate(evidence) {
  return evaluateUlcLinzProviderCompliance(evidence, { now: NOW });
}

function assertAllOpen(compliance) {
  assert.deepEqual(compliance.criteria, {
    dataRegion: "open",
    dpa: "open",
    encryption: "open",
    subprocessors: "open",
  });
}

test("1: valid baseline without real production bindings keeps all M5-G criteria open", () => {
  const evidence = baselineWithoutProductionResources();
  assertAllOpen(evaluate(evidence));
  assert.deepEqual(
    deriveUlcLinzM5ProviderProductionEvidence(evidence, { now: NOW }),
    {},
  );
});

test("2: rejects evidence for another application", () => {
  const evidence = completeEvidence();
  evidence.application = "reference";
  assert.throws(() => evaluate(evidence), /requires application ulc-linz/);
});

test("3: rejects preview or test environment evidence", () => {
  const evidence = completeEvidence();
  evidence.environment = "preview";
  assert.throws(() => evaluate(evidence), /requires production environment/);
});

test("4: rejects an EU-only claim for the Standard Workers model", () => {
  const evidence = completeEvidence();
  evidence.euOnly = true;
  assert.throws(() => evaluate(evidence), /euOnly=false/);
});

test("5: Frankfurt on a preview Neon resource cannot verify dataRegion", () => {
  const evidence = completeEvidence();
  evidence.providers["neon-postgresql"].resourceClass = "preview";
  assert.equal(evaluate(evidence).criteria.dataRegion, "open");
});

test("6: a non-Frankfurt Neon production region keeps dataRegion open", () => {
  const evidence = completeEvidence();
  evidence.providers["neon-postgresql"].regionId = "aws-us-east-1";
  assert.equal(evaluate(evidence).criteria.dataRegion, "open");
});

test("7: missing authoritative Neon region keeps dataRegion open", () => {
  const evidence = completeEvidence();
  evidence.providers["neon-postgresql"].regionId = null;
  evidence.providers["neon-postgresql"].regionSource = null;
  assert.equal(evaluate(evidence).criteria.dataRegion, "open");
});

test("8: an unknown Cloudflare binding path blocks the whole M5-G evidence scope", () => {
  const evidence = completeEvidence();
  evidence.providers.cloudflare.bindings.push({
    type: "future-provider-binding",
    personalDataDisposition: "unknown",
  });
  const compliance = evaluate(evidence);
  assertAllOpen(compliance);
  assert.equal(compliance.providers.cloudflare.unexpectedPersonalDataPersistence, null);
});

test("9: stale subprocessor evidence affects only subprocessors", () => {
  const evidence = completeEvidence();
  const cloudflareSubprocessors = evidence.legalEvidence.find(
    (entry) => entry.provider === "cloudflare" && entry.documentType === "subprocessors",
  );
  cloudflareSubprocessors.validUntilOrReviewAt = "2026-08-17T20:59:59.000Z";
  const compliance = evaluate(evidence);
  assert.equal(compliance.criteria.subprocessors, "open");
  assert.equal(compliance.criteria.dataRegion, "verified");
  assert.equal(compliance.criteria.dpa, "verified");
  assert.equal(compliance.criteria.encryption, "verified");
});

test("10: public DPA baselines without account-specific bindings do not verify dpa", () => {
  const evidence = completeEvidence();
  evidence.legalEvidence = evidence.legalEvidence.filter(
    (entry) => entry.documentType !== "dpa-account-binding",
  );
  assert.equal(evaluate(evidence).criteria.dpa, "open");
});

test("11: provider security documentation without real encryption configuration keeps encryption open", () => {
  const evidence = completeEvidence();
  evidence.providers["neon-postgresql"].atRestEncryptionObserved = false;
  const compliance = evaluate(evidence);
  assert.equal(compliance.criteria.encryption, "open");
  assert.equal(compliance.criteria.dataRegion, "verified");
});

test("12: complete fresh production evidence verifies each M5-G criterion independently", () => {
  const compliance = evaluate(completeEvidence());
  assert.deepEqual(compliance.criteria, {
    dataRegion: "verified",
    dpa: "verified",
    encryption: "verified",
    subprocessors: "verified",
  });
  assert.equal(Object.isFrozen(compliance), true);
  assert.equal(Object.isFrozen(compliance.criteria), true);
  assert.equal(Object.isFrozen(compliance.providers), true);
  assert.deepEqual(
    deriveUlcLinzM5ProviderProductionEvidence(completeEvidence(), { now: NOW }),
    { dataRegion: true, dpa: true, encryption: true, subprocessors: true },
  );
});

test("13: missing observedAt is rejected instead of being treated as fresh", () => {
  const evidence = completeEvidence();
  delete evidence.observedAt;
  assert.throws(() => evaluate(evidence), /fields are invalid/);
});

test("14: expired root evidence makes every criterion unusable", () => {
  const evidence = completeEvidence();
  evidence.validUntilOrReviewAt = NOW;
  assertAllOpen(evaluate(evidence));
});

test("15: secret or credential fields are rejected before normalization", () => {
  const evidence = completeEvidence();
  evidence.providers.cloudflare.apiToken = "secret-value";
  assert.throws(() => evaluate(evidence), /contains sensitive data/);

  const connectionEvidence = completeEvidence();
  connectionEvidence.legalEvidence[0].canonicalSource =
    "postgresql://appbasis:supersecret@example.invalid/db";
  assert.throws(() => evaluate(connectionEvidence), /contains sensitive data/);
});

test("16: one verified criterion never implies the other three", () => {
  const evidence = completeEvidence();
  evidence.legalEvidence = [];
  evidence.providers.cloudflare.transportEncryptionObserved = false;
  evidence.providers["neon-postgresql"].transportEncryptionObserved = false;
  evidence.providers["neon-postgresql"].atRestEncryptionObserved = false;
  const compliance = evaluate(evidence);
  assert.deepEqual(compliance.criteria, {
    dataRegion: "verified",
    dpa: "open",
    encryption: "open",
    subprocessors: "open",
  });
  assert.deepEqual(
    deriveUlcLinzM5ProviderProductionEvidence(evidence, { now: NOW }),
    { dataRegion: true },
  );
});

test("rejects an unexpected provider instead of silently widening the provider scope", () => {
  const evidence = completeEvidence();
  evidence.providers["unknown-provider"] = {};
  assert.throws(() => evaluate(evidence), /providers fields are invalid/);
});

test("rejects truthy strings and other non-boolean provider claims", () => {
  const evidence = completeEvidence();
  evidence.providers.cloudflare.runtimeBound = "true";
  assert.throws(() => evaluate(evidence), /runtimeBound must be boolean/);
});

test("Regional Services and Customer Metadata Boundary are observed states, not prerequisites", () => {
  const evidence = completeEvidence();
  evidence.providers.cloudflare.regionalServicesEnabled = false;
  evidence.providers.cloudflare.customerMetadataBoundaryEnabled = false;
  const compliance = evaluate(evidence);
  assert.equal(compliance.criteria.dataRegion, "verified");
  assert.equal(compliance.euOnly, false);
});

test("known persistent personal-data Cloudflare bindings block all criteria without leaking binding names", () => {
  const evidence = completeEvidence();
  evidence.providers.cloudflare.bindings.push({
    type: "r2_bucket",
    personalDataDisposition: "persistent",
  });
  const compliance = evaluate(evidence);
  assertAllOpen(compliance);
  assert.equal(compliance.providers.cloudflare.unexpectedPersonalDataPersistence, true);
  assert.equal(JSON.stringify(compliance).includes("r2_bucket"), false);
});

test("a missing required control-plane or backup data flow blocks all criteria", () => {
  for (const purpose of ["provider-evidence-read", "managed-backup-recovery"]) {
    const evidence = completeEvidence();
    const index = evidence.dataFlows.findIndex((flow) => flow.purpose === purpose);
    evidence.dataFlows.splice(index, 1);
    assertAllOpen(evaluate(evidence));
  }
});

test("an additional verified but non-canonical data flow blocks all criteria until the inventory is updated", () => {
  const evidence = completeEvidence();
  evidence.dataFlows.push({
    from: "cloudflare",
    to: "unexpected-telemetry-provider",
    purpose: "runtime-telemetry",
    status: "verified",
  });
  assertAllOpen(evaluate(evidence));
});

test("legal evidence for the wrong service scope cannot satisfy a provider criterion", () => {
  const evidence = completeEvidence();
  const cloudflareDpa = evidence.legalEvidence.find(
    (entry) => entry.provider === "cloudflare" && entry.documentType === "dpa",
  );
  cloudflareDpa.serviceScope = "dns-only";
  const compliance = evaluate(evidence);
  assert.equal(compliance.criteria.dpa, "open");
  assert.equal(compliance.criteria.dataRegion, "verified");
  assert.equal(compliance.criteria.encryption, "verified");
  assert.equal(compliance.criteria.subprocessors, "verified");
});

test("Neon Product Specific Schedule evidence is mandatory and fresh for DPA and subprocessors", () => {
  const missingSchedule = completeEvidence();
  missingSchedule.legalEvidence = missingSchedule.legalEvidence.filter(
    (entry) =>
      !(entry.provider === "neon-databricks" && entry.documentType === "terms"),
  );
  const missingCompliance = evaluate(missingSchedule);
  assert.equal(missingCompliance.criteria.dataRegion, "verified");
  assert.equal(missingCompliance.criteria.encryption, "verified");
  assert.equal(missingCompliance.criteria.dpa, "open");
  assert.equal(missingCompliance.criteria.subprocessors, "open");

  const staleSchedule = completeEvidence();
  const schedule = staleSchedule.legalEvidence.find(
    (entry) =>
      entry.provider === "neon-databricks" && entry.documentType === "terms",
  );
  schedule.validUntilOrReviewAt = "2026-08-17T20:59:59.000Z";
  const staleCompliance = evaluate(staleSchedule);
  assert.equal(staleCompliance.criteria.dpa, "open");
  assert.equal(staleCompliance.criteria.subprocessors, "open");
});

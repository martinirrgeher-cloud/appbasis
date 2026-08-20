import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzM5GBoundProductionEvidence,
  deriveUlcLinzM5GResourceBindingFingerprint,
} from "./ulc-linz-m5-provider-bound-evidence.mjs";
import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "./ulc-linz-m5-provider-evidence.mjs";
import { ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST } from "./ulc-linz-m6-production-resource-binding.mjs";

const NOW = new Date("2026-08-18T12:50:00.000Z");
const OBSERVED_AT = "2026-08-18T12:45:00.000Z";
const VALID_UNTIL = "2026-08-18T13:45:00.000Z";

function legalEntry({
  provider,
  documentType,
  canonicalSource,
  accountSpecific = false,
  publicBaseline = true,
  transferModelConsistentWithAdr022 = null,
}) {
  return {
    provider,
    documentType,
    canonicalSource,
    documentVersionOrUpdatedAt: "2026-08-18",
    serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[provider],
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
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

function complianceEvidence() {
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
      projectBindingId: "opaque-neon-project",
      branchBindingId: "opaque-neon-branch",
      databaseBindingId: "opaque-neon-database",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "opaque-account",
      runtimeBindingId: "opaque-worker",
      hostnameBinding: null,
      databaseBindingId: "opaque-hyperdrive",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function fingerprint(resource = resourceBindingEvidence()) {
  return deriveUlcLinzM5GResourceBindingFingerprint(resource, { now: NOW });
}

function derive(
  resource = resourceBindingEvidence(),
  compliance = complianceEvidence(),
  complianceResourceBindingFingerprint = fingerprint(resource),
) {
  return deriveUlcLinzM5GBoundProductionEvidence(
    {
      resourceBindingEvidence: resource,
      complianceEvidence: compliance,
      complianceResourceBindingFingerprint,
    },
    { now: NOW },
  );
}

test("returns M5-G criteria from one aligned private production snapshot before public hostname activation", () => {
  const result = derive();
  assert.deepEqual(result, {
    dataRegion: true,
    dpa: true,
    encryption: true,
    subprocessors: true,
  });
  assert.equal(Object.isFrozen(result), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("opaque-neon-project"), false);
  assert.equal(
    serialized.includes(ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST),
    false,
  );
});

test("creates a deterministic secrets-free correlation fingerprint only after resource validation", () => {
  const resource = resourceBindingEvidence();
  const value = fingerprint(resource);
  assert.match(value, /^sha256:[a-f0-9]{64}$/);
  assert.equal(value, fingerprint(resource));
  assert.equal(value.includes("opaque-neon-project"), false);

  const drifted = resourceBindingEvidence();
  drifted.runtime.contractDigest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => fingerprint(drifted));
});

test("fails closed when exact runtime-contract evidence is absent or drifted", () => {
  assert.deepEqual(
    deriveUlcLinzM5GBoundProductionEvidence(
      {
        complianceEvidence: complianceEvidence(),
        complianceResourceBindingFingerprint: fingerprint(),
      },
      { now: NOW },
    ),
    {},
  );

  const drifted = resourceBindingEvidence();
  drifted.runtime.contractDigest = `sha256:${"0".repeat(64)}`;
  assert.deepEqual(
    derive(drifted, complianceEvidence(), fingerprint()),
    {},
  );
});

test("fails closed when the compliance snapshot is correlated to another concrete resource binding", () => {
  const other = resourceBindingEvidence();
  other.cloudflare.runtimeBindingId = "opaque-other-worker";
  assert.notEqual(fingerprint(other), fingerprint());
  assert.deepEqual(
    derive(resourceBindingEvidence(), complianceEvidence(), fingerprint(other)),
    {},
  );
});

test("fails closed when resource binding and compliance evidence do not share the same observation window", () => {
  const resource = resourceBindingEvidence();
  resource.observedAt = "2026-08-18T12:44:59.000Z";
  assert.deepEqual(
    derive(resource, complianceEvidence(), fingerprint(resource)),
    {},
  );

  const compliance = complianceEvidence();
  compliance.validUntilOrReviewAt = "2026-08-18T13:46:00.000Z";
  assert.deepEqual(derive(resourceBindingEvidence(), compliance), {});
});

test("fails closed when provider semantics disagree across the two evidence layers", () => {
  const compliance = complianceEvidence();
  compliance.providers["neon-postgresql"].regionId = "aws-us-east-1";
  assert.deepEqual(derive(resourceBindingEvidence(), compliance), {});

  const wrongRuntime = complianceEvidence();
  wrongRuntime.providers.cloudflare.runtimeClass = "regional-services";
  assert.deepEqual(derive(resourceBindingEvidence(), wrongRuntime), {});
});

test("fails closed when a canonical operational flow is absent", () => {
  const compliance = complianceEvidence();
  compliance.dataFlows = compliance.dataFlows.filter(
    (flow) => flow.purpose !== "managed-backup-recovery",
  );
  assert.deepEqual(derive(resourceBindingEvidence(), compliance), {});
});

test("preserves independent criteria after the common runtime/resource binding has been proven", () => {
  const compliance = complianceEvidence();
  const subprocessors = compliance.legalEvidence.find(
    (entry) =>
      entry.provider === "cloudflare" &&
      entry.documentType === "subprocessors",
  );
  subprocessors.validUntilOrReviewAt = "2026-08-18T12:49:59.000Z";

  assert.deepEqual(derive(resourceBindingEvidence(), compliance), {
    dataRegion: true,
    dpa: true,
    encryption: true,
  });
});

test("never invokes accessors and rejects symbols or inherited wrapper objects", () => {
  let calls = 0;
  const accessor = {
    resourceBindingEvidence: resourceBindingEvidence(),
    complianceResourceBindingFingerprint: fingerprint(),
  };
  Object.defineProperty(accessor, "complianceEvidence", {
    enumerable: true,
    get() {
      calls += 1;
      return complianceEvidence();
    },
  });
  assert.deepEqual(
    deriveUlcLinzM5GBoundProductionEvidence(accessor, { now: NOW }),
    {},
  );
  assert.equal(calls, 0);

  const symbol = {
    resourceBindingEvidence: resourceBindingEvidence(),
    complianceEvidence: complianceEvidence(),
    complianceResourceBindingFingerprint: fingerprint(),
  };
  symbol[Symbol("hidden")] = true;
  assert.deepEqual(
    deriveUlcLinzM5GBoundProductionEvidence(symbol, { now: NOW }),
    {},
  );

  const inherited = Object.create({
    resourceBindingEvidence: resourceBindingEvidence(),
    complianceEvidence: complianceEvidence(),
    complianceResourceBindingFingerprint: fingerprint(),
  });
  assert.deepEqual(
    deriveUlcLinzM5GBoundProductionEvidence(inherited, { now: NOW }),
    {},
  );
});

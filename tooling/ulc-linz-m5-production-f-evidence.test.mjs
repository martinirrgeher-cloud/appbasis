import assert from "node:assert/strict";
import test from "node:test";

import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { completeUlcLinzM5ProductionFBundle } from "./ulc-linz-m5-production-f-evidence.mjs";

const SHA = "a".repeat(40);
const NOW = new Date("2026-08-23T22:00:00.000Z");
const OBSERVED_AT = "2026-08-23T21:55:00.000Z";
const VALID_UNTIL = "2026-08-23T22:10:00.000Z";
const VERSION = "12345678-1234-4123-8123-123456789abc";
const HISTORICAL_VERSION = "22345678-1234-4123-8123-123456789abc";
const DEPLOYED_AT = "2026-08-23T21:30:00.000Z";
const VERSION_CREATED_AT = "2026-08-23T19:30:00.000Z";

function resourceBindingEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: `sha256:${"1".repeat(64)}`,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "project-1",
      branchBindingId: "branch-1",
      databaseBindingId: "database-1",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "account-1",
      runtimeBindingId: "appbasis-ulc-linz-production",
      hostnameBinding: null,
      databaseBindingId: "hyperdrive-main",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function bundle() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    definition: { appId: "ulc-linz" },
    ownerInputs: {
      providerBoundEvidenceInput: {
        resourceBindingEvidence: resourceBindingEvidence(),
        complianceEvidence: {},
        complianceResourceBindingFingerprint: `sha256:${"2".repeat(64)}`,
      },
    },
  };
}

function retentionEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "github-actions-controlled-production-retention-run",
    cleanupExecutionBound: true,
    cleanupLastSucceededAt: "2026-08-23T21:58:00.000Z",
    cleanupResultVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    boundaryEventPreserved: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
    ...overrides,
  };
}

function cloudflareFetch(url) {
  const value = String(url);
  if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
    return Promise.resolve(json({
      success: true,
      result: {
        deployments: [
          {
            created_on: DEPLOYED_AT,
            versions: [{ version_id: VERSION, percentage: 100 }],
          },
          {
            created_on: "2026-08-22T21:30:00.000Z",
            versions: [{ version_id: HISTORICAL_VERSION, percentage: 100 }],
          },
        ],
      },
    }));
  }
  if (value.endsWith(`/workers/scripts/appbasis-ulc-linz-production/versions/${VERSION}`)) {
    return Promise.resolve(json({
      success: true,
      result: {
        id: VERSION,
        metadata: { created_on: VERSION_CREATED_AT },
        annotations: {
          "workers/tag": "ulc-linz-production-runtime-v1",
          "workers/message": `AppBasis ulc-linz production runtime ${SHA} auth-hmac:${"b".repeat(64)}`,
        },
        resources: {
          bindings: [
            { name: "HYPERDRIVE", type: "hyperdrive", id: "hyperdrive-main" },
            { name: "SECURITY_LOG_HYPERDRIVE", type: "hyperdrive", id: "hyperdrive-security" },
          ],
        },
      },
    }));
  }
  if (value.endsWith("/hyperdrive/configs/hyperdrive-security")) {
    return Promise.resolve(json({
      success: true,
      result: {
        id: "hyperdrive-security",
        origin: {
          scheme: "postgresql",
          host: "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",
          port: 5432,
          database: "neondb",
          user: "ulc_security_ingest_login",
        },
        caching: { disabled: true },
      },
    }));
  }
  throw new Error(`Unexpected Cloudflare URL: ${value}`);
}

function json(value) {
  return {
    ok: true,
    async json() { return structuredClone(value); },
  };
}

function inputs() {
  return {
    cloudflareAccountId: "account-1",
    cloudflareApiToken: "cloudflare-token",
    productionDatabaseUrl: "postgresql://app_owner:pw@origin.example/neondb",
    backupDatabaseUrl: "postgresql://backup:pw@origin.example/neondb",
    cleanupDatabaseUrl: "postgresql://cleanup:pw@origin.example/neondb",
    readDatabaseUrl: "postgresql://reader:pw@origin.example/neondb",
    githubSha: SHA,
  };
}

const validAccess = Object.freeze({
  leastPrivilegeAccessVerified: true,
  protectedOperationalAccessVerified: true,
  providerMinimumRetentionVerified: true,
});
const validDelivery = Object.freeze({ postDeploymentSinkActivityObserved: true });

async function complete({
  fetchImpl = cloudflareFetch,
  access = validAccess,
  delivery = validDelivery,
  retention = retentionEvidence(),
} = {}) {
  return completeUlcLinzM5ProductionFBundle(bundle(), inputs(), {
    fetchImpl,
    githubFetchImpl: async () => { throw new Error("not used by injected reader"); },
    now: NOW,
    accessCollector: async (input) => {
      assert.equal(input.backupDatabaseUrl, inputs().backupDatabaseUrl);
      return access;
    },
    deliveryCollector: async (input, options) => {
      assert.equal(input.productionDatabaseUrl, inputs().readDatabaseUrl);
      assert.equal(input.deployedAt, DEPLOYED_AT);
      assert.equal(options.now.toISOString(), NOW.toISOString());
      return delivery;
    },
    retentionEvidenceReader: async () => retention,
  });
}

async function completeFromContract({
  fetchImpl = cloudflareFetch,
  access = validAccess,
  delivery = validDelivery,
} = {}) {
  return completeUlcLinzM5ProductionFBundle(bundle(), inputs(), {
    fetchImpl,
    now: NOW,
    accessCollector: async (input) => {
      assert.equal(input.backupDatabaseUrl, inputs().backupDatabaseUrl);
      return access;
    },
    deliveryCollector: async (input, options) => {
      assert.equal(input.productionDatabaseUrl, inputs().readDatabaseUrl);
      assert.equal(input.deployedAt, DEPLOYED_AT);
      assert.equal(options.now.toISOString(), NOW.toISOString());
      return delivery;
    },
  });
}

test("adds M5-F from the active Cloudflare deployment even when older deployment history exists", async () => {
  const result = await complete();
  const f = result.ownerInputs.auditSecurityLoggingEvidenceInput;
  assert.equal(f.resourceBindingEvidence, result.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence);
  assert.deepEqual(f.loggingEvidence, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    inventorySource: "provider-api",
    runtimeBindingId: "appbasis-ulc-linz-production",
    sinkBindingId: "hyperdrive-security",
    sinkIdentitySource: "provider-api",
    structuredEventCaptureEnabled: true,
    protectedOperationalAccess: true,
    retentionMode: "controlled-calendar-enforcement",
    retentionEvidence: {
      source: "controlled-calendar-enforcement",
      providerMinimumRetentionVerified: true,
      cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
      cleanupExecutionBound: true,
      cleanupLastSucceededAt: "2026-08-23T21:58:00.000Z",
      cleanupResultVerified: true,
      boundaryEventPreserved: true,
      clientCutoffOverridePresent: false,
      enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
    },
    sinkInventoryComplete: true,
    publicReadEndpointPresent: false,
  });
  assert.equal(JSON.stringify(result).includes("ulc_security_ingest_login"), false);
  assert.equal(JSON.stringify(result).includes("postgresql://"), false);
});

test("uses the bounded production retention contract by default without a destructive run", async () => {
  const result = await completeFromContract();
  const retention = result.ownerInputs.auditSecurityLoggingEvidenceInput.loggingEvidence;
  assert.equal(retention.retentionMode, "controlled-calendar-contract");
  assert.deepEqual(retention.retentionEvidence, {
    source: "production-database-and-authoritative-contract",
    providerMinimumRetentionVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    serverRetentionBoundaryVerified: true,
    leastPrivilegeCleanupVerified: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  });
  assert.equal("cleanupLastSucceededAt" in retention.retentionEvidence, false);
  assert.equal(JSON.stringify(result).includes("postgresql://"), false);
});

test("fails closed without real least-privilege access evidence", async () => {
  for (const access of [
    { ...validAccess, leastPrivilegeAccessVerified: false },
    { ...validAccess, protectedOperationalAccessVerified: false },
    { ...validAccess, providerMinimumRetentionVerified: false },
  ]) {
    await assert.rejects(() => complete({ access }), /access evidence is incomplete/);
    await assert.rejects(() => completeFromContract({ access }), /access evidence is incomplete/);
  }
});

test("fails closed without post-deployment sink activity evidence", async () => {
  await assert.rejects(
    () => complete({ delivery: {} }),
    /post-deployment production sink activity evidence is unavailable/,
  );
  await assert.rejects(
    () => completeFromContract({ delivery: {} }),
    /post-deployment production sink activity evidence is unavailable/,
  );
});

test("fails closed without the exact successful retention contract", async () => {
  for (const retention of [
    {},
    retentionEvidence({ cleanupResultVerified: false }),
    retentionEvidence({ cutoffSemantics: "created-at-strictly-older-than-12-calendar-months" }),
    retentionEvidence({ enforcementContractDigest: `sha256:${"c".repeat(64)}` }),
  ]) {
    await assert.rejects(() => complete({ retention }), /retention run evidence is unavailable/);
  }
});

test("fails closed on stale Worker head, missing dedicated binding, missing active deploy timestamp or wrong Hyperdrive origin", async () => {
  const mutations = [
    (body, url) => {
      if (url.includes("/versions/")) body.result.annotations["workers/message"] = `AppBasis ulc-linz production runtime ${"c".repeat(40)} auth-hmac:x`;
    },
    (body, url) => {
      if (url.includes("/versions/")) body.result.resources.bindings = body.result.resources.bindings.filter((entry) => entry.name !== "SECURITY_LOG_HYPERDRIVE");
    },
    (body, url) => {
      if (url.endsWith("/deployments")) delete body.result.deployments[0].created_on;
    },
    (body, url) => {
      if (url.includes("/hyperdrive/configs/")) body.result.origin.database = "other";
    },
  ];
  for (const mutate of mutations) {
    const fetchImpl = async (url) => {
      const response = await cloudflareFetch(url);
      const body = await response.json();
      mutate(body, String(url));
      return json(body);
    };
    await assert.rejects(() => complete({ fetchImpl }));
    await assert.rejects(() => completeFromContract({ fetchImpl }));
  }
});

test("rejects pre-injected or cross-resource F evidence", async () => {
  const prefilled = bundle();
  prefilled.ownerInputs.auditSecurityLoggingEvidenceInput = {};
  await assert.rejects(
    () => completeUlcLinzM5ProductionFBundle(prefilled, inputs(), {
      fetchImpl: cloudflareFetch,
      now: NOW,
      accessCollector: async () => validAccess,
      deliveryCollector: async () => validDelivery,
      retentionEvidenceReader: async () => retentionEvidence(),
    }),
    /already present/,
  );

  const crossAccount = bundle();
  crossAccount.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence.cloudflare.accountBindingId = "other-account";
  await assert.rejects(
    () => completeUlcLinzM5ProductionFBundle(crossAccount, inputs(), {
      fetchImpl: cloudflareFetch,
      now: NOW,
      accessCollector: async () => validAccess,
      deliveryCollector: async () => validDelivery,
      retentionEvidenceReader: async () => retentionEvidence(),
    }),
    /resource binding evidence is invalid/,
  );
});

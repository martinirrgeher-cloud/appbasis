import assert from "node:assert/strict";
import test from "node:test";

import { completeUlcLinzM5ProductionGBundle } from "./ulc-linz-m5-production-g-evidence.mjs";
import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "./ulc-linz-m5-provider-evidence.mjs";

const SHA = "a".repeat(40);
const VERSION = "12345678-1234-4123-8123-123456789abc";
const HISTORICAL_VERSION = "22345678-1234-4123-8123-123456789abc";
const OBSERVED_AT = "2026-08-23T21:55:00.000Z";
const VALID_UNTIL = "2026-08-23T22:10:00.000Z";
const PRODUCTION_URL =
  "postgresql://app_owner:pw@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const BASE_DATA_FLOWS = [
  { from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing", status: "verified" },
  { from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence", status: "verified" },
  { from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read", status: "verified" },
  { from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read", status: "verified" },
  { from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery", status: "verified" },
];

function bundle() {
  const resourceBindingEvidence = {
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
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    definition: { appId: "ulc-linz" },
    ownerInputs: {
      providerBoundEvidenceInput: {
        resourceBindingEvidence,
        complianceEvidence: {
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
              routeBound: false,
              runtimeClass: "standard-workers",
              bindingsInventoryComplete: true,
              bindings: [
                { type: "hyperdrive", personalDataDisposition: "transient" },
                { type: "hyperdrive", personalDataDisposition: "transient" },
              ],
              telemetryInventoryComplete: true,
              transportEncryptionObserved: false,
              regionalServicesEnabled: null,
              customerMetadataBoundaryEnabled: null,
            },
            "neon-postgresql": {
              resourceClass: "production",
              projectBound: true,
              databaseBound: true,
              regionId: "aws-eu-central-1",
              regionSource: "provider-api",
              transportEncryptionObserved: false,
              atRestEncryptionObserved: false,
            },
          },
          legalEvidence: [],
          dataFlows: structuredClone(BASE_DATA_FLOWS),
        },
        complianceResourceBindingFingerprint: `sha256:${"2".repeat(64)}`,
      },
    },
  };
}

function response(value) {
  return { ok: true, async json() { return structuredClone(value); } };
}

function hyperdrive(id, user) {
  return {
    success: true,
    result: {
      id,
      origin: {
        scheme: "postgresql",
        host: "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",
        port: 5432,
        database: "neondb",
        user,
      },
      caching: { disabled: true },
    },
  };
}

function providerFetch(url) {
  const value = String(url);
  if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
    return Promise.resolve(response({
      success: true,
      result: {
        deployments: [
          { versions: [{ version_id: VERSION, percentage: 100 }] },
          { versions: [{ version_id: HISTORICAL_VERSION, percentage: 100 }] },
        ],
      },
    }));
  }
  if (value.endsWith(`/workers/scripts/appbasis-ulc-linz-production/versions/${VERSION}`)) {
    return Promise.resolve(response({
      success: true,
      result: {
        id: VERSION,
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
  if (value.endsWith("/accounts/account-1/hyperdrive/configs/hyperdrive-main")) {
    return Promise.resolve(response(hyperdrive("hyperdrive-main", "app_owner")));
  }
  if (value.endsWith("/accounts/account-1/hyperdrive/configs/hyperdrive-security")) {
    return Promise.resolve(response(hyperdrive("hyperdrive-security", "ulc_security_ingest_login")));
  }
  if (value.endsWith("/projects/project-1")) {
    return Promise.resolve(response({
      project: {
        id: "project-1",
        name: "appbasis-ulc-linz-production",
        region_id: "aws-eu-central-1",
      },
    }));
  }
  throw new Error(`Unexpected provider URL: ${value}`);
}

function legalEvidence(input) {
  const common = {
    observedAt: input.observedAt,
    validUntilOrReviewAt: input.validUntilOrReviewAt,
    transferModelConsistentWithAdr022: null,
  };
  return [
    {
      provider: "cloudflare",
      documentType: "dpa",
      canonicalSource: "https://www.cloudflare.com/cloudflare-customer-dpa/",
      documentVersionOrUpdatedAt: "6.4 / 2026-04-03",
      serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES.cloudflare,
      accountSpecific: false,
      publicBaseline: true,
      ...common,
    },
    {
      provider: "cloudflare",
      documentType: "dpa-account-binding",
      canonicalSource: "https://www.cloudflare.com/trust-hub/gdpr/",
      documentVersionOrUpdatedAt: "current",
      serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES.cloudflare,
      accountSpecific: true,
      publicBaseline: false,
      ...common,
    },
    {
      provider: "neon-databricks",
      documentType: "terms",
      canonicalSource: "https://neon.com/platform-terms",
      documentVersionOrUpdatedAt: "2026-08-05",
      serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES["neon-databricks"],
      accountSpecific: false,
      publicBaseline: true,
      ...common,
    },
  ];
}

function inputs(overrides = {}) {
  return {
    cloudflareAccountId: "account-1",
    cloudflareApiToken: "cf-token",
    neonApiKey: "neon-key",
    productionDatabaseUrl: PRODUCTION_URL,
    githubSha: SHA,
    ...overrides,
  };
}

async function complete({ value = bundle(), input = inputs(), fetchImpl = providerFetch, legalCollector } = {}) {
  return completeUlcLinzM5ProductionGBundle(value, input, {
    fetchImpl,
    legalCollector:
      legalCollector ??
      (async (binding) => {
        assert.equal(binding.cloudflareAccountBound, true);
        assert.equal(binding.neonProjectBound, true);
        return legalEvidence(binding);
      }),
  });
}

test("completes G from the active Cloudflare deployment even when older deployment history exists", async () => {
  const result = await complete();
  const compliance = result.ownerInputs.providerBoundEvidenceInput.complianceEvidence;
  assert.equal(compliance.providers.cloudflare.transportEncryptionObserved, true);
  assert.equal(
    compliance.providers["neon-postgresql"].transportEncryptionObserved,
    true,
  );
  assert.equal(
    compliance.providers["neon-postgresql"].atRestEncryptionObserved,
    true,
  );
  assert.equal(compliance.legalEvidence.length, 3);
  assert.equal(compliance.dataFlows.length, 6);
  assert.deepEqual(
    compliance.dataFlows.find((flow) => flow.purpose === "security-log-persistence"),
    {
      from: "cloudflare",
      to: "neon-postgresql",
      purpose: "security-log-persistence",
      status: "verified",
    },
  );
  assert.equal(JSON.stringify(result).includes("ulc_security_ingest_login"), false);
  assert.equal(JSON.stringify(result).includes("cf-token"), false);
  assert.equal(JSON.stringify(result).includes("neon-key"), false);
  assert.equal(JSON.stringify(result).includes("postgresql://"), false);
});

test("fails closed when the base flow inventory is missing, decorated or already includes unowned flow evidence", async () => {
  for (const mutate of [
    (value) => { value.ownerInputs.providerBoundEvidenceInput.complianceEvidence.dataFlows.pop(); },
    (value) => { value.ownerInputs.providerBoundEvidenceInput.complianceEvidence.dataFlows.push({ from: "x", to: "y", purpose: "unknown", status: "verified" }); },
    (value) => { value.ownerInputs.providerBoundEvidenceInput.complianceEvidence.dataFlowInventoryComplete = false; },
  ]) {
    const value = bundle();
    mutate(value);
    await assert.rejects(
      () => complete({ value }),
      /base evidence must be unclaimed and exact/,
    );
  }
});

test("fails closed on insecure direct database TLS or either Hyperdrive TLS drift", async () => {
  await assert.rejects(
    () => complete({ input: inputs({ productionDatabaseUrl: PRODUCTION_URL.replace("sslmode=require", "sslmode=disable") }) }),
    /TLS configuration is invalid/,
  );

  for (const target of ["hyperdrive-main", "hyperdrive-security"]) {
    const fetchImpl = async (url) => {
      const result = await providerFetch(url);
      if (String(url).endsWith(`/hyperdrive/configs/${target}`)) {
        const body = await result.json();
        body.result.mtls = { sslmode: "none" };
        return response(body);
      }
      return result;
    };
    await assert.rejects(
      () => complete({ fetchImpl }),
      /Hyperdrive binding is invalid/,
    );
  }
});

test("fails closed when security Hyperdrive points elsewhere or reuses the app database role", async () => {
  for (const mutate of [
    (body) => { body.result.origin.host = "other.example.neon.tech"; },
    (body) => { body.result.origin.user = "app_owner"; },
  ]) {
    const fetchImpl = async (url) => {
      const result = await providerFetch(url);
      if (String(url).endsWith("/hyperdrive/configs/hyperdrive-security")) {
        const body = await result.json();
        mutate(body);
        return response(body);
      }
      return result;
    };
    await assert.rejects(() => complete({ fetchImpl }));
  }
});

test("fails closed on stale Worker head, missing dedicated binding, cross-account, wrong Neon project or preclaimed G evidence", async () => {
  const staleWorker = async (url) => {
    const result = await providerFetch(url);
    if (String(url).includes("/versions/")) {
      const body = await result.json();
      body.result.annotations["workers/message"] = `AppBasis ulc-linz production runtime ${"c".repeat(40)} auth-hmac:x`;
      return response(body);
    }
    return result;
  };
  await assert.rejects(() => complete({ fetchImpl: staleWorker }), /not bound to current main/);

  const missingBinding = async (url) => {
    const result = await providerFetch(url);
    if (String(url).includes("/versions/")) {
      const body = await result.json();
      body.result.resources.bindings = body.result.resources.bindings.filter(
        (entry) => entry.name !== "SECURITY_LOG_HYPERDRIVE",
      );
      return response(body);
    }
    return result;
  };
  await assert.rejects(() => complete({ fetchImpl: missingBinding }), /bindings are not exact/);

  await assert.rejects(
    () => complete({ input: inputs({ cloudflareAccountId: "other-account" }) }),
    /bound production evidence is invalid/,
  );

  const wrongNeon = async (url) => {
    const result = await providerFetch(url);
    if (String(url).endsWith("/projects/project-1")) {
      const body = await result.json();
      body.project.region_id = "aws-us-east-1";
      return response(body);
    }
    return result;
  };
  await assert.rejects(
    () => complete({ fetchImpl: wrongNeon }),
    /Neon project binding is invalid/,
  );

  const preclaimed = bundle();
  preclaimed.ownerInputs.providerBoundEvidenceInput.complianceEvidence.legalEvidence = [{}];
  await assert.rejects(
    () => complete({ value: preclaimed }),
    /must be unclaimed/,
  );
});

test("fails closed when live legal evidence is unavailable", async () => {
  await assert.rejects(
    () => complete({ legalCollector: async () => [] }),
    /legal evidence is unavailable/,
  );
});

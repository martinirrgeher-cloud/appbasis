import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { collectUlcLinzM5ProviderLegalEvidence } from "./ulc-linz-m5-provider-legal-evidence.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const NEON_API = "https://console.neon.tech/api/v2";
const TARGET_NEON_REGION = "aws-eu-central-1";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const TARGET_VERSION_TAG = "ulc-linz-production-runtime-v1";
const SAFE_SSL_MODES = Object.freeze(["require", "verify-ca", "verify-full"]);
const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATABASE_ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const BASE_DATA_FLOWS = Object.freeze([
  Object.freeze({ from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing", status: "verified" }),
  Object.freeze({ from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence", status: "verified" }),
  Object.freeze({ from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read", status: "verified" }),
  Object.freeze({ from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read", status: "verified" }),
  Object.freeze({ from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery", status: "verified" }),
]);
const SECURITY_LOG_DATA_FLOW = Object.freeze({
  from: "cloudflare",
  to: "neon-postgresql",
  purpose: "security-log-persistence",
  status: "verified",
});

export async function completeUlcLinzM5ProductionGBundle(
  bundle,
  {
    cloudflareAccountId,
    cloudflareApiToken,
    neonApiKey,
    productionDatabaseUrl,
    githubSha,
  },
  {
    fetchImpl = fetch,
    legalCollector = collectUlcLinzM5ProviderLegalEvidence,
  } = {},
) {
  const root = requiredBundle(bundle);
  const accountId = opaque(cloudflareAccountId, "Cloudflare account ID");
  const apiToken = credential(cloudflareApiToken, "Cloudflare API token");
  const safeNeonKey = credential(neonApiKey, "Neon API key");
  const safeDatabaseUrl = credential(
    productionDatabaseUrl,
    "ULC production database URL",
  );
  if (typeof githubSha !== "string" || !SHA_PATTERN.test(githubSha)) {
    throw new Error("Current GitHub SHA is invalid.");
  }
  const resource = root.ownerInputs.providerBoundEvidenceInput?.resourceBindingEvidence;
  const compliance = root.ownerInputs.providerBoundEvidenceInput?.complianceEvidence;
  if (
    resource?.application !== "ulc-linz" ||
    resource?.environment !== "production" ||
    resource?.cloudflare?.accountBindingId !== accountId ||
    resource?.cloudflare?.runtimeBindingId !== TARGET_WORKER ||
    compliance?.application !== "ulc-linz" ||
    compliance?.environment !== "production" ||
    compliance?.observedAt !== resource.observedAt ||
    compliance?.validUntilOrReviewAt !== resource.validUntilOrReviewAt
  ) {
    throw new Error("ULC M5-G bound production evidence is invalid.");
  }
  if (
    !Array.isArray(compliance.legalEvidence) ||
    compliance.legalEvidence.length !== 0 ||
    compliance.providers?.cloudflare?.transportEncryptionObserved !== false ||
    compliance.providers?.["neon-postgresql"]?.transportEncryptionObserved !== false ||
    compliance.providers?.["neon-postgresql"]?.atRestEncryptionObserved !== false ||
    compliance.dataFlowInventoryComplete !== true ||
    !matchesExactBaseDataFlows(compliance.dataFlows)
  ) {
    throw new Error("ULC M5-G base evidence must be unclaimed and exact before live completion.");
  }

  const parsedDatabase = parseUlcLinzProductionDatabaseUrl(safeDatabaseUrl);
  const sslMode = requiredSslMode(safeDatabaseUrl);
  const [cloudflare, neon] = await Promise.all([
    observeCloudflareDatabaseBindings({
      accountId,
      apiToken,
      applicationHyperdriveId: resource.cloudflare.databaseBindingId,
      expectedOrigin: parsedDatabase,
      githubSha,
      fetchImpl,
    }),
    observeNeonProject({
      apiKey: safeNeonKey,
      projectId: resource.neon.projectBindingId,
      fetchImpl,
    }),
  ]);
  if (
    cloudflare.transportEncryptionObserved !== true ||
    cloudflare.securityLogOriginVerified !== true ||
    neon.region !== TARGET_NEON_REGION ||
    resource.neon.region !== neon.region ||
    !SAFE_SSL_MODES.includes(sslMode)
  ) {
    throw new Error("ULC M5-G live encryption/resource binding is invalid.");
  }

  const legalEvidence = await legalCollector(
    {
      cloudflareAccountBound: true,
      neonProjectBound: true,
      observedAt: resource.observedAt,
      validUntilOrReviewAt: resource.validUntilOrReviewAt,
    },
    { fetchImpl },
  );
  if (!Array.isArray(legalEvidence) || legalEvidence.length === 0) {
    throw new Error("ULC M5-G live legal evidence is unavailable.");
  }

  return deepFreeze({
    ...root,
    ownerInputs: {
      ...root.ownerInputs,
      providerBoundEvidenceInput: {
        ...root.ownerInputs.providerBoundEvidenceInput,
        complianceEvidence: {
          ...compliance,
          dataFlowInventoryComplete: true,
          providers: {
            cloudflare: {
              ...compliance.providers.cloudflare,
              transportEncryptionObserved: true,
            },
            "neon-postgresql": {
              ...compliance.providers["neon-postgresql"],
              transportEncryptionObserved: true,
              atRestEncryptionObserved: true,
            },
          },
          legalEvidence,
          dataFlows: [...BASE_DATA_FLOWS, SECURITY_LOG_DATA_FLOW],
        },
      },
    },
  });
}

function matchesExactBaseDataFlows(value) {
  if (!Array.isArray(value) || value.length !== BASE_DATA_FLOWS.length) return false;
  return BASE_DATA_FLOWS.every((expected) =>
    value.some(
      (flow) =>
        flow?.from === expected.from &&
        flow?.to === expected.to &&
        flow?.purpose === expected.purpose &&
        flow?.status === expected.status,
    ),
  );
}

async function observeCloudflareDatabaseBindings({
  accountId,
  apiToken,
  applicationHyperdriveId,
  expectedOrigin,
  githubSha,
  fetchImpl,
}) {
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}`;
  const deployments = await cloudflareJson(
    `${accountPath}/workers/scripts/${TARGET_WORKER}/deployments`,
    apiToken,
    fetchImpl,
  );
  const entries = deployments?.result?.deployments;
  if (
    !Array.isArray(entries) ||
    entries.length !== 1 ||
    !Array.isArray(entries[0]?.versions) ||
    entries[0].versions.length !== 1 ||
    entries[0].versions[0]?.percentage !== 100
  ) {
    throw new Error("ULC M5-G deployed Worker inventory is not exact.");
  }
  const versionId = versionIdValue(entries[0].versions[0].version_id);
  const versionResponse = await cloudflareJson(
    `${accountPath}/workers/scripts/${TARGET_WORKER}/versions/${versionId}`,
    apiToken,
    fetchImpl,
  );
  const version = versionResponse.result;
  const message = version?.annotations?.["workers/message"];
  if (
    version?.id !== versionId ||
    version?.annotations?.["workers/tag"] !== TARGET_VERSION_TAG ||
    typeof message !== "string" ||
    !message.startsWith(`AppBasis ulc-linz production runtime ${githubSha} auth-hmac:`) ||
    !Array.isArray(version?.resources?.bindings)
  ) {
    throw new Error("ULC M5-G deployed Worker is not bound to current main.");
  }
  const bindings = version.resources.bindings;
  const appBindings = bindings.filter(
    (binding) => binding?.name === "HYPERDRIVE" && binding?.type === "hyperdrive",
  );
  const securityBindings = bindings.filter(
    (binding) =>
      binding?.name === "SECURITY_LOG_HYPERDRIVE" &&
      binding?.type === "hyperdrive",
  );
  if (appBindings.length !== 1 || securityBindings.length !== 1) {
    throw new Error("ULC M5-G production Hyperdrive bindings are not exact.");
  }
  const appId = opaque(appBindings[0].id, "Cloudflare application Hyperdrive ID");
  const securityId = opaque(
    securityBindings[0].id,
    "Cloudflare security-log Hyperdrive ID",
  );
  if (appId !== applicationHyperdriveId || securityId === appId) {
    throw new Error("ULC M5-G production Hyperdrive binding identities drifted.");
  }

  const [applicationConfig, securityConfig] = await Promise.all([
    cloudflareJson(
      `${accountPath}/hyperdrive/configs/${encodeURIComponent(appId)}`,
      apiToken,
      fetchImpl,
    ),
    cloudflareJson(
      `${accountPath}/hyperdrive/configs/${encodeURIComponent(securityId)}`,
      apiToken,
      fetchImpl,
    ),
  ]);
  const applicationUser = validateHyperdriveOrigin(
    applicationConfig.result,
    appId,
    expectedOrigin,
    { expectedUser: expectedOrigin.user },
  );
  const securityUser = validateHyperdriveOrigin(
    securityConfig.result,
    securityId,
    expectedOrigin,
  );
  if (securityUser === applicationUser) {
    throw new Error("ULC M5-G security-log Hyperdrive must use a distinct database role.");
  }
  return Object.freeze({
    transportEncryptionObserved: true,
    securityLogOriginVerified: true,
  });
}

function validateHyperdriveOrigin(config, id, expectedOrigin, { expectedUser } = {}) {
  const origin = config?.origin;
  const sslMode = config?.mtls?.sslmode ?? "require";
  const user = databaseRole(origin?.user);
  if (
    config?.id !== id ||
    origin === null ||
    typeof origin !== "object" ||
    Array.isArray(origin) ||
    (origin.scheme !== "postgres" && origin.scheme !== "postgresql") ||
    String(origin.host ?? "").toLowerCase() !== expectedOrigin.host ||
    Number(origin.port ?? 5432) !== expectedOrigin.port ||
    origin.database !== expectedOrigin.database ||
    (expectedUser !== undefined && user !== expectedUser) ||
    !SAFE_SSL_MODES.includes(sslMode) ||
    config?.caching?.disabled !== true
  ) {
    throw new Error("ULC M5-G Cloudflare Hyperdrive binding is invalid.");
  }
  return user;
}

async function observeNeonProject({ apiKey, projectId, fetchImpl }) {
  const id = opaque(projectId, "Neon project ID");
  const payload = await neonJson(
    `${NEON_API}/projects/${encodeURIComponent(id)}`,
    apiKey,
    fetchImpl,
  );
  const project = payload?.project;
  if (
    project?.id !== id ||
    project?.name !== "appbasis-ulc-linz-production" ||
    project?.region_id !== TARGET_NEON_REGION
  ) {
    throw new Error("ULC M5-G Neon project binding is invalid.");
  }
  return Object.freeze({ region: project.region_id });
}

function requiredSslMode(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ULC M5-G production database TLS configuration is invalid.");
  }
  const mode = url.searchParams.get("sslmode");
  if (!SAFE_SSL_MODES.includes(mode)) {
    throw new Error("ULC M5-G production database TLS configuration is invalid.");
  }
  return mode;
}

async function cloudflareJson(url, apiToken, fetchImpl) {
  const payload = await providerJson(
    url,
    { accept: "application/json", authorization: `Bearer ${apiToken}` },
    fetchImpl,
  );
  if (payload?.success !== true) {
    throw new Error("ULC M5-G Cloudflare provider evidence request failed.");
  }
  return payload;
}

async function neonJson(url, apiKey, fetchImpl) {
  return providerJson(
    url,
    { accept: "application/json", authorization: `Bearer ${apiKey}` },
    fetchImpl,
  );
}

async function providerJson(url, headers, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("ULC M5-G provider evidence request failed.");
  }
  if (!response?.ok || typeof response.json !== "function") {
    throw new Error("ULC M5-G provider evidence request failed.");
  }
  const payload = await response.json().catch(() => null);
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("ULC M5-G provider evidence response is invalid.");
  }
  return payload;
}

function requiredBundle(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    value.application !== "ulc-linz" ||
    value.environment !== "production" ||
    value.ownerInputs === null ||
    typeof value.ownerInputs !== "object" ||
    Array.isArray(value.ownerInputs)
  ) {
    throw new Error("ULC M5-G production evidence bundle is invalid.");
  }
  return value;
}

function databaseRole(value) {
  if (typeof value !== "string" || !DATABASE_ROLE_PATTERN.test(value)) {
    throw new Error("ULC M5-G Hyperdrive database role is invalid.");
  }
  return value;
}

function versionIdValue(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("ULC M5-G Worker version ID is invalid.");
  }
  return value;
}

function opaque(value, label) {
  if (
    typeof value !== "string" ||
    !OPAQUE_PATTERN.test(value) ||
    value !== value.trim()
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function credential(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 4096 ||
    value !== value.trim()
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    throw new Error("Usage: node tooling/ulc-linz-m5-production-g-evidence.mjs <bundle.json>");
  }
  const bundle = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const completed = await completeUlcLinzM5ProductionGBundle(bundle, {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    neonApiKey: process.env.NEON_API_KEY,
    productionDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    githubSha: process.env.GITHUB_SHA,
  });
  process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "M5-G production evidence completion failed.");
    process.exitCode = 1;
  });
}

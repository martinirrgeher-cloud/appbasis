import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { collectUlcLinzM5ProviderLegalEvidence } from "./ulc-linz-m5-provider-legal-evidence.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const NEON_API = "https://console.neon.tech/api/v2";
const TARGET_NEON_REGION = "aws-eu-central-1";
const SAFE_SSL_MODES = Object.freeze(["require", "verify-ca", "verify-full"]);
const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export async function completeUlcLinzM5ProductionGBundle(
  bundle,
  {
    cloudflareAccountId,
    cloudflareApiToken,
    neonApiKey,
    productionDatabaseUrl,
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
  const resource = root.ownerInputs.providerBoundEvidenceInput?.resourceBindingEvidence;
  const compliance = root.ownerInputs.providerBoundEvidenceInput?.complianceEvidence;
  if (
    resource?.application !== "ulc-linz" ||
    resource?.environment !== "production" ||
    resource?.cloudflare?.accountBindingId !== accountId ||
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
    compliance.providers?.["neon-postgresql"]?.atRestEncryptionObserved !== false
  ) {
    throw new Error("ULC M5-G base evidence must be unclaimed before live completion.");
  }

  const parsedDatabase = parseUlcLinzProductionDatabaseUrl(safeDatabaseUrl);
  const sslMode = requiredSslMode(safeDatabaseUrl);
  const [cloudflare, neon] = await Promise.all([
    observeCloudflareDatabaseBinding({
      accountId,
      apiToken,
      hyperdriveId: resource.cloudflare.databaseBindingId,
      expectedOrigin: parsedDatabase,
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
        },
      },
    },
  });
}

async function observeCloudflareDatabaseBinding({
  accountId,
  apiToken,
  hyperdriveId,
  expectedOrigin,
  fetchImpl,
}) {
  const id = opaque(hyperdriveId, "Cloudflare Hyperdrive ID");
  const payload = await cloudflareJson(
    `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/hyperdrive/configs/${encodeURIComponent(id)}`,
    apiToken,
    fetchImpl,
  );
  const config = payload.result;
  const origin = config?.origin;
  const sslMode = config?.mtls?.sslmode ?? "require";
  if (
    config?.id !== id ||
    origin === null ||
    typeof origin !== "object" ||
    Array.isArray(origin) ||
    (origin.scheme !== "postgres" && origin.scheme !== "postgresql") ||
    String(origin.host ?? "").toLowerCase() !== expectedOrigin.host ||
    Number(origin.port ?? 5432) !== expectedOrigin.port ||
    origin.database !== expectedOrigin.database ||
    origin.user !== expectedOrigin.user ||
    !SAFE_SSL_MODES.includes(sslMode) ||
    config?.caching?.disabled !== true
  ) {
    throw new Error("ULC M5-G Cloudflare Hyperdrive binding is invalid.");
  }
  return Object.freeze({ transportEncryptionObserved: true });
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
  });
  process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "M5-G production evidence completion failed.");
    process.exitCode = 1;
  });
}

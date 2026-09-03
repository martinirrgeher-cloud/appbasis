import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireCurrentUlcLinzCloudflareDeployment } from "./ulc-linz-cloudflare-current-deployment.mjs";
import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { collectUlcLinzM5SecurityLogAccessEvidence } from "./ulc-linz-m5-security-log-access-evidence.mjs";
import { collectUlcLinzM5SecurityLogDeliveryEvidence } from "./ulc-linz-m5-security-log-delivery-evidence.mjs";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const TARGET_DATABASE = "neondb";
const TARGET_NEON_HOST = "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const TARGET_VERSION_TAG = "ulc-linz-production-runtime-v1";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

export async function completeUlcLinzM5ProductionFBundle(
  bundle,
  {
    cloudflareAccountId,
    cloudflareApiToken,
    productionDatabaseUrl,
    backupDatabaseUrl,
    cleanupDatabaseUrl,
    readDatabaseUrl,
    githubSha,
  },
  {
    fetchImpl = fetch,
    githubFetchImpl = fetch,
    now = new Date(),
    accessCollector = collectUlcLinzM5SecurityLogAccessEvidence,
    deliveryCollector = collectUlcLinzM5SecurityLogDeliveryEvidence,
    retentionEvidenceReader = null,
  } = {},
) {
  const nowDate = requiredDate(now);
  const root = requiredBundle(bundle);
  const accountId = opaque(cloudflareAccountId, "Cloudflare account ID");
  const apiToken = credential(cloudflareApiToken, "Cloudflare API token");
  if (typeof githubSha !== "string" || !SHA_PATTERN.test(githubSha)) {
    throw new Error("Current GitHub SHA is invalid.");
  }
  if (root.ownerInputs.auditSecurityLoggingEvidenceInput !== undefined) {
    throw new Error("M5-F audit evidence is already present.");
  }
  const resourceBindingEvidence = root.ownerInputs.providerBoundEvidenceInput?.resourceBindingEvidence;
  if (
    resourceBindingEvidence?.application !== "ulc-linz" ||
    resourceBindingEvidence?.environment !== "production" ||
    resourceBindingEvidence?.cloudflare?.accountBindingId !== accountId ||
    resourceBindingEvidence?.cloudflare?.runtimeBindingId !== TARGET_WORKER
  ) {
    throw new Error("M5-F resource binding evidence is invalid.");
  }

  const safeProductionDatabaseUrl = credential(
    productionDatabaseUrl,
    "ULC production database URL",
  );
  const safeBackupDatabaseUrl = credential(
    backupDatabaseUrl,
    "ULC production backup database URL",
  );
  const safeReadDatabaseUrl = credential(
    readDatabaseUrl,
    "ULC security read database URL",
  );
  const sink = await observeSecurityLogHyperdrive({
    accountId,
    apiToken,
    githubSha,
    fetchImpl,
  });
  const access = await accessCollector({
    productionDatabaseUrl: safeProductionDatabaseUrl,
    backupDatabaseUrl: safeBackupDatabaseUrl,
    cleanupDatabaseUrl: credential(cleanupDatabaseUrl, "ULC security cleanup database URL"),
    readDatabaseUrl: safeReadDatabaseUrl,
    ingestUsername: sink.ingestUsername,
  });
  if (
    access?.leastPrivilegeAccessVerified !== true ||
    access?.protectedOperationalAccessVerified !== true ||
    access?.providerMinimumRetentionVerified !== true
  ) {
    throw new Error("M5-F security-log access evidence is incomplete.");
  }

  const sinkActivity = await deliveryCollector(
    {
      productionDatabaseUrl: safeReadDatabaseUrl,
      deployedAt: sink.deployedAt,
    },
    { now: nowDate },
  );
  if (sinkActivity?.postDeploymentSinkActivityObserved !== true) {
    throw new Error("M5-F post-deployment production sink activity evidence is unavailable.");
  }

  let retentionMode = "controlled-calendar-contract";
  let retentionEvidence = controlledRetentionContractEvidence(access);
  if (retentionEvidenceReader !== null) {
    if (typeof retentionEvidenceReader !== "function") {
      throw new Error("M5-F controlled retention evidence reader is invalid.");
    }
    const retention = await retentionEvidenceReader({
      expectedHeadSha: githubSha,
      fetchImpl: githubFetchImpl,
      now: () => nowDate.getTime(),
    });
    retentionMode = "controlled-calendar-enforcement";
    retentionEvidence = controlledRetentionEvidence(retention, access);
  }

  const loggingEvidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: resourceBindingEvidence.observedAt,
    validUntilOrReviewAt: resourceBindingEvidence.validUntilOrReviewAt,
    inventorySource: "provider-api",
    runtimeBindingId: TARGET_WORKER,
    sinkBindingId: sink.hyperdriveId,
    sinkIdentitySource: "provider-api",
    structuredEventCaptureEnabled: true,
    protectedOperationalAccess: true,
    retentionMode,
    retentionEvidence,
    sinkInventoryComplete: true,
    publicReadEndpointPresent: false,
  };

  return deepFreeze({
    ...root,
    ownerInputs: {
      ...root.ownerInputs,
      auditSecurityLoggingEvidenceInput: {
        resourceBindingEvidence,
        loggingEvidence,
      },
    },
  });
}

async function observeSecurityLogHyperdrive({ accountId, apiToken, githubSha, fetchImpl }) {
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}`;
  const deployments = await cloudflareJson(
    `${accountPath}/workers/scripts/${TARGET_WORKER}/deployments`,
    apiToken,
    fetchImpl,
  );
  const current = requireCurrentUlcLinzCloudflareDeployment(
    deployments?.result?.deployments,
    { label: "M5-F deployed Worker inventory" },
  );
  const deployedAt = canonicalProviderTimestamp(
    current.deployment.created_on,
    "Worker deployment created_on",
  );
  const versionId = versionIdValue(current.version.version_id);
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
    throw new Error("M5-F deployed Worker is not bound to current main.");
  }
  const bindings = version.resources.bindings;
  const securityBindings = bindings.filter(
    (binding) => binding?.name === "SECURITY_LOG_HYPERDRIVE" && binding?.type === "hyperdrive",
  );
  if (securityBindings.length !== 1) {
    throw new Error("M5-F security-log Hyperdrive binding is not exact.");
  }
  const hyperdriveId = opaque(securityBindings[0].id, "security-log Hyperdrive ID");
  const configResponse = await cloudflareJson(
    `${accountPath}/hyperdrive/configs/${encodeURIComponent(hyperdriveId)}`,
    apiToken,
    fetchImpl,
  );
  const config = configResponse.result;
  const origin = config?.origin;
  if (
    config?.id !== hyperdriveId ||
    origin === null || typeof origin !== "object" || Array.isArray(origin) ||
    (origin.scheme !== "postgres" && origin.scheme !== "postgresql") ||
    String(origin.host ?? "").toLowerCase() !== TARGET_NEON_HOST ||
    Number(origin.port ?? 5432) !== 5432 ||
    origin.database !== TARGET_DATABASE ||
    typeof origin.user !== "string" ||
    config?.caching?.disabled !== true
  ) {
    throw new Error("M5-F security-log Hyperdrive origin is invalid.");
  }
  return Object.freeze({
    hyperdriveId,
    ingestUsername: databaseRole(origin.user),
    deployedAt: deployedAt.toISOString(),
  });
}

function controlledRetentionContractEvidence(access) {
  if (
    access?.leastPrivilegeAccessVerified !== true ||
    access?.protectedOperationalAccessVerified !== true ||
    access?.providerMinimumRetentionVerified !== true
  ) {
    throw new Error("M5-F controlled retention contract evidence is unavailable.");
  }
  return {
    source: "production-database-and-authoritative-contract",
    providerMinimumRetentionVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    serverRetentionBoundaryVerified: true,
    leastPrivilegeCleanupVerified: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  };
}

function controlledRetentionEvidence(value, access) {
  if (
    value?.schemaVersion !== 1 ||
    value?.application !== "ulc-linz" ||
    value?.environment !== "production" ||
    value?.evidenceSource !== "github-actions-controlled-production-retention-run" ||
    value?.cleanupExecutionBound !== true ||
    value?.cleanupResultVerified !== true ||
    value?.cutoffSemantics !== "occurred-at-strictly-older-than-12-calendar-months" ||
    value?.boundaryEventPreserved !== true ||
    value?.clientCutoffOverridePresent !== false ||
    value?.enforcementContractDigest !== ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST ||
    typeof value?.cleanupLastSucceededAt !== "string"
  ) {
    throw new Error("M5-F controlled retention run evidence is unavailable.");
  }
  const succeededAt = new Date(value.cleanupLastSucceededAt);
  if (!Number.isFinite(succeededAt.getTime()) || succeededAt.toISOString() !== value.cleanupLastSucceededAt) {
    throw new Error("M5-F controlled retention timestamp is invalid.");
  }
  return {
    source: "controlled-calendar-enforcement",
    providerMinimumRetentionVerified: access.providerMinimumRetentionVerified === true,
    cutoffSemantics: value.cutoffSemantics,
    cleanupExecutionBound: true,
    cleanupLastSucceededAt: value.cleanupLastSucceededAt,
    cleanupResultVerified: true,
    boundaryEventPreserved: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: value.enforcementContractDigest,
  };
}

function requiredBundle(value) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    value.schemaVersion !== 1 || value.application !== "ulc-linz" ||
    value.environment !== "production" || value.ownerInputs === null ||
    typeof value.ownerInputs !== "object" || Array.isArray(value.ownerInputs)
  ) {
    throw new Error("ULC production M5 evidence bundle is invalid.");
  }
  return value;
}

async function cloudflareJson(url, apiToken, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("M5-F Cloudflare evidence request failed.");
  }
  if (!response?.ok || typeof response.json !== "function") {
    throw new Error("M5-F Cloudflare evidence request failed.");
  }
  const payload = await response.json().catch(() => null);
  if (payload?.success !== true) throw new Error("M5-F Cloudflare evidence request failed.");
  return payload;
}

function databaseRole(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(value)) {
    throw new Error("M5-F Hyperdrive database role is invalid.");
  }
  return value;
}
function versionIdValue(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("M5-F Worker version ID is invalid.");
  }
  return value;
}
function opaque(value, label) {
  if (typeof value !== "string" || !OPAQUE_PATTERN.test(value) || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
function credential(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
function canonicalProviderTimestamp(value, label) {
  if (typeof value !== "string") throw new Error(`M5-F ${label} is invalid.`);
  const match = UTC_TIMESTAMP_PATTERN.exec(value);
  if (match === null) throw new Error(`M5-F ${label} is invalid.`);
  const milliseconds = (match[2] ?? "").padEnd(3, "0").slice(0, 3);
  const normalized = `${match[1]}.${milliseconds}Z`;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) {
    throw new Error(`M5-F ${label} is invalid.`);
  }
  return parsed;
}
function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("M5-F evidence clock is invalid.");
  return new Date(value.getTime());
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
    throw new Error("Usage: node tooling/ulc-linz-m5-production-f-evidence.mjs <bundle.json>");
  }
  const bundle = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const completed = await completeUlcLinzM5ProductionFBundle(bundle, {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    productionDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    backupDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
    cleanupDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL,
    readDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
    githubSha: process.env.GITHUB_SHA,
  });
  process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "M5-F production evidence completion failed.");
    process.exitCode = 1;
  });
}

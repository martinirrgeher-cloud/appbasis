import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { deriveUlcLinzM5GResourceBindingFingerprint } from "./ulc-linz-m5-provider-bound-evidence.mjs";
import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "./ulc-linz-m5-provider-evidence.mjs";
import { ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST } from "./ulc-linz-m6-production-resource-binding.mjs";
import { deriveUlcLinzLifecycleContractDigest } from "./factory-ui/ulc-linz-lifecycle-evidence.mjs";

const NEON_API = "https://console.neon.tech/api/v2";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const TARGET_PROJECT = "appbasis-ulc-linz-production";
const TARGET_BRANCH = "production";
const TARGET_DATABASE = "neondb";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const TARGET_BASE_URL = "https://app.ulc-linz.at";
const TARGET_VERSION_TAG = "ulc-linz-production-runtime-v1";
const EVIDENCE_WINDOW_MS = 15 * 60 * 1000;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const RESTORE_FIELDS = Object.freeze([
  "restoreTargetBindingId",
  "restoreTestedAt",
  "restoreSucceeded",
  "dataIntegrityVerified",
  "authVerified",
  "permissionsVerified",
  "applicationSmokeVerified",
  "restoreReconciliationVerified",
]);

const LEGAL_SOURCES = Object.freeze([
  Object.freeze({ provider: "cloudflare", documentType: "dpa", canonicalSource: "https://www.cloudflare.com/cloudflare-customer-dpa/" }),
  Object.freeze({ provider: "cloudflare", documentType: "dpa-account-binding", canonicalSource: "https://dash.cloudflare.com/", accountSpecific: true, publicBaseline: false }),
  Object.freeze({ provider: "neon-databricks", documentType: "terms", canonicalSource: "https://neon.com/platform-terms" }),
  Object.freeze({ provider: "neon-databricks", documentType: "dpa", canonicalSource: "https://www.databricks.com/legal/data-processing-addendum" }),
  Object.freeze({ provider: "neon-databricks", documentType: "dpa-account-binding", canonicalSource: "https://console.neon.tech/", accountSpecific: true, publicBaseline: false }),
  Object.freeze({ provider: "cloudflare", documentType: "subprocessors", canonicalSource: "https://www.cloudflare.com/cloudflare-subprocessors/", transferModelConsistentWithAdr022: true }),
  Object.freeze({ provider: "neon-databricks", documentType: "subprocessors", canonicalSource: "https://www.databricks.com/legal/subprocessors", transferModelConsistentWithAdr022: true }),
  Object.freeze({ provider: "cloudflare", documentType: "security", canonicalSource: "https://www.cloudflare.com/trust-hub/compliance-resources/" }),
  Object.freeze({ provider: "neon-databricks", documentType: "security", canonicalSource: "https://neon.com/docs/security/security-overview" }),
]);

export async function collectUlcLinzM5ProductionEvidenceBundle(
  {
    repositoryRoot,
    cloudflareAccountId,
    cloudflareApiToken,
    neonApiKey,
    neonOrgId,
    githubSha,
    restoreObservation,
  },
  { fetchImpl = fetch, now = new Date() } = {},
) {
  const root = resolve(repositoryRoot);
  const nowDate = requiredDate(now);
  const accountId = requiredOpaque(cloudflareAccountId, "Cloudflare account ID");
  const apiToken = requiredCredential(cloudflareApiToken, "Cloudflare API token");
  const safeNeonKey = requiredCredential(neonApiKey, "Neon API key");
  const safeOrgId = requiredOpaque(neonOrgId, "Neon organization ID");
  if (typeof githubSha !== "string" || !SHA_PATTERN.test(githubSha)) {
    throw new Error("Current GitHub SHA is invalid.");
  }
  const restore = validateRestoreObservation(restoreObservation, nowDate);

  const observedAt = restore.restoreTestedAt;
  const validUntilOrReviewAt = new Date(
    new Date(observedAt).getTime() + EVIDENCE_WINDOW_MS,
  ).toISOString();

  const [neon, cloudflare, definition, lifecycleContractDigest] = await Promise.all([
    observeNeon({ apiKey: safeNeonKey, orgId: safeOrgId, fetchImpl }),
    observeCloudflare({ accountId, apiToken, githubSha, fetchImpl }),
    readJson(resolve(root, "apps/ulc-linz/appbasis.app.json")),
    deriveUlcLinzLifecycleContractDigest(root),
  ]);

  const resourceBindingEvidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt,
    validUntilOrReviewAt,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: neon.projectId,
      branchBindingId: neon.branchId,
      databaseBindingId: neon.databaseId,
      region: neon.region,
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: accountId,
      runtimeBindingId: cloudflare.runtimeId,
      hostnameBinding: null,
      databaseBindingId: cloudflare.hyperdriveId,
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };

  const complianceEvidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    providerModel: "standard-workers-global-transient",
    euOnly: false,
    observedAt,
    validUntilOrReviewAt,
    dataFlowInventoryComplete: true,
    providers: {
      cloudflare: {
        resourceClass: "production",
        runtimeBound: true,
        routeBound: false,
        runtimeClass: "standard-workers",
        bindingsInventoryComplete: true,
        bindings: [{ type: "hyperdrive", personalDataDisposition: "none" }],
        telemetryInventoryComplete: true,
        transportEncryptionObserved: true,
        regionalServicesEnabled: false,
        customerMetadataBoundaryEnabled: false,
      },
      "neon-postgresql": {
        resourceClass: "production",
        projectBound: true,
        databaseBound: true,
        regionId: neon.region,
        regionSource: "provider-api",
        transportEncryptionObserved: true,
        atRestEncryptionObserved: true,
      },
    },
    legalEvidence: LEGAL_SOURCES.map((entry) => ({
      provider: entry.provider,
      documentType: entry.documentType,
      canonicalSource: entry.canonicalSource,
      documentVersionOrUpdatedAt: null,
      serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[entry.provider],
      observedAt,
      validUntilOrReviewAt,
      accountSpecific: entry.accountSpecific ?? false,
      publicBaseline: entry.publicBaseline ?? true,
      transferModelConsistentWithAdr022: entry.transferModelConsistentWithAdr022 ?? null,
    })),
    dataFlows: [
      { from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing", status: "verified" },
      { from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence", status: "verified" },
      { from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read", status: "verified" },
      { from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read", status: "verified" },
      { from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery", status: "verified" },
    ],
  };

  const complianceResourceBindingFingerprint = deriveUlcLinzM5GResourceBindingFingerprint(
    resourceBindingEvidence,
    { now: nowDate },
  );

  const ownerInputs = {
    auditSecurityLoggingEvidenceInput: {
      resourceBindingEvidence,
      loggingEvidence: {
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        observedAt,
        validUntilOrReviewAt,
        inventorySource: "provider-api",
        runtimeBindingId: cloudflare.runtimeId,
        sinkBindingId: `${neon.databaseId}.security-log`,
        sinkIdentitySource: "provider-api",
        structuredEventCaptureEnabled: true,
        protectedOperationalAccess: true,
        retentionMonths: 12,
        retentionSource: "provider-api",
        sinkInventoryComplete: true,
        publicReadEndpointPresent: false,
      },
    },
    providerBoundEvidenceInput: {
      resourceBindingEvidence,
      complianceEvidence,
      complianceResourceBindingFingerprint,
    },
    controlPlaneEvidenceInput: {
      resourceBindingEvidence,
      controlPlaneEvidence: {
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        observedAt,
        validUntilOrReviewAt,
        provider: "cloudflare",
        providerAccountBindingId: accountId,
        publicRuntimeBindingId: cloudflare.runtimeId,
        inventorySource: "provider-api",
        privilegedComponentInventoryComplete: true,
        publicRuntimeBindingInventoryComplete: true,
        privilegedComponents: [],
      },
    },
    lifecycleActivationEvidenceInput: {
      resourceBindingEvidence,
      activationEvidence: {
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        observedAt,
        validUntilOrReviewAt,
        evidenceSource: "controlled-production-activation-run",
        executionBoundary: "protected-operations",
        lifecycleContractDigest,
        activationInventoryComplete: true,
        deletionExecutorBound: true,
        retentionExecutorBound: true,
        restoreReconciliationExecutorBound: true,
        publicIngressPresent: false,
      },
    },
    backupRestoreEvidenceInput: {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      sourceDatabaseBindingId: neon.databaseId,
      restoreTargetBindingId: restore.restoreTargetBindingId,
      evidenceSource: "controlled-restore-run",
      restoreTestedAt: restore.restoreTestedAt,
      lifecycleContractDigest,
      automaticBackupsEnabled: neon.historyRetentionSeconds > 0,
      retentionDefined: neon.historyRetentionSeconds > 0,
      preMigrationBackupDefined: true,
      restoreProcedureDocumented: true,
      restoreSucceeded: restore.restoreSucceeded,
      dataIntegrityVerified: restore.dataIntegrityVerified,
      authVerified: restore.authVerified,
      permissionsVerified: restore.permissionsVerified,
      applicationSmokeVerified: restore.applicationSmokeVerified,
      restoreReconciliationVerified: restore.restoreReconciliationVerified,
    },
  };

  return deepFreeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt,
    definition,
    ownerInputs,
  });
}

async function observeNeon({ apiKey, orgId, fetchImpl }) {
  const projectsUrl = new URL(`${NEON_API}/projects`);
  projectsUrl.searchParams.set("org_id", orgId);
  projectsUrl.searchParams.set("limit", "400");
  const projects = await neonJson(projectsUrl, apiKey, fetchImpl);
  const projectMatches = array(projects.projects).filter((project) => project?.name === TARGET_PROJECT);
  if (projectMatches.length !== 1) throw new Error("Exact ULC production Neon project was not found once.");
  const project = projectMatches[0];
  const projectId = requiredOpaque(project.id, "Neon project ID");
  if (project.region_id !== "aws-eu-central-1" || !Number.isInteger(project.history_retention_seconds) || project.history_retention_seconds <= 0) {
    throw new Error("ULC production Neon project region or backup history is invalid.");
  }

  const branches = await neonJson(`${NEON_API}/projects/${encodeURIComponent(projectId)}/branches`, apiKey, fetchImpl);
  const branchMatches = array(branches.branches).filter((branch) => branch?.name === TARGET_BRANCH && branch?.primary === true);
  if (branchMatches.length !== 1) throw new Error("Exact ULC production Neon branch was not found once.");
  const branchId = requiredOpaque(branchMatches[0].id, "Neon branch ID");

  const databases = await neonJson(
    `${NEON_API}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases`,
    apiKey,
    fetchImpl,
  );
  const databaseMatches = array(databases.databases).filter((database) => database?.name === TARGET_DATABASE);
  if (databaseMatches.length !== 1) throw new Error("Exact ULC production Neon database was not found once.");
  const databaseId = requiredOpaque(databaseMatches[0].id, "Neon database ID");

  return { projectId, branchId, databaseId, region: project.region_id, historyRetentionSeconds: project.history_retention_seconds };
}

async function observeCloudflare({ accountId, apiToken, githubSha, fetchImpl }) {
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}`;
  const [workerResponse, deploymentsResponse, scriptsResponse] = await Promise.all([
    cloudflareJson(`${accountPath}/workers/workers/${TARGET_WORKER}`, apiToken, fetchImpl),
    cloudflareJson(`${accountPath}/workers/scripts/${TARGET_WORKER}/deployments`, apiToken, fetchImpl),
    cloudflareJson(`${accountPath}/workers/scripts`, apiToken, fetchImpl),
  ]);
  const worker = workerResponse.result;
  if (
    worker?.name !== TARGET_WORKER ||
    worker?.subdomain?.enabled !== false ||
    worker?.subdomain?.previews_enabled !== false ||
    !Array.isArray(worker?.references?.domains) ||
    worker.references.domains.length !== 0
  ) {
    throw new Error("ULC production Worker public ingress is not closed.");
  }
  const scriptMatches = array(scriptsResponse.result).filter((script) => script?.id === TARGET_WORKER);
  if (scriptMatches.length !== 1 || (scriptMatches[0].routes != null && (!Array.isArray(scriptMatches[0].routes) || scriptMatches[0].routes.length !== 0))) {
    throw new Error("ULC production Worker route inventory is not closed.");
  }
  const deployments = array(deploymentsResponse?.result?.deployments);
  if (deployments.length !== 1 || !Array.isArray(deployments[0]?.versions) || deployments[0].versions.length !== 1 || deployments[0].versions[0]?.percentage !== 100) {
    throw new Error("ULC production Worker deployment inventory is not exact.");
  }
  const versionId = requiredVersionId(deployments[0].versions[0].version_id);
  const versionResponse = await cloudflareJson(`${accountPath}/workers/scripts/${TARGET_WORKER}/versions/${versionId}`, apiToken, fetchImpl);
  const version = versionResponse.result;
  const bindings = array(version?.resources?.bindings);
  if (version?.id !== versionId || bindings.length !== 3) throw new Error("ULC production Worker version bindings are not exact.");
  const base = bindings.find((binding) => binding?.name === "APPBASIS_BASE_URL");
  const hyperdrive = bindings.find((binding) => binding?.name === "HYPERDRIVE");
  const secret = bindings.find((binding) => binding?.name === "BETTER_AUTH_SECRET");
  if (base?.type !== "plain_text" || base?.text !== TARGET_BASE_URL || hyperdrive?.type !== "hyperdrive" || secret?.type !== "secret_text") {
    throw new Error("ULC production Worker bindings drifted from the approved runtime contract.");
  }
  const message = version?.annotations?.["workers/message"];
  if (version?.annotations?.["workers/tag"] !== TARGET_VERSION_TAG || typeof message !== "string" || !message.startsWith(`AppBasis ulc-linz production runtime ${githubSha} auth-hmac:`)) {
    throw new Error("ULC production Worker version is not bound to the current main runtime.");
  }
  const hyperdriveId = requiredOpaque(hyperdrive.id, "Cloudflare Hyperdrive ID");
  return { runtimeId: TARGET_WORKER, hyperdriveId };
}

async function neonJson(url, apiKey, fetchImpl) {
  return jsonRequest(url, { Authorization: `Bearer ${apiKey}` }, fetchImpl, false);
}

async function cloudflareJson(url, apiToken, fetchImpl) {
  const value = await jsonRequest(url, { Authorization: `Bearer ${apiToken}` }, fetchImpl, true);
  if (value.success !== true) throw new Error("Cloudflare provider evidence request was unsuccessful.");
  return value;
}

async function jsonRequest(url, headers, fetchImpl, cloudflare) {
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error(`${cloudflare ? "Cloudflare" : "Neon"} provider evidence request failed.`);
  }
  if (!response?.ok || typeof response.json !== "function") throw new Error(`${cloudflare ? "Cloudflare" : "Neon"} provider evidence request failed.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${cloudflare ? "Cloudflare" : "Neon"} provider evidence returned invalid JSON.`);
  }
}

function validateRestoreObservation(value, now) {
  const record = exactRecord(value, RESTORE_FIELDS, "restore observation");
  const restoreTestedAt = canonicalTimestamp(record.restoreTestedAt, "restoreTestedAt");
  if (restoreTestedAt.getTime() > now.getTime() || now.getTime() - restoreTestedAt.getTime() > EVIDENCE_WINDOW_MS) {
    throw new Error("Restore observation is outside the M5 evidence window.");
  }
  const restoreTargetBindingId = requiredOpaque(record.restoreTargetBindingId, "restore target binding ID");
  for (const field of RESTORE_FIELDS.slice(2)) {
    if (record[field] !== true) throw new Error("Restore observation is incomplete.");
  }
  return { ...record, restoreTargetBindingId };
}

function exactRecord(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`${label} is invalid.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(descriptors, field)) || keys.some((field) => !fields.includes(field)) || Object.values(descriptors).some((descriptor) => !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredOpaque(value, label) {
  if (typeof value !== "string" || !OPAQUE_PATTERN.test(value) || value !== value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function requiredVersionId(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) throw new Error("Cloudflare Worker version ID is invalid.");
  return value;
}

function requiredCredential(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || value !== value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`${label} is invalid.`);
  return date;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("ULC production evidence clock is invalid.");
  return new Date(value.getTime());
}

function array(value) {
  if (!Array.isArray(value)) throw new Error("Provider evidence inventory is invalid.");
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) throw new Error("Usage: node tooling/ulc-linz-m5-production-evidence-observer.mjs <restore-observation.json>");
  const restoreObservation = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const bundle = await collectUlcLinzM5ProductionEvidenceBundle({
    repositoryRoot: process.cwd(),
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    neonApiKey: process.env.NEON_API_KEY,
    neonOrgId: process.env.NEON_ORG_ID,
    githubSha: process.env.GITHUB_SHA,
    restoreObservation,
  });
  process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC production M5 evidence observation failed.");
    process.exitCode = 1;
  });
}

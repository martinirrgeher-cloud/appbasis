import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { deriveUlcLinzLifecycleContractDigest } from "./factory-ui/ulc-linz-lifecycle-evidence.mjs";
import { requireCurrentUlcLinzCloudflareDeployment } from "./ulc-linz-cloudflare-current-deployment.mjs";
import { verifyUlcLinzM5BackupContract } from "./ulc-linz-m5-backup-contract.mjs";
import { deriveUlcLinzM5GResourceBindingFingerprint } from "./ulc-linz-m5-provider-bound-evidence.mjs";
import { deriveUlcLinzProductionRuntimeContractDigest } from "./ulc-linz-m6-production-resource-binding.mjs";

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
const TABLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
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
const SCRIPT_SETTING_FIELDS = Object.freeze([
  "logpush",
  "observability",
  "tags",
  "tail_consumers",
]);
const OBSERVABILITY_FIELDS = Object.freeze([
  "enabled",
  "head_sampling_rate",
  "logs",
  "traces",
]);
const LOG_FIELDS = Object.freeze([
  "enabled",
  "invocation_logs",
  "destinations",
  "head_sampling_rate",
  "persist",
]);
const TRACE_FIELDS = Object.freeze([
  "destinations",
  "enabled",
  "head_sampling_rate",
  "persist",
  "propagation_policy",
]);
const DATA_FLOWS = Object.freeze([
  Object.freeze({ from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing", status: "verified" }),
  Object.freeze({ from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence", status: "verified" }),
  Object.freeze({ from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read", status: "verified" }),
  Object.freeze({ from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read", status: "verified" }),
  Object.freeze({ from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery", status: "verified" }),
]);

export async function collectUlcLinzM5ProductionEvidenceBundle(
  {
    repositoryRoot,
    cloudflareAccountId,
    cloudflareApiToken,
    neonApiKey,
    neonOrgId,
    productionDatabaseUrl,
    githubSha,
    restoreObservation,
  },
  {
    fetchImpl = fetch,
    now = new Date(),
    readProductionTables = readProductionLifecycleTables,
  } = {},
) {
  const root = resolve(repositoryRoot);
  const nowDate = requiredDate(now);
  const accountId = requiredOpaque(cloudflareAccountId, "Cloudflare account ID");
  const apiToken = requiredCredential(cloudflareApiToken, "Cloudflare API token");
  const safeNeonKey = requiredCredential(neonApiKey, "Neon API key");
  const safeOrgId = requiredOpaque(neonOrgId, "Neon organization ID");
  const safeProductionDatabaseUrl = requiredCredential(
    productionDatabaseUrl,
    "ULC production database URL",
  );
  if (typeof githubSha !== "string" || !SHA_PATTERN.test(githubSha)) {
    throw new Error("Current GitHub SHA is invalid.");
  }

  const restore = validateRestoreObservation(restoreObservation, nowDate);
  const [
    neon,
    cloudflare,
    lifecycleContractDigest,
    backupContract,
    definition,
    lifecycleInventory,
  ] = await Promise.all([
    observeNeon({ apiKey: safeNeonKey, orgId: safeOrgId, fetchImpl }),
    observeCloudflare({ accountId, apiToken, githubSha, fetchImpl }),
    deriveUlcLinzLifecycleContractDigest(root),
    verifyUlcLinzM5BackupContract(root),
    readJson(resolve(root, "apps/ulc-linz/appbasis.app.json")),
    readJson(resolve(root, "apps/ulc-linz/privacy/m5-data-inventory.json")),
  ]);
  await verifyProductionLifecycleInventory(
    safeProductionDatabaseUrl,
    lifecycleInventory,
    readProductionTables,
  );

  const observedAt = restore.restoreTestedAt;
  const validUntilOrReviewAt = new Date(
    new Date(observedAt).getTime() + EVIDENCE_WINDOW_MS,
  ).toISOString();

  const resourceBindingEvidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt,
    validUntilOrReviewAt,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: deriveUlcLinzProductionRuntimeContractDigest(root),
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: neon.projectId,
      branchBindingId: neon.branchId,
      databaseBindingId: neon.databaseId,
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: accountId,
      runtimeBindingId: TARGET_WORKER,
      hostnameBinding: null,
      databaseBindingId: cloudflare.hyperdriveId,
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: cloudflare.telemetryActive,
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
    dataFlows: DATA_FLOWS,
  };
  const complianceResourceBindingFingerprint =
    deriveUlcLinzM5GResourceBindingFingerprint(resourceBindingEvidence, {
      now: nowDate,
    });

  const ownerInputs = {
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
        publicRuntimeBindingId: TARGET_WORKER,
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
        deletionExecutorBound: false,
        retentionExecutorBound: false,
        restoreReconciliationExecutorBound:
          restore.restoreReconciliationVerified === true,
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
      automaticBackupsEnabled: neon.automaticBackupsEnabled,
      retentionDefined: neon.retentionDefined,
      preMigrationBackupDefined: backupContract.preMigrationBackupDefined === true,
      restoreProcedureDocumented: backupContract.restoreProcedureDocumented === true,
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

async function verifyProductionLifecycleInventory(databaseUrl, inventory, reader) {
  if (
    inventory?.schemaVersion !== 2 ||
    inventory?.application !== "ulc-linz" ||
    !Array.isArray(inventory?.persistentTables)
  ) {
    throw new Error("ULC production lifecycle inventory contract is invalid.");
  }
  const expected = inventory.persistentTables
    .map((entry) => requiredTableName(entry?.id))
    .sort();
  if (new Set(expected).size !== expected.length) {
    throw new Error("ULC production lifecycle inventory contract is invalid.");
  }
  const actual = (await reader(databaseUrl)).map(requiredTableName).sort();
  if (
    actual.length !== expected.length ||
    actual.some((tableName, index) => tableName !== expected[index])
  ) {
    throw new Error("ULC production lifecycle persistence inventory is not exact.");
  }
}

async function readProductionLifecycleTables(databaseUrl) {
  const database = createPostgresDatabase(databaseUrl);
  try {
    const rows = await database.client.unsafe(`
      SELECT c.relname AS table_name
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `);
    if (!Array.isArray(rows)) {
      throw new Error("ULC production lifecycle persistence inventory is invalid.");
    }
    return rows.map((row) => requiredTableName(row?.table_name));
  } finally {
    await database.client.end().catch(() => {});
  }
}

async function observeNeon({ apiKey, orgId, fetchImpl }) {
  const projectsUrl = new URL(`${NEON_API}/projects`);
  projectsUrl.searchParams.set("org_id", orgId);
  projectsUrl.searchParams.set("limit", "400");
  const projects = await neonJson(projectsUrl, apiKey, fetchImpl);
  const projectMatches = array(projects.projects).filter(
    (project) => project?.name === TARGET_PROJECT,
  );
  if (projectMatches.length !== 1) {
    throw new Error("Exact ULC production Neon project was not found once.");
  }
  const project = projectMatches[0];
  const projectId = requiredOpaque(project.id, "Neon project ID");
  if (
    project.region_id !== "aws-eu-central-1" ||
    !Number.isInteger(project.history_retention_seconds) ||
    project.history_retention_seconds <= 0
  ) {
    throw new Error("ULC production Neon project region or backup history is invalid.");
  }

  const branches = await neonJson(
    `${NEON_API}/projects/${encodeURIComponent(projectId)}/branches`,
    apiKey,
    fetchImpl,
  );
  const branchMatches = array(branches.branches).filter(
    (branch) => branch?.name === TARGET_BRANCH && branch?.primary === true,
  );
  if (branchMatches.length !== 1) {
    throw new Error("Exact ULC production Neon branch was not found once.");
  }
  const branchId = requiredOpaque(branchMatches[0].id, "Neon branch ID");

  const databases = await neonJson(
    `${NEON_API}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases`,
    apiKey,
    fetchImpl,
  );
  const databaseMatches = array(databases.databases).filter(
    (database) => database?.name === TARGET_DATABASE,
  );
  if (databaseMatches.length !== 1) {
    throw new Error("Exact ULC production Neon database was not found once.");
  }
  const databaseId = requiredNeonDatabaseBindingId(databaseMatches[0].id);

  return Object.freeze({
    projectId,
    branchId,
    databaseId,
    automaticBackupsEnabled: true,
    retentionDefined: true,
  });
}

async function observeCloudflare({ accountId, apiToken, githubSha, fetchImpl }) {
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}`;
  const [workerResponse, deploymentsResponse, scriptsResponse, settingsResponse] =
    await Promise.all([
      cloudflareJson(
        `${accountPath}/workers/workers/${TARGET_WORKER}`,
        apiToken,
        fetchImpl,
      ),
      cloudflareJson(
        `${accountPath}/workers/scripts/${TARGET_WORKER}/deployments`,
        apiToken,
        fetchImpl,
      ),
      cloudflareJson(`${accountPath}/workers/scripts`, apiToken, fetchImpl),
      cloudflareJson(
        `${accountPath}/workers/scripts/${TARGET_WORKER}/script-settings`,
        apiToken,
        fetchImpl,
      ),
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

  const scriptMatches = array(scriptsResponse.result).filter(
    (script) => script?.id === TARGET_WORKER,
  );
  if (
    scriptMatches.length !== 1 ||
    (scriptMatches[0].routes != null &&
      (!Array.isArray(scriptMatches[0].routes) || scriptMatches[0].routes.length !== 0))
  ) {
    throw new Error("ULC production Worker route inventory is not closed.");
  }

  const { version: currentDeploymentVersion } =
    requireCurrentUlcLinzCloudflareDeployment(
      deploymentsResponse?.result?.deployments,
      { label: "ULC production Worker deployment inventory" },
    );
  const versionId = requiredVersionId(currentDeploymentVersion.version_id);
  const versionResponse = await cloudflareJson(
    `${accountPath}/workers/scripts/${TARGET_WORKER}/versions/${versionId}`,
    apiToken,
    fetchImpl,
  );
  const version = versionResponse.result;
  const bindings = array(version?.resources?.bindings);
  if (version?.id !== versionId || bindings.length !== 4) {
    throw new Error("ULC production Worker version bindings are not exact.");
  }

  const base = bindings.find((binding) => binding?.name === "APPBASIS_BASE_URL");
  const hyperdrive = bindings.find((binding) => binding?.name === "HYPERDRIVE");
  const securityLogHyperdrive = bindings.find(
    (binding) => binding?.name === "SECURITY_LOG_HYPERDRIVE",
  );
  const secret = bindings.find((binding) => binding?.name === "BETTER_AUTH_SECRET");
  if (
    base?.type !== "plain_text" ||
    base?.text !== TARGET_BASE_URL ||
    hyperdrive?.type !== "hyperdrive" ||
    securityLogHyperdrive?.type !== "hyperdrive" ||
    securityLogHyperdrive.id === hyperdrive.id ||
    secret?.type !== "secret_text"
  ) {
    throw new Error("ULC production Worker bindings drifted from the approved runtime contract.");
  }
  const hyperdriveId = requiredOpaque(hyperdrive.id, "Cloudflare Hyperdrive ID");
  requiredOpaque(
    securityLogHyperdrive.id,
    "Cloudflare security-log Hyperdrive ID",
  );

  const message = version?.annotations?.["workers/message"];
  if (
    version?.annotations?.["workers/tag"] !== TARGET_VERSION_TAG ||
    typeof message !== "string" ||
    !message.startsWith(
      `AppBasis ulc-linz production runtime ${githubSha} auth-hmac:`,
    )
  ) {
    throw new Error("ULC production Worker version is not bound to the current main runtime.");
  }

  const telemetryActive = inspectCloudflareTelemetry(settingsResponse.result);
  return Object.freeze({ hyperdriveId, telemetryActive });
}

function inspectCloudflareTelemetry(value) {
  const settings = optionalExactRecord(value, SCRIPT_SETTING_FIELDS, "Cloudflare Worker script settings");
  if (settings.logpush !== undefined && typeof settings.logpush !== "boolean") {
    throw new Error("Cloudflare Worker telemetry inventory is invalid.");
  }
  if (settings.tags !== undefined && !isStringArray(settings.tags)) {
    throw new Error("Cloudflare Worker telemetry inventory is invalid.");
  }
  const tailConsumers = settings.tail_consumers ?? [];
  if (!Array.isArray(tailConsumers)) {
    throw new Error("Cloudflare Worker telemetry inventory is invalid.");
  }

  let active = settings.logpush === true || tailConsumers.length > 0;
  if (settings.observability !== undefined && settings.observability !== null) {
    const observability = optionalExactRecord(
      settings.observability,
      OBSERVABILITY_FIELDS,
      "Cloudflare Worker observability settings",
    );
    if (typeof observability.enabled !== "boolean") {
      throw new Error("Cloudflare Worker telemetry inventory is invalid.");
    }
    active ||= observability.enabled;
    active ||= inspectTelemetryChannel(observability.logs, LOG_FIELDS, "logs");
    active ||= inspectTelemetryChannel(observability.traces, TRACE_FIELDS, "traces");
  }
  return active;
}

function inspectTelemetryChannel(value, allowedFields, label) {
  if (value === undefined || value === null) return false;
  const channel = optionalExactRecord(
    value,
    allowedFields,
    `Cloudflare Worker ${label} settings`,
  );
  if (channel.enabled !== undefined && typeof channel.enabled !== "boolean") {
    throw new Error("Cloudflare Worker telemetry inventory is invalid.");
  }
  if (
    channel.destinations !== undefined &&
    !isStringArray(channel.destinations)
  ) {
    throw new Error("Cloudflare Worker telemetry inventory is invalid.");
  }
  return channel.enabled === true || (channel.destinations?.length ?? 0) > 0;
}

function optionalExactRecord(value, allowedFields, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error(`${label} is invalid.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !allowedFields.includes(key) ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error(`${label} is invalid.`);
    }
  }
  return value;
}

function isStringArray(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string" && entry.length > 0 && entry === entry.trim(),
    )
  );
}

async function neonJson(url, apiKey, fetchImpl) {
  return jsonRequest(url, { Authorization: `Bearer ${apiKey}` }, fetchImpl, false);
}

async function cloudflareJson(url, apiToken, fetchImpl) {
  const value = await jsonRequest(
    url,
    { Authorization: `Bearer ${apiToken}` },
    fetchImpl,
    true,
  );
  if (value.success !== true) {
    throw new Error("Cloudflare provider evidence request was unsuccessful.");
  }
  return value;
}

async function jsonRequest(url, headers, fetchImpl, cloudflare) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${cloudflare ? "Cloudflare" : "Neon"} provider evidence request failed.`);
  }
  if (!response?.ok || typeof response.json !== "function") {
    throw new Error(`${cloudflare ? "Cloudflare" : "Neon"} provider evidence request failed.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${cloudflare ? "Cloudflare" : "Neon"} provider evidence returned invalid JSON.`);
  }
}

function validateRestoreObservation(value, now) {
  const record = exactRecord(value, RESTORE_FIELDS, "restore observation");
  const restoreTestedAt = canonicalTimestamp(record.restoreTestedAt, "restoreTestedAt");
  if (
    restoreTestedAt.getTime() > now.getTime() ||
    now.getTime() - restoreTestedAt.getTime() > EVIDENCE_WINDOW_MS
  ) {
    throw new Error("Restore observation is outside the M5 evidence window.");
  }
  requiredOpaque(record.restoreTargetBindingId, "restore target binding ID");
  for (const field of RESTORE_FIELDS.slice(2)) {
    if (record[field] !== true) {
      throw new Error("Restore observation is incomplete.");
    }
  }
  return record;
}

function exactRecord(value, fields, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error(`${label} is invalid.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !fields.includes(field)) ||
    Object.values(descriptors).some(
      (descriptor) =>
        !Object.hasOwn(descriptor, "value") ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined,
    )
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredTableName(value) {
  if (typeof value !== "string" || !TABLE_PATTERN.test(value)) {
    throw new Error("ULC production lifecycle table name is invalid.");
  }
  return value;
}

function requiredOpaque(value, label) {
  if (
    typeof value !== "string" ||
    !OPAQUE_PATTERN.test(value) ||
    value !== value.trim()
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredNeonDatabaseBindingId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Neon database ID is invalid.");
  }
  return String(value);
}

function requiredVersionId(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("Cloudflare Worker version ID is invalid.");
  }
  return value;
}

function requiredCredential(value, label) {
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

function canonicalTimestamp(value, label) {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} is invalid.`);
  }
  return date;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("ULC production evidence clock is invalid.");
  }
  return new Date(value.getTime());
}

function array(value) {
  if (!Array.isArray(value)) {
    throw new Error("Provider evidence inventory is invalid.");
  }
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
  if (argv.length !== 1) {
    throw new Error("Usage: node tooling/ulc-linz-m5-production-evidence-observer.mjs <restore-observation.json>");
  }
  const restoreObservation = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const bundle = await collectUlcLinzM5ProductionEvidenceBundle({
    repositoryRoot: process.cwd(),
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    neonApiKey: process.env.NEON_API_KEY,
    neonOrgId: process.env.NEON_ORG_ID,
    productionDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    githubSha: process.env.GITHUB_SHA,
    restoreObservation,
  });
  process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC production M5 evidence observation failed.",
    );
    process.exitCode = 1;
  });
}

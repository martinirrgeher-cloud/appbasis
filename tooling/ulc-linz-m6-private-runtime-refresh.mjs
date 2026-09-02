import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireCurrentUlcLinzCloudflareDeployment } from "./ulc-linz-cloudflare-current-deployment.mjs";

const TARGET_WORKER = "appbasis-ulc-linz-production";
const TARGET_VERSION_TAG = "ulc-linz-production-runtime-v1";
const TARGET_BASE_URL = "https://app.ulc-linz.at";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HMAC_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HISTORICAL_MESSAGE_PATTERN = /^AppBasis ulc-linz production runtime ([0-9a-f]{40}) auth-hmac:([0-9a-f]{64})$/;

export function evaluateUlcLinzPrivateRuntimeRefreshState(
  {
    workerResponse,
    versionsResponse,
    deploymentsResponse,
    scriptsResponse,
    githubSha,
    authSecretFingerprint,
  },
  { requireCurrentVersion = false, requireCurrentDeployment = false } = {},
) {
  requireSha(githubSha);
  requireHmac(authSecretFingerprint);
  requireClosedWorker(workerResponse);
  requireClosedRoutes(scriptsResponse);

  const versions = requireVersionHistory(versionsResponse);
  const expectedMessage = `AppBasis ulc-linz production runtime ${githubSha} auth-hmac:${authSecretFingerprint}`;
  const currentVersions = versions.filter(
    (version) => version.annotations["workers/message"] === expectedMessage,
  );
  if (currentVersions.length > 1) {
    throw new Error("ULC production refresh encountered duplicate current runtime versions.");
  }
  if (requireCurrentVersion && currentVersions.length !== 1) {
    throw new Error("ULC production refresh requires exactly one version bound to current main and auth secret.");
  }

  const deployment = requireSinglePrivateDeployment(deploymentsResponse);
  const deployedVersion = versions.find((version) => version.id === deployment.versionId);
  if (!deployedVersion) {
    throw new Error("ULC production refresh deployment is not present in the trusted version inventory.");
  }
  const deployedMessage = deployedVersion.annotations["workers/message"];
  const match = HISTORICAL_MESSAGE_PATTERN.exec(deployedMessage);
  if (!match || match[2] !== authSecretFingerprint) {
    throw new Error("ULC production refresh deployed runtime is not bound to the current auth-secret fingerprint.");
  }

  const currentVersionId = currentVersions[0]?.id ?? null;
  const currentDeployment = currentVersionId !== null && deployment.versionId === currentVersionId;
  if (requireCurrentDeployment && !currentDeployment) {
    throw new Error("ULC production refresh requires the current main runtime to be the sole deployed version.");
  }

  return Object.freeze({
    currentVersionId,
    deployedVersionId: deployment.versionId,
    currentDeployment,
    uploadRequired: currentVersionId === null,
    deploymentRequired: currentVersionId !== null && !currentDeployment,
  });
}

export function deriveUlcLinzPrivateRuntimeHyperdriveBindings(
  response,
  { versionId },
) {
  requireVersionId(versionId);
  const result = response?.result;
  const bindings = result?.resources?.bindings;
  if (
    response?.success !== true ||
    result?.id !== versionId ||
    !Array.isArray(bindings) ||
    bindings.length !== 4
  ) {
    throw new Error("ULC production refresh version detail or binding inventory is invalid.");
  }
  const base = exactBinding(bindings, "APPBASIS_BASE_URL");
  const app = exactBinding(bindings, "HYPERDRIVE");
  const security = exactBinding(bindings, "SECURITY_LOG_HYPERDRIVE");
  const secret = exactBinding(bindings, "BETTER_AUTH_SECRET");
  requireOpaque(app.id, "application Hyperdrive ID");
  requireOpaque(security.id, "security-log Hyperdrive ID");
  if (
    base.type !== "plain_text" ||
    base.text !== TARGET_BASE_URL ||
    app.type !== "hyperdrive" ||
    security.type !== "hyperdrive" ||
    secret.type !== "secret_text" ||
    app.id === security.id
  ) {
    throw new Error("ULC production refresh version bindings drifted from the approved contract.");
  }
  return Object.freeze({
    applicationHyperdriveId: app.id,
    securityLogHyperdriveId: security.id,
  });
}

export function verifyUlcLinzPrivateRuntimeVersionBindings(
  response,
  {
    versionId,
    applicationHyperdriveId,
    securityLogHyperdriveId,
  },
) {
  requireOpaque(applicationHyperdriveId, "application Hyperdrive ID");
  requireOpaque(securityLogHyperdriveId, "security-log Hyperdrive ID");
  if (applicationHyperdriveId === securityLogHyperdriveId) {
    throw new Error("ULC production refresh Hyperdrive bindings must be distinct.");
  }
  const actual = deriveUlcLinzPrivateRuntimeHyperdriveBindings(response, { versionId });
  if (
    actual.applicationHyperdriveId !== applicationHyperdriveId ||
    actual.securityLogHyperdriveId !== securityLogHyperdriveId
  ) {
    throw new Error("ULC production refresh version bindings drifted from the approved contract.");
  }
  return true;
}

function requireClosedWorker(response) {
  const worker = response?.result;
  if (
    response?.success !== true ||
    worker?.name !== TARGET_WORKER ||
    worker?.subdomain?.enabled !== false ||
    worker?.subdomain?.previews_enabled !== false ||
    !Array.isArray(worker?.references?.domains) ||
    worker.references.domains.length !== 0
  ) {
    throw new Error("ULC production refresh requires the production Worker to remain closed.");
  }
}

function requireClosedRoutes(response) {
  if (response?.success !== true || !Array.isArray(response?.result)) {
    throw new Error("ULC production refresh route inventory is invalid.");
  }
  const matches = response.result.filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && entry.id === TARGET_WORKER,
  );
  if (matches.length !== 1) {
    throw new Error("ULC production refresh route inventory could not identify the Worker exactly once.");
  }
  const routes = matches[0].routes;
  if (routes !== undefined && routes !== null && !Array.isArray(routes)) {
    throw new Error("ULC production refresh route inventory is invalid.");
  }
  if (Array.isArray(routes) && routes.length !== 0) {
    throw new Error("ULC production refresh refuses a Worker with public routes.");
  }
}

function requireVersionHistory(response) {
  if (response?.success !== true || !Array.isArray(response?.result)) {
    throw new Error("ULC production refresh version inventory is invalid.");
  }
  for (const version of response.result) {
    requireVersionId(version?.id);
    const message = version?.annotations?.["workers/message"];
    if (
      version?.annotations?.["workers/tag"] !== TARGET_VERSION_TAG ||
      typeof message !== "string" ||
      !HISTORICAL_MESSAGE_PATTERN.test(message)
    ) {
      throw new Error("ULC production refresh encountered an unrecognized version in history.");
    }
  }
  return response.result;
}

function requireSinglePrivateDeployment(response) {
  if (response?.success !== true) {
    throw new Error("ULC production refresh deployment inventory is invalid.");
  }
  const { version } = requireCurrentUlcLinzCloudflareDeployment(
    response?.result?.deployments,
    { label: "ULC production refresh deployment inventory" },
  );
  const versionId = version.version_id;
  requireVersionId(versionId);
  return Object.freeze({ versionId });
}

function exactBinding(bindings, name) {
  const matches = bindings.filter((binding) => binding?.name === name);
  if (matches.length !== 1) {
    throw new Error("ULC production refresh version bindings are not exact.");
  }
  return matches[0];
}

function requireSha(value) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error("ULC production refresh GitHub SHA is invalid.");
  }
}

function requireHmac(value) {
  if (typeof value !== "string" || !HMAC_PATTERN.test(value)) {
    throw new Error("ULC production refresh auth-secret fingerprint is invalid.");
  }
}

function requireVersionId(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("ULC production refresh version ID is invalid.");
  }
}

function requireOpaque(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new Error(`ULC production refresh ${label} is invalid.`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main(argv = process.argv.slice(2)) {
  const [mode, ...paths] = argv;
  if ((mode === "state" || mode === "deploy-state") && paths.length === 4) {
    const result = evaluateUlcLinzPrivateRuntimeRefreshState(
      {
        workerResponse: await readJson(paths[0]),
        versionsResponse: await readJson(paths[1]),
        deploymentsResponse: await readJson(paths[2]),
        scriptsResponse: await readJson(paths[3]),
        githubSha: process.env.GITHUB_SHA,
        authSecretFingerprint: process.env.AUTH_SECRET_FINGERPRINT,
      },
      mode === "deploy-state" ? { requireCurrentVersion: true } : {},
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (mode === "post-deploy-state" && paths.length === 4) {
    const result = evaluateUlcLinzPrivateRuntimeRefreshState(
      {
        workerResponse: await readJson(paths[0]),
        versionsResponse: await readJson(paths[1]),
        deploymentsResponse: await readJson(paths[2]),
        scriptsResponse: await readJson(paths[3]),
        githubSha: process.env.GITHUB_SHA,
        authSecretFingerprint: process.env.AUTH_SECRET_FINGERPRINT,
      },
      { requireCurrentVersion: true, requireCurrentDeployment: true },
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (mode === "binding-ids" && paths.length === 1) {
    const result = deriveUlcLinzPrivateRuntimeHyperdriveBindings(await readJson(paths[0]), {
      versionId: process.env.VERSION_ID,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (mode === "bindings" && paths.length === 1) {
    verifyUlcLinzPrivateRuntimeVersionBindings(await readJson(paths[0]), {
      versionId: process.env.VERSION_ID,
      applicationHyperdriveId: process.env.HYPERDRIVE_ID,
      securityLogHyperdriveId: process.env.SECURITY_LOG_HYPERDRIVE_ID,
    });
    process.stdout.write("verified\n");
    return;
  }
  throw new Error("Usage: ulc-linz-m6-private-runtime-refresh.mjs <state|deploy-state|post-deploy-state|binding-ids|bindings> ...");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC private runtime refresh validation failed.");
    process.exitCode = 1;
  });
}

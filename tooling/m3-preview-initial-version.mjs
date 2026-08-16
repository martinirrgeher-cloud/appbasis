import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const M3_PREVIEW_INITIAL_VERSION = Object.freeze({
  workerName: "appbasis-m3-preview",
  tag: "m3-preview-initial-v1",
  sourceSha: "a359d6e6c39771e9d0dae3f73ba9918290356580",
  secretName: "BETTER_AUTH_SECRET",
});

export async function assertM3PreviewInitialVersionPreconditions({
  accountId,
  apiToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateProviderInputs({ accountId, apiToken, fetchImpl });
  const [versions, worker] = await Promise.all([
    listVersions(deployment),
    getWorker(deployment),
  ]);

  if (versions.length !== 0) {
    throw new Error(
      "m3-preview initial version requires a Worker with no existing versions.",
    );
  }
  if (worker.deployed_on !== null) {
    throw new Error(
      "m3-preview initial version requires a Worker that has never been deployed.",
    );
  }

  return Object.freeze({ status: "initial-version-ready" });
}

export async function verifyM3PreviewInitialVersionUpload({
  accountId,
  apiToken,
  versionId,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateProviderInputs({ accountId, apiToken, fetchImpl });
  const normalizedVersionId = requiredVersionId(versionId);
  const [versions, worker] = await Promise.all([
    listVersions(deployment),
    getWorker(deployment),
  ]);

  requireExactInitialVersion(versions, normalizedVersionId);
  if (worker.deployed_on !== null) {
    throw new Error(
      "m3-preview initial version upload unexpectedly created deployed traffic.",
    );
  }

  return Object.freeze({
    status: "initial-version-uploaded",
    versionId: normalizedVersionId,
  });
}

export async function resolveM3PreviewInitialVersionForDeploy({
  accountId,
  apiToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateProviderInputs({ accountId, apiToken, fetchImpl });
  const [versions, worker] = await Promise.all([
    listVersions(deployment),
    getWorker(deployment),
  ]);

  if (versions.length !== 1) {
    throw new Error(
      "m3-preview first deployment requires exactly one Worker version.",
    );
  }
  const versionId = requiredVersionId(versions[0]?.id);
  requireExactInitialVersion(versions, versionId);
  if (worker.deployed_on !== null) {
    throw new Error(
      "m3-preview first deployment requires a Worker that has never been deployed.",
    );
  }

  return Object.freeze({
    status: "initial-version-deployable",
    versionId,
  });
}

export async function verifyM3PreviewInitialVersionDeployment({
  accountId,
  apiToken,
  versionId,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateProviderInputs({ accountId, apiToken, fetchImpl });
  const normalizedVersionId = requiredVersionId(versionId);
  const [versions, worker, deployments] = await Promise.all([
    listVersions(deployment),
    getWorker(deployment),
    listDeployments(deployment),
  ]);

  return verifyExactInitialDeploymentState({
    versions,
    worker,
    deployments,
    versionId: normalizedVersionId,
  });
}

export async function verifyCurrentM3PreviewInitialVersionDeployment({
  accountId,
  apiToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateProviderInputs({ accountId, apiToken, fetchImpl });
  const [versions, worker, deployments] = await Promise.all([
    listVersions(deployment),
    getWorker(deployment),
    listDeployments(deployment),
  ]);

  if (versions.length !== 1) {
    throw new Error(
      "m3-preview recovery requires exactly one Worker version.",
    );
  }
  const versionId = requiredVersionId(versions[0]?.id);
  return verifyExactInitialDeploymentState({
    versions,
    worker,
    deployments,
    versionId,
  });
}

export async function writeM3PreviewInitialSecretsFile({
  outputPath,
  secret,
} = {}) {
  if (
    typeof outputPath !== "string" ||
    outputPath.trim() !== outputPath ||
    outputPath.length === 0
  ) {
    throw new Error("A canonical outputPath is required.");
  }
  const normalizedSecret = requiredBetterAuthSecret(secret);
  await writeFile(
    outputPath,
    `${JSON.stringify({
      [M3_PREVIEW_INITIAL_VERSION.secretName]: normalizedSecret,
    })}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    },
  );
  return outputPath;
}

function validateProviderInputs({ accountId, apiToken, fetchImpl }) {
  if (typeof accountId !== "string" || !ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is invalid.");
  }
  if (
    typeof apiToken !== "string" ||
    apiToken.length === 0 ||
    apiToken.trim() !== apiToken ||
    /\s/u.test(apiToken)
  ) {
    throw new Error("CLOUDFLARE_API_TOKEN is invalid.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetchImpl must be a function.");
  }

  const workerName = encodeURIComponent(M3_PREVIEW_INITIAL_VERSION.workerName);
  const accountUrl = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/workers`;
  const workerUrl = `${accountUrl}/workers/${workerName}`;
  return Object.freeze({
    apiToken,
    fetchImpl,
    workerUrl,
    versionsUrl: `${workerUrl}/versions?page=1&per_page=100`,
    deploymentsUrl: `${accountUrl}/scripts/${workerName}/deployments`,
  });
}

function verifyExactInitialDeploymentState({
  versions,
  worker,
  deployments,
  versionId,
}) {
  requireExactInitialVersion(versions, versionId);
  if (
    typeof worker.deployed_on !== "string" ||
    worker.deployed_on.trim().length === 0
  ) {
    throw new Error(
      "m3-preview initial version deployment did not mark the Worker as deployed.",
    );
  }
  if (deployments.length !== 1) {
    throw new Error(
      "m3-preview first deployment did not produce exactly one deployment.",
    );
  }
  const deployedVersions = deployments[0]?.versions;
  if (
    !Array.isArray(deployedVersions) ||
    deployedVersions.length !== 1 ||
    deployedVersions[0]?.version_id !== versionId ||
    deployedVersions[0]?.percentage !== 100
  ) {
    throw new Error(
      "m3-preview first deployment does not route exactly 100 percent to the initial version.",
    );
  }

  return Object.freeze({
    status: "initial-version-deployed",
    versionId,
  });
}

function requireExactInitialVersion(versions, versionId) {
  const expectedMessage =
    `AppBasis m3-preview initial version ${M3_PREVIEW_INITIAL_VERSION.sourceSha}`;
  if (
    versions.length !== 1 ||
    versions[0]?.id !== versionId ||
    versions[0]?.annotations?.["workers/tag"] !== M3_PREVIEW_INITIAL_VERSION.tag ||
    versions[0]?.annotations?.["workers/message"] !== expectedMessage
  ) {
    throw new Error(
      "m3-preview Worker does not contain the exact expected initial version.",
    );
  }
}

async function listVersions(deployment) {
  const payload = await cloudflareJson(
    deployment,
    deployment.versionsUrl,
    "versions",
  );
  if (!Array.isArray(payload.result)) {
    throw new Error("Cloudflare Worker versions API returned an invalid result.");
  }
  return payload.result;
}

async function getWorker(deployment) {
  const payload = await cloudflareJson(
    deployment,
    deployment.workerUrl,
    "worker",
  );
  if (
    !isRecord(payload.result) ||
    payload.result.name !== M3_PREVIEW_INITIAL_VERSION.workerName ||
    !("deployed_on" in payload.result)
  ) {
    throw new Error("Cloudflare Worker API returned an invalid m3-preview Worker result.");
  }
  return payload.result;
}

async function listDeployments(deployment) {
  const payload = await cloudflareJson(
    deployment,
    deployment.deploymentsUrl,
    "deployments",
  );
  if (!isRecord(payload.result) || !Array.isArray(payload.result.deployments)) {
    throw new Error("Cloudflare Worker deployments API returned an invalid result.");
  }
  return payload.result.deployments;
}

async function cloudflareJson(deployment, url, operation) {
  let response;
  try {
    response = await deployment.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${deployment.apiToken}`,
      },
    });
  } catch {
    throw new Error(`Cloudflare Worker ${operation} API request failed.`);
  }
  if (!(response instanceof Response)) {
    throw new Error(`Cloudflare Worker ${operation} API returned an invalid response.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Cloudflare Worker ${operation} API returned invalid JSON.`);
  }
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    const diagnostics = [];
    if (
      Number.isInteger(response.status) &&
      response.status >= 100 &&
      response.status <= 599
    ) {
      diagnostics.push(`status ${response.status}`);
    }
    const errorCodes = Array.isArray(payload?.errors)
      ? [
          ...new Set(
            payload.errors
              .map((error) => error?.code)
              .filter(
                (code) =>
                  Number.isInteger(code) && code >= 0 && code <= 999_999_999,
              ),
          ),
        ].slice(0, 3)
      : [];
    if (errorCodes.length > 0) {
      diagnostics.push(`codes ${errorCodes.join(",")}`);
    }
    const suffix = diagnostics.length > 0 ? ` (${diagnostics.join("; ")})` : "";
    throw new Error(`Cloudflare Worker ${operation} rejected the request${suffix}.`);
  }
  return payload;
}

function requiredBetterAuthSecret(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 32
  ) {
    throw new Error("BETTER_AUTH_SECRET does not satisfy the runtime contract.");
  }
  return value;
}

function requiredVersionId(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("A canonical Cloudflare Worker version ID is required.");
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = process.argv[2];
    if (mode === "preflight") {
      await assertM3PreviewInitialVersionPreconditions({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
      });
      console.log("m3-preview initial version preflight passed.");
    } else if (mode === "write-secrets-file") {
      await writeM3PreviewInitialSecretsFile({
        outputPath: process.argv[3],
        secret: process.env.APPBASIS_BETTER_AUTH_SECRET,
      });
    } else if (mode === "verify-upload") {
      await verifyM3PreviewInitialVersionUpload({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        versionId: process.argv[3],
      });
      console.log("m3-preview initial version upload verification passed.");
    } else if (mode === "resolve-for-deploy") {
      const result = await resolveM3PreviewInitialVersionForDeploy({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
      });
      console.log(result.versionId);
    } else if (mode === "verify-deploy") {
      await verifyM3PreviewInitialVersionDeployment({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        versionId: process.argv[3],
      });
      console.log("m3-preview initial version deployment verification passed.");
    } else if (mode === "verify-current-deploy") {
      await verifyCurrentM3PreviewInitialVersionDeployment({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
      });
      console.log(
        "m3-preview current deployment matches the exact original initial version and source SHA.",
      );
    } else {
      throw new Error(
        "Expected command mode preflight, write-secrets-file, verify-upload, resolve-for-deploy, verify-deploy or verify-current-deploy.",
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "m3-preview initial version operation failed.",
    );
    process.exitCode = 1;
  }
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export const M3_PREVIEW_WORKER = Object.freeze({
  name: "appbasis-m3-preview",
  subdomainEnabled: true,
  previewUrlsEnabled: false,
});

export async function ensureM3PreviewWorker({
  accountId,
  apiToken,
  apply = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateInputs({ accountId, apiToken, fetchImpl });
  const existingResponse = await readWorker(deployment);

  if (existingResponse.status === 200) {
    return validateWorkerPayload(
      await successPayload(existingResponse, "get"),
      "existing",
    );
  }

  if (existingResponse.status !== 404) {
    throw await cloudflareRejection("get", existingResponse);
  }

  if (apply !== true) {
    throw new Error(
      "Dedicated m3-preview Worker is absent and creation was not explicitly confirmed.",
    );
  }

  await requireAccountSubdomain(deployment);

  const createResponse = await cloudflareRequest(
    deployment.fetchImpl,
    deployment.workerCollectionUrl,
    {
      method: "POST",
      headers: cloudflareHeaders(deployment.apiToken, true),
      body: JSON.stringify({
        name: M3_PREVIEW_WORKER.name,
        subdomain: {
          enabled: M3_PREVIEW_WORKER.subdomainEnabled,
          previews_enabled: M3_PREVIEW_WORKER.previewUrlsEnabled,
        },
      }),
    },
    "create",
  );

  if (createResponse.status < 200 || createResponse.status >= 300) {
    throw await cloudflareRejection("create", createResponse);
  }

  const authoritativeResponse = await readWorker(deployment);
  if (authoritativeResponse.status !== 200) {
    throw await cloudflareRejection("verify", authoritativeResponse);
  }
  return validateWorkerPayload(
    await successPayload(authoritativeResponse, "verify"),
    "created",
  );
}

function validateInputs({ accountId, apiToken, fetchImpl }) {
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

  const accountUrl = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/workers`;
  return Object.freeze({
    apiToken,
    fetchImpl,
    accountSubdomainUrl: `${accountUrl}/subdomain`,
    workerCollectionUrl: `${accountUrl}/workers`,
    workerUrl: `${accountUrl}/workers/${encodeURIComponent(M3_PREVIEW_WORKER.name)}`,
  });
}

function readWorker(deployment) {
  return cloudflareRequest(
    deployment.fetchImpl,
    deployment.workerUrl,
    {
      method: "GET",
      headers: cloudflareHeaders(deployment.apiToken, false),
    },
    "get",
  );
}

async function requireAccountSubdomain(deployment) {
  const response = await cloudflareRequest(
    deployment.fetchImpl,
    deployment.accountSubdomainUrl,
    {
      method: "GET",
      headers: cloudflareHeaders(deployment.apiToken, false),
    },
    "subdomain",
  );
  if (response.status !== 200) {
    throw await cloudflareRejection("subdomain", response);
  }
  const payload = await successPayload(response, "subdomain");
  if (
    typeof payload.result.subdomain !== "string" ||
    !SUBDOMAIN_PATTERN.test(payload.result.subdomain)
  ) {
    throw new Error("Cloudflare Workers account subdomain is unavailable or invalid.");
  }
}

async function cloudflareRequest(fetchImpl, url, options, operation) {
  try {
    const response = await fetchImpl(url, options);
    if (!(response instanceof Response)) {
      throw new Error("invalid response");
    }
    return response;
  } catch {
    throw new Error(`Cloudflare Worker ${operation} API request failed.`);
  }
}

async function successPayload(response, operation) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Cloudflare Worker ${operation} API returned invalid JSON.`);
  }
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.result)) {
    throw new Error(`Cloudflare Worker ${operation} API returned an invalid result.`);
  }
  return payload;
}

function validateWorkerPayload(payload, status) {
  const worker = payload.result;
  const id = worker.id;
  if (
    typeof id !== "string" ||
    !WORKER_ID_PATTERN.test(id) ||
    worker.name !== M3_PREVIEW_WORKER.name ||
    !isRecord(worker.subdomain) ||
    worker.subdomain.enabled !== M3_PREVIEW_WORKER.subdomainEnabled ||
    worker.subdomain.previews_enabled !== M3_PREVIEW_WORKER.previewUrlsEnabled
  ) {
    throw new Error(
      "Dedicated m3-preview Worker does not match the bootstrap contract.",
    );
  }

  return Object.freeze({
    id,
    name: M3_PREVIEW_WORKER.name,
    status,
  });
}

async function cloudflareRejection(operation, response) {
  const diagnostics = [];
  if (
    Number.isInteger(response.status) &&
    response.status >= 100 &&
    response.status <= 599
  ) {
    diagnostics.push(`status ${response.status}`);
  }

  try {
    const payload = await response.json();
    const codes = Array.isArray(payload?.errors)
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
    if (codes.length > 0) diagnostics.push(`codes ${codes.join(",")}`);
  } catch {
    // Provider response bodies are intentionally not surfaced.
  }

  const suffix = diagnostics.length > 0 ? ` (${diagnostics.join("; ")})` : "";
  return new Error(`Cloudflare Worker ${operation} rejected the request${suffix}.`);
}

function cloudflareHeaders(apiToken, includeContentType) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiToken}`,
    ...(includeContentType ? { "content-type": "application/json" } : {}),
  };
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
    if (process.argv[2] !== "ensure") {
      throw new Error("Expected command mode ensure.");
    }
    const result = await ensureM3PreviewWorker({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      apply: process.env.APPBASIS_APPLY_WORKER === "1",
    });
    console.log(
      result.status === "created"
        ? "Dedicated m3-preview Worker was created."
        : "Dedicated m3-preview Worker already exists and matches the contract.",
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "m3-preview Worker bootstrap failed.",
    );
    process.exitCode = 1;
  }
}

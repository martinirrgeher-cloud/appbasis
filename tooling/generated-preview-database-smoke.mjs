import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

export async function verifyGeneratedPreviewDatabaseBinding({
  baseURL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseURL = requiredHttpsOrigin(baseURL);
  validateTransport(fetchImpl, timeoutMs);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${normalizedBaseURL}/api/health/database`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      },
    );
    if (!(response instanceof Response)) {
      throw new Error("Generated preview database smoke returned an invalid response.");
    }
    if (response.status !== 200) {
      throw new Error("Generated preview database health probe did not succeed.");
    }
    if (response.headers.has("set-cookie")) {
      throw new Error("Generated preview database health probe unexpectedly established a session.");
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Generated preview database health probe returned invalid JSON.");
    }
    if (!isExactDatabaseHealthPayload(payload)) {
      throw new Error("Generated preview database health probe returned an invalid payload.");
    }

    return Object.freeze({ status: "database-reachable" });
  } finally {
    clearTimeout(timeout);
  }
}

function validateTransport(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetchImpl must be a function.");
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error("timeoutMs must be an integer between 1 and 30000.");
  }
}

function isExactDatabaseHealthPayload(payload) {
  return (
    isRecord(payload) &&
    Object.keys(payload).length === 3 &&
    payload.status === "ok" &&
    payload.appId === "tasks-minimal" &&
    payload.database === "reachable"
  );
}

function requiredHttpsOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("baseURL must be a canonical HTTPS origin.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("baseURL must be a canonical HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("baseURL must be a canonical HTTPS origin.");
  }
  return url.origin;
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
    await verifyGeneratedPreviewDatabaseBinding({
      baseURL: process.env.APPBASIS_GENERATED_PREVIEW_URL,
    });
    console.log("Generated preview database binding smoke passed.");
  } catch {
    console.error("Generated preview database binding smoke failed.");
    process.exitCode = 1;
  }
}

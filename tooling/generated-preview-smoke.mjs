import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const SESSION_INVALID_MESSAGE = "A valid session is required.";

export async function verifyGeneratedPreviewHealth({
  baseURL,
  appId,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseURL = requiredHttpsOrigin(baseURL);
  const normalizedAppId = requiredIdentifier(appId);
  validateTransport(fetchImpl, timeoutMs);

  return withTimedResponse(
    fetchImpl,
    `${normalizedBaseURL}/api/health`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
    },
    timeoutMs,
    async (response) => {
      if (response.status !== 200) {
        throw new Error("Generated preview health returned an unexpected status.");
      }

      const payload = await readJson(
        response,
        "Generated preview health returned invalid JSON.",
      );
      if (
        !isRecord(payload) ||
        payload.status !== "ok" ||
        payload.appId !== normalizedAppId
      ) {
        throw new Error("Generated preview health payload did not match the app.");
      }

      return Object.freeze({ status: "ok", appId: normalizedAppId });
    },
  );
}

export async function verifyGeneratedPreviewRuntimeBoundary({
  baseURL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseURL = requiredHttpsOrigin(baseURL);
  validateTransport(fetchImpl, timeoutMs);

  return withTimedResponse(
    fetchImpl,
    `${normalizedBaseURL}/api/tasks`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
    },
    timeoutMs,
    async (response) => {
      if (response.status !== 401) {
        throw new Error(
          "Generated preview protected runtime returned an unexpected status.",
        );
      }
      if (response.headers.has("set-cookie")) {
        throw new Error(
          "Generated preview protected runtime unexpectedly established a session.",
        );
      }

      const payload = await readJson(
        response,
        "Generated preview protected runtime returned invalid JSON.",
      );
      if (!isExactSessionInvalidPayload(payload)) {
        throw new Error(
          "Generated preview protected runtime did not fail closed at the session boundary.",
        );
      }

      return Object.freeze({ status: "session-required" });
    },
  );
}

async function withTimedResponse(
  fetchImpl,
  url,
  options,
  timeoutMs,
  consumeResponse,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
    if (!(response instanceof Response)) {
      throw new Error("Generated preview smoke returned an invalid response.");
    }
    return await consumeResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response, invalidMessage) {
  try {
    return await response.json();
  } catch {
    throw new Error(invalidMessage);
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

function isExactSessionInvalidPayload(payload) {
  if (!isRecord(payload) || Object.keys(payload).length !== 1) return false;
  const error = payload.error;
  return (
    isRecord(error) &&
    Object.keys(error).length === 2 &&
    error.code === "SESSION_INVALID" &&
    error.message === SESSION_INVALID_MESSAGE
  );
}

function requiredIdentifier(value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`appId must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return value;
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
    const options = {
      baseURL: process.env.APPBASIS_GENERATED_PREVIEW_URL,
      appId: process.env.APPBASIS_GENERATED_APP_ID,
    };
    await verifyGeneratedPreviewHealth(options);
    await verifyGeneratedPreviewRuntimeBoundary(options);
    console.log("Generated preview runtime smoke passed.");
  } catch {
    console.error("Generated preview runtime smoke failed.");
    process.exitCode = 1;
  }
}

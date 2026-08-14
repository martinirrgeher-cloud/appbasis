import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";
const SESSION_INVALID_MESSAGE = "A valid session is required.";
const SESSION_TOKEN_PREFIX = "generated-preview-database-binding-missing-session";

export async function verifyGeneratedPreviewDatabaseBinding({
  baseURL,
  secret,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseURL = requiredHttpsOrigin(baseURL);
  const normalizedSecret = requiredBetterAuthSecret(secret);
  validateTransport(fetchImpl, timeoutMs);
  const cookie = await createSignedMissingSessionCookie(normalizedSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${normalizedBaseURL}/api/tasks`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie,
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!(response instanceof Response)) {
      throw new Error("Generated preview database smoke returned an invalid response.");
    }
    if (response.status !== 401) {
      throw new Error("Generated preview database-bound runtime returned an unexpected status.");
    }
    if (response.headers.has("set-cookie")) {
      throw new Error("Generated preview database-bound runtime unexpectedly established a session.");
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Generated preview database-bound runtime returned invalid JSON.");
    }
    if (!isExactSessionInvalidPayload(payload)) {
      throw new Error(
        "Generated preview database-bound runtime did not fail closed after session lookup.",
      );
    }

    return Object.freeze({ status: "database-session-miss" });
  } finally {
    clearTimeout(timeout);
  }
}

export async function createSignedMissingSessionCookie(
  secret,
  { token = `${SESSION_TOKEN_PREFIX}-${crypto.randomUUID()}` } = {},
) {
  const normalizedSecret = requiredBetterAuthSecret(secret);
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.trim() !== token ||
    !token.startsWith(`${SESSION_TOKEN_PREFIX}-`) ||
    /[;\r\n]/u.test(token)
  ) {
    throw new Error("Generated preview database smoke session token is invalid.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  const base64Signature = btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  );
  const signedValue = encodeURIComponent(`${token}.${base64Signature}`);
  return `${SESSION_COOKIE_NAME}=${signedValue}`;
}

function requiredBetterAuthSecret(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 32 ||
    /[\r\n]/u.test(value)
  ) {
    throw new Error("APPBASIS_BETTER_AUTH_SECRET does not satisfy the runtime contract.");
  }
  return value;
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
      secret: process.env.APPBASIS_BETTER_AUTH_SECRET,
    });
    console.log("Generated preview database binding smoke passed.");
  } catch {
    console.error("Generated preview database binding smoke failed.");
    process.exitCode = 1;
  }
}

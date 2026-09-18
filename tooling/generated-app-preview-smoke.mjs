import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  verifyGeneratedPreviewHealth,
  verifyGeneratedPreviewRuntimeBoundary,
} from "./generated-preview-smoke.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

export async function verifyGeneratedAppPreviewUi({
  baseURL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseURL = requiredHttpsOrigin(baseURL);
  validateTransport(fetchImpl, timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${normalizedBaseURL}/`, {
      method: "GET",
      headers: { accept: "text/html" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!(response instanceof Response)) {
      throw new Error("Generated app preview UI smoke returned an invalid response.");
    }
    if (response.status !== 200) {
      throw new Error("Generated app preview UI returned an unexpected status.");
    }
    if (response.headers.has("set-cookie")) {
      throw new Error("Generated app preview UI unexpectedly established a session.");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("text/html")) {
      throw new Error("Generated app preview UI did not return HTML.");
    }
    const csp = response.headers.get("content-security-policy") ?? "";
    if (!csp.includes("frame-ancestors 'none'") || !csp.includes("script-src 'self'")) {
      throw new Error("Generated app preview UI security headers are incomplete.");
    }
    const body = await response.text();
    if (!body.includes('src="/app.js"') || !body.includes('href="/app.css"')) {
      throw new Error("Generated app preview UI is missing generated assets.");
    }
    return Object.freeze({ status: "ui-reachable" });
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyGeneratedAppPreview({
  baseURL,
  appId,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const health = await verifyGeneratedPreviewHealth({ baseURL, appId, fetchImpl, timeoutMs });
  const ui = await verifyGeneratedAppPreviewUi({ baseURL, fetchImpl, timeoutMs });
  const runtime = await verifyGeneratedPreviewRuntimeBoundary({ baseURL, fetchImpl, timeoutMs });
  return Object.freeze({ health, ui, runtime });
}

function validateTransport(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function.");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("timeoutMs must be an integer between 1 and 30000.");
  }
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

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    await verifyGeneratedAppPreview({
      baseURL: process.env.APPBASIS_GENERATED_PREVIEW_URL,
      appId: process.env.APPBASIS_GENERATED_APP_ID,
    });
    console.log("Generated app preview smoke passed.");
  } catch {
    console.error("Generated app preview smoke failed.");
    process.exitCode = 1;
  }
}

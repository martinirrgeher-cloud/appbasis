import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RUNTIME_HEALTH_PATH = "/api/health/exercise-catalog-runtime";
const EXPECTED_MODES = new Set([
  "legacy-read-writes-blocked",
  "standard-module",
]);
const DEFAULT_ATTEMPTS = 20;
const DEFAULT_DELAY_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function verifyUlcExerciseCatalogPreviewRuntime({
  baseURL,
  expectedMode,
  fetchImpl = globalThis.fetch,
  attempts = DEFAULT_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleep = defaultSleep,
} = {}) {
  const origin = requiredHttpsOrigin(baseURL);
  const mode = requiredExpectedMode(expectedMode);
  if (typeof fetchImpl !== "function") {
    throw new Error("C3C runtime smoke fetch transport is invalid.");
  }
  if (typeof sleep !== "function") {
    throw new Error("C3C runtime smoke sleep transport is invalid.");
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) {
    throw new Error("C3C runtime smoke attempts must be an integer between 1 and 60.");
  }
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 10_000) {
    throw new Error("C3C runtime smoke delay must be an integer between 0 and 10000 ms.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("C3C runtime smoke timeout must be an integer between 1 and 30000 ms.");
  }

  const endpoint = origin + RUNTIME_HEALTH_PATH;
  let lastStatus = null;
  let lastMode = null;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
      if (!(response instanceof Response)) {
        lastError = "invalid-response";
      } else {
        lastStatus = response.status;
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          lastError = "invalid-json";
        }
        if (
          response.status === 200 &&
          isExactRuntimeHealthPayload(payload, mode)
        ) {
          return Object.freeze({
            status: "preview-runtime-ready",
            appId: "ulc-linz",
            exerciseCatalogRuntimeMode: mode,
            attempt,
          });
        }
        if (isRecord(payload)) {
          const observedMode = payload.exerciseCatalogRuntimeMode;
          lastMode = typeof observedMode === "string" ? observedMode : null;
        }
        if (lastError === null) {
          lastError = "unexpected-runtime-state";
        }
      }
    } catch (error) {
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "transport-error";
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  const details = [
    lastStatus === null ? null : "http=" + lastStatus,
    lastMode === null ? null : "mode=" + lastMode,
    lastError === null ? null : "reason=" + lastError,
  ].filter(Boolean);

  throw new Error(
    "C3C preview runtime did not converge to " +
      mode +
      " within the propagation window" +
      (details.length === 0 ? "." : " (" + details.join(", ") + ")."),
  );
}

function isExactRuntimeHealthPayload(payload, expectedMode) {
  return (
    isRecord(payload) &&
    Object.keys(payload).length === 3 &&
    payload.status === "ok" &&
    payload.appId === "ulc-linz" &&
    payload.exerciseCatalogRuntimeMode === expectedMode
  );
}

function requiredExpectedMode(value) {
  if (typeof value !== "string" || !EXPECTED_MODES.has(value)) {
    throw new Error("C3C runtime smoke expected mode is invalid.");
  }
  return value;
}

function requiredHttpsOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("C3C runtime smoke baseURL must be a canonical HTTPS origin.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("C3C runtime smoke baseURL must be a canonical HTTPS origin.");
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
    throw new Error("C3C runtime smoke baseURL must be a canonical HTTPS origin.");
  }
  return url.origin;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultSleep(delayMs) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs));
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const result = await verifyUlcExerciseCatalogPreviewRuntime({
      baseURL: process.env.APPBASIS_BASE_URL,
      expectedMode: process.env.APPBASIS_EXPECTED_MODE,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "C3C preview runtime smoke failed.",
    );
    process.exitCode = 1;
  }
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { verifyGeneratedAppPreviewUi } from "./generated-app-preview-smoke.mjs";
import { verifyGeneratedPreviewHealth } from "./generated-preview-smoke.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;
const SESSION_INVALID_MESSAGE = "A valid session is required.";

export async function verifyUlcLinzD4PreviewAuditSmoke(
  {
    baseURL,
    migrationDatabaseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof databaseFactory !== "function") {
    throw new Error("ULC D4 audit smoke database factory is invalid.");
  }

  const origin = requiredHttpsOrigin(baseURL);
  await verifyGeneratedPreviewHealth({
    baseURL: origin,
    appId: "ulc-linz",
    fetchImpl,
    timeoutMs,
  });
  await verifyGeneratedAppPreviewUi({
    baseURL: origin,
    fetchImpl,
    timeoutMs,
  });

  const database = databaseFactory(migrationDatabaseUrl);
  try {
    const before = await matchingAuditCount(database.client);
    const response = await timedFetch(
      fetchImpl,
      origin + "/api/modules/countdown",
      timeoutMs,
    );
    await requireAnonymousCountdownDenial(response);
    const after = await matchingAuditCount(database.client);
    if (after <= before) {
      throw new Error(
        "ULC D4 protected countdown denial was not persisted to the security log.",
      );
    }
    return Object.freeze({
      status: "preview-audit-verified",
      persistedSecurityEvents: Number(after - before),
    });
  } finally {
    await database.client.end().catch(() => {});
  }
}

async function timedFetch(fetchImpl, url, timeoutMs) {
  if (typeof fetchImpl !== "function") {
    throw new Error("ULC D4 audit smoke fetch transport is invalid.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error("ULC D4 audit smoke timeout is invalid.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!(response instanceof Response)) {
      throw new Error("ULC D4 protected countdown smoke returned an invalid response.");
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function requireAnonymousCountdownDenial(response) {
  if (response.status !== 401 || response.headers.has("set-cookie")) {
    throw new Error("ULC D4 protected countdown runtime did not fail closed.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("ULC D4 protected countdown runtime returned invalid JSON.");
  }
  if (!isExactSessionInvalidPayload(payload)) {
    throw new Error("ULC D4 protected countdown runtime returned an unexpected denial.");
  }
}

async function matchingAuditCount(client) {
  const rows = await client.unsafe(
    "SELECT count(*)::text AS matching_count " +
      "FROM public.ulc_linz_security_event_log " +
      "WHERE schema_version = 1 " +
      "AND app_id = 'ulc-linz' " +
      "AND category = 'security' " +
      "AND event_type = 'authorization.denied' " +
      "AND actor_principal_id IS NULL " +
      "AND organization_id IS NULL " +
      "AND action = 'view' " +
      "AND target_type = 'module' " +
      "AND target_id = 'countdown' " +
      "AND operation IS NULL " +
      "AND http_status IS NULL " +
      "AND error_code IS NULL " +
      "AND reason_code = 'identity-access-denied'",
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC D4 audit smoke count query returned an invalid result.");
  }
  const raw = rows[0]?.matching_count;
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) {
    throw new Error("ULC D4 audit smoke count is invalid.");
  }
  return BigInt(raw);
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
    throw new Error("ULC D4 audit smoke baseURL must be a canonical HTTPS origin.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ULC D4 audit smoke baseURL must be a canonical HTTPS origin.");
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
    throw new Error("ULC D4 audit smoke baseURL must be a canonical HTTPS origin.");
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
    const result = await verifyUlcLinzD4PreviewAuditSmoke({
      baseURL: process.env.APPBASIS_GENERATED_PREVIEW_URL,
      migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC D4 preview audit smoke failed.",
    );
    process.exitCode = 1;
  }
}

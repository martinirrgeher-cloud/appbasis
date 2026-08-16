import { pathToFileURL } from "node:url";

import { createInitialTechnicalAdmin } from "@appbasis/identity/root-admin";

import { M3_PREVIEW_SMOKE_CONTRACT } from "../../../tooling/m3-preview-smoke-contract.mjs";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export class M3PreviewRootAdminEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "M3PreviewRootAdminEnvironmentError";
  }
}

export function readM3PreviewRootAdminEnvironment(env = process.env) {
  if (env.APPBASIS_M3_ROOT_ADMIN_TARGET !== M3_PREVIEW_SMOKE_CONTRACT.target) {
    throw new M3PreviewRootAdminEnvironmentError(
      "APPBASIS_M3_ROOT_ADMIN_TARGET must equal m3-preview.",
    );
  }
  if (env.APPBASIS_M3_ROOT_ADMIN_APPLY !== "1") {
    throw new M3PreviewRootAdminEnvironmentError(
      "m3-preview root administrator bootstrap was not explicitly confirmed.",
    );
  }

  return Object.freeze({
    connectionString: requiredPostgresURL(env.APPBASIS_DATABASE_URL),
    secret: requiredSecret(env.APPBASIS_BETTER_AUTH_SECRET),
    baseURL: requiredHttpsOrigin(env.APPBASIS_GENERATED_PREVIEW_URL),
    username: M3_PREVIEW_SMOKE_CONTRACT.rootAdmin.username,
    displayName: M3_PREVIEW_SMOKE_CONTRACT.rootAdmin.displayName,
    password: requiredPassword(env.APPBASIS_ROOT_ADMIN_PASSWORD, "APPBASIS_ROOT_ADMIN_PASSWORD"),
  });
}

export async function bootstrapM3PreviewRootAdmin(
  env = process.env,
  createAdmin = createInitialTechnicalAdmin,
) {
  return createAdmin(readM3PreviewRootAdminEnvironment(env));
}

function requiredPostgresURL(value) {
  const normalized = requiredTrimmed(value, "APPBASIS_DATABASE_URL");
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new M3PreviewRootAdminEnvironmentError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.pathname.length <= 1
  ) {
    throw new M3PreviewRootAdminEnvironmentError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  return normalized;
}

function requiredSecret(value) {
  const normalized = requiredTrimmed(value, "APPBASIS_BETTER_AUTH_SECRET");
  if (normalized.length < 32) {
    throw new M3PreviewRootAdminEnvironmentError(
      "APPBASIS_BETTER_AUTH_SECRET must contain at least 32 characters.",
    );
  }
  return normalized;
}

function requiredHttpsOrigin(value) {
  const normalized = requiredTrimmed(value, "APPBASIS_GENERATED_PREVIEW_URL");
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new M3PreviewRootAdminEnvironmentError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
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
    throw new M3PreviewRootAdminEnvironmentError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  return url.origin;
}

function requiredPassword(value, field) {
  if (
    typeof value !== "string" ||
    value.length < MINIMUM_PASSWORD_LENGTH ||
    value.length > MAXIMUM_PASSWORD_LENGTH ||
    value.trim().length === 0
  ) {
    throw new M3PreviewRootAdminEnvironmentError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  return value;
}

function requiredTrimmed(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new M3PreviewRootAdminEnvironmentError(`${field} is required.`);
  }
  return normalized;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    await bootstrapM3PreviewRootAdmin();
    console.log("m3-preview root administrator bootstrap completed.");
  } catch {
    console.error("m3-preview root administrator bootstrap failed.");
    process.exitCode = 1;
  }
}

import { pathToFileURL } from "node:url";

import { createInitialTechnicalAdmin } from "@appbasis/identity/root-admin";

import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";

const TARGET = "ulc-linz-production";
const BASE_URL = "https://app.ulc-linz.at";
const USERNAME = "ulc.production.admin";
const DISPLAY_NAME = "ULC Linz Production Technical Admin";
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export class UlcLinzProductionAdminBootstrapEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzProductionAdminBootstrapEnvironmentError";
  }
}

export function readUlcLinzProductionAdminBootstrapEnvironment(env = process.env) {
  if (env.ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET !== TARGET) {
    throw new UlcLinzProductionAdminBootstrapEnvironmentError(
      `ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET must equal ${TARGET}.`,
    );
  }
  if (env.ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_APPLY !== "1") {
    throw new UlcLinzProductionAdminBootstrapEnvironmentError(
      "ULC production administrator bootstrap was not explicitly confirmed.",
    );
  }

  const connectionString = requiredTrimmed(
    env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    "ULC_LINZ_PRODUCTION_DATABASE_URL",
  );
  try {
    parseUlcLinzProductionDatabaseUrl(connectionString);
  } catch {
    throw new UlcLinzProductionAdminBootstrapEnvironmentError(
      "ULC_LINZ_PRODUCTION_DATABASE_URL must select the exact ULC production database.",
    );
  }

  const secret = requiredUntrimmedSecret(
    env.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET,
    "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET",
  );
  const password = requiredPassword(
    env.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD,
    "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD",
  );

  return Object.freeze({
    connectionString,
    secret,
    baseURL: BASE_URL,
    username: USERNAME,
    displayName: DISPLAY_NAME,
    password,
  });
}

export async function bootstrapUlcLinzProductionAdmin(
  env = process.env,
  createAdmin = createInitialTechnicalAdmin,
) {
  return createAdmin(readUlcLinzProductionAdminBootstrapEnvironment(env));
}

function requiredTrimmed(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new UlcLinzProductionAdminBootstrapEnvironmentError(`${field} is required.`);
  }
  return normalized;
}

function requiredUntrimmedSecret(value, field) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value !== value.trim()
  ) {
    throw new UlcLinzProductionAdminBootstrapEnvironmentError(
      `${field} must contain at least 32 characters without surrounding whitespace.`,
    );
  }
  return value;
}

function requiredPassword(value, field) {
  if (
    typeof value !== "string" ||
    value.length < MINIMUM_PASSWORD_LENGTH ||
    value.length > MAXIMUM_PASSWORD_LENGTH ||
    value.trim().length === 0
  ) {
    throw new UlcLinzProductionAdminBootstrapEnvironmentError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  return value;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await bootstrapUlcLinzProductionAdmin();
    if (result.username !== USERNAME || result.role !== "admin") {
      throw new Error("Unexpected ULC production administrator bootstrap result.");
    }
    console.log(`ULC production administrator bootstrap completed for ${USERNAME}.`);
  } catch {
    console.error("ULC production administrator bootstrap failed.");
    process.exitCode = 1;
  }
}

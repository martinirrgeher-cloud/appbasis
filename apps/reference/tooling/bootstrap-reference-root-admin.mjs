import { pathToFileURL } from "node:url";

import { createInitialTechnicalAdmin } from "@appbasis/identity/root-admin";

export class ReferenceRootAdminEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReferenceRootAdminEnvironmentError";
  }
}

export function readReferenceRootAdminEnvironment(env = process.env) {
  if (env.APPBASIS_ROOT_ADMIN_TARGET !== "reference-preview") {
    throw new ReferenceRootAdminEnvironmentError(
      "APPBASIS_ROOT_ADMIN_TARGET must equal reference-preview.",
    );
  }
  if (env.APPBASIS_ROOT_ADMIN_APPLY !== "1") {
    throw new ReferenceRootAdminEnvironmentError(
      "Reference root bootstrap was not explicitly confirmed.",
    );
  }

  return {
    connectionString: required(env.APPBASIS_DATABASE_URL, "APPBASIS_DATABASE_URL"),
    secret: required(env.APPBASIS_BETTER_AUTH_SECRET, "APPBASIS_BETTER_AUTH_SECRET"),
    baseURL: required(env.APPBASIS_PREVIEW_URL, "APPBASIS_PREVIEW_URL"),
    username: required(env.APPBASIS_ROOT_ADMIN_USERNAME, "APPBASIS_ROOT_ADMIN_USERNAME"),
    displayName: required(
      env.APPBASIS_ROOT_ADMIN_DISPLAY_NAME,
      "APPBASIS_ROOT_ADMIN_DISPLAY_NAME",
    ),
    password: requiredUntrimmed(
      env.APPBASIS_ROOT_ADMIN_PASSWORD,
      "APPBASIS_ROOT_ADMIN_PASSWORD",
    ),
  };
}

export async function bootstrapReferenceRootAdmin(env = process.env) {
  return createInitialTechnicalAdmin(readReferenceRootAdminEnvironment(env));
}

function required(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new ReferenceRootAdminEnvironmentError(`${name} is required.`);
  }
  return normalized;
}

function requiredUntrimmed(value, name) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim().length === 0
  ) {
    throw new ReferenceRootAdminEnvironmentError(`${name} is required.`);
  }
  return value;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await bootstrapReferenceRootAdmin();
    console.log(`Reference root bootstrap completed for ${result.username}.`);
  } catch {
    console.error("Reference root bootstrap failed.");
    process.exitCode = 1;
  }
}

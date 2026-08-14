import { writeFile } from "node:fs/promises";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_SECRET_NAMES = Object.freeze(["BETTER_AUTH_SECRET"]);

export function renderGeneratedPreviewWranglerConfig({
  appId,
  hyperdriveId,
  baseURL,
  compatibilityDate = "2026-08-14",
} = {}) {
  const normalizedAppId = requiredIdentifier(appId, "appId");
  const normalizedHyperdriveId = requiredProviderId(hyperdriveId);
  const normalizedBaseURL = requiredHttpsOrigin(baseURL);
  const normalizedCompatibilityDate = requiredCompatibilityDate(compatibilityDate);

  return Object.freeze({
    $schema: "./node_modules/wrangler/config-schema.json",
    name: `appbasis-${normalizedAppId}`,
    main: "./worker/index.ts",
    compatibility_date: normalizedCompatibilityDate,
    compatibility_flags: Object.freeze(["nodejs_compat"]),
    keep_vars: true,
    vars: Object.freeze({
      APPBASIS_BASE_URL: normalizedBaseURL,
    }),
    secrets: Object.freeze({
      required: REQUIRED_SECRET_NAMES,
    }),
    hyperdrive: Object.freeze([
      Object.freeze({
        binding: "HYPERDRIVE",
        id: normalizedHyperdriveId,
      }),
    ]),
  });
}

export async function writeGeneratedPreviewWranglerConfig({
  outputPath,
  ...input
} = {}) {
  if (typeof outputPath !== "string" || outputPath.trim().length === 0) {
    throw new Error("outputPath is required.");
  }
  const config = renderGeneratedPreviewWranglerConfig(input);
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return outputPath;
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return value;
}

function requiredProviderId(value) {
  if (typeof value !== "string") {
    throw new Error("hyperdriveId is required.");
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 256 ||
    /[\u0000-\u001f\u007f\s]/u.test(normalized)
  ) {
    throw new Error("hyperdriveId is invalid.");
  }
  return normalized;
}

function requiredHttpsOrigin(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("baseURL is required.");
  }
  let url;
  try {
    url = new URL(value.trim());
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

function requiredCompatibilityDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new Error("compatibilityDate must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("compatibilityDate must be a real calendar date.");
  }
  return value;
}

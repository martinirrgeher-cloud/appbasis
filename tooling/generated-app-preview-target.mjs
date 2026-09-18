import { createHash } from "node:crypto";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const APP_ID_MAX_LENGTH = 63;
const POSTGRES_DATABASE_MAX_LENGTH = 63;
const WORKER_NAME_MAX_LENGTH = 63;

export function defineGeneratedAppPreviewTarget({ appId } = {}) {
  const normalizedAppId = requiredAppId(appId);
  return Object.freeze({
    appId: normalizedAppId,
    environment: `generated-preview-${normalizedAppId}`,
    migrationTarget: `generated-preview-${normalizedAppId}`,
    workerName: generatedPreviewWorkerName(normalizedAppId),
    hyperdriveName: `appbasis-${normalizedAppId}-preview`,
    database: generatedPreviewDatabaseName(normalizedAppId),
  });
}

export function generatedPreviewWorkerName(appId) {
  const normalized = requiredAppId(appId);
  const raw = `appbasis-${normalized}`;
  if (raw.length <= WORKER_NAME_MAX_LENGTH) return raw;
  return boundedHashedName({
    prefix: "appbasis-",
    slug: normalized,
    suffix: "",
    maxLength: WORKER_NAME_MAX_LENGTH,
    separator: "-",
  });
}

export function generatedPreviewDatabaseName(appId) {
  const normalized = requiredAppId(appId).replaceAll("-", "_");
  const raw = `appbasis_${normalized}_preview`;
  if (raw.length <= POSTGRES_DATABASE_MAX_LENGTH) return raw;
  return boundedHashedName({
    prefix: "appbasis_",
    slug: normalized,
    suffix: "_preview",
    maxLength: POSTGRES_DATABASE_MAX_LENGTH,
    separator: "_",
  });
}

function boundedHashedName({
  prefix,
  slug,
  suffix,
  maxLength,
  separator,
}) {
  const digest = createHash("sha256").update(slug).digest("hex").slice(0, 8);
  const reserved = prefix.length + suffix.length + separator.length + digest.length;
  const available = maxLength - reserved;
  if (available < 1) {
    throw new Error("Generated preview name contract cannot fit the required prefix and suffix.");
  }
  const trimmed = slug.slice(0, available).replace(/[-_]$/u, "");
  if (trimmed.length === 0) {
    throw new Error("Generated preview name contract could not preserve an app identifier.");
  }
  return `${prefix}${trimmed}${separator}${digest}${suffix}`;
}

function requiredAppId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > APP_ID_MAX_LENGTH ||
    !IDENTIFIER_PATTERN.test(value) ||
    value.endsWith("-")
  ) {
    throw new Error(
      `appId must match ${IDENTIFIER_PATTERN.source}, end in an alphanumeric character and be at most ${APP_ID_MAX_LENGTH} characters.`,
    );
  }
  return value;
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  defineGeneratedPreviewHyperdriveTarget,
  ensureGeneratedPreviewHyperdrive,
  parseGeneratedPreviewDatabaseUrl,
  resolveGeneratedPreviewHyperdrive,
  validateGeneratedPreviewHyperdrive,
} from "./generated-preview-hyperdrive.mjs";

const ULC_LINZ_M6_PRODUCTION_NEON_ORIGIN =
  "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const ULC_LINZ_M6_PRODUCTION_NEON_PORT = 5432;

export const ULC_LINZ_M6_PRODUCTION_HYPERDRIVE =
  defineGeneratedPreviewHyperdriveTarget({
    appId: "ulc-linz",
    environment: "production",
    name: "appbasis-ulc-linz-production-db",
    database: "neondb",
  });

export const ULC_LINZ_M6_PRODUCTION_SECURITY_LOG_HYPERDRIVE =
  defineGeneratedPreviewHyperdriveTarget({
    appId: "ulc-linz",
    environment: "production",
    name: "appbasis-ulc-linz-production-security-log",
    database: "neondb",
  });

export function parseUlcLinzProductionDatabaseUrl(value) {
  return parseExactProductionDatabaseUrl(
    value,
    ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
    "ULC_LINZ_PRODUCTION_DATABASE_URL",
  );
}

export function parseUlcLinzSecurityLogIngestDatabaseUrl(value) {
  return parseExactProductionDatabaseUrl(
    value,
    ULC_LINZ_M6_PRODUCTION_SECURITY_LOG_HYPERDRIVE,
    "ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL",
  );
}

export function resolveUlcLinzProductionHyperdrive(input = {}) {
  parseUlcLinzProductionDatabaseUrl(input.databaseUrl);
  return resolveGeneratedPreviewHyperdrive({
    ...input,
    target: ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
  });
}

export function resolveUlcLinzProductionSecurityLogHyperdrive(input = {}) {
  parseUlcLinzSecurityLogIngestDatabaseUrl(input.databaseUrl);
  return resolveGeneratedPreviewHyperdrive({
    ...input,
    target: ULC_LINZ_M6_PRODUCTION_SECURITY_LOG_HYPERDRIVE,
  });
}

export function ensureUlcLinzProductionHyperdrive(input = {}) {
  parseUlcLinzProductionDatabaseUrl(input.databaseUrl);
  return ensureGeneratedPreviewHyperdrive({
    ...input,
    target: ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
    reconcileExisting: true,
  });
}

export function ensureUlcLinzProductionSecurityLogHyperdrive(input = {}) {
  parseUlcLinzSecurityLogIngestDatabaseUrl(input.databaseUrl);
  return ensureGeneratedPreviewHyperdrive({
    ...input,
    target: ULC_LINZ_M6_PRODUCTION_SECURITY_LOG_HYPERDRIVE,
    reconcileExisting: true,
  });
}

export function validateUlcLinzProductionHyperdrive(config, databaseUrl) {
  parseUlcLinzProductionDatabaseUrl(databaseUrl);
  return validateGeneratedPreviewHyperdrive(
    config,
    databaseUrl,
    ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
  );
}

export function validateUlcLinzProductionSecurityLogHyperdrive(config, databaseUrl) {
  parseUlcLinzSecurityLogIngestDatabaseUrl(databaseUrl);
  return validateGeneratedPreviewHyperdrive(
    config,
    databaseUrl,
    ULC_LINZ_M6_PRODUCTION_SECURITY_LOG_HYPERDRIVE,
  );
}

function parseExactProductionDatabaseUrl(value, target, variableName) {
  const parsed = parseGeneratedPreviewDatabaseUrl(value, target);
  if (
    parsed.host !== ULC_LINZ_M6_PRODUCTION_NEON_ORIGIN ||
    parsed.port !== ULC_LINZ_M6_PRODUCTION_NEON_PORT
  ) {
    throw new Error(
      `${variableName} does not select the exact ULC production Neon endpoint.`,
    );
  }
  return parsed;
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = process.argv[2];
    const common = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    };
    let result = null;
    if (mode === "resolve" || mode === "ensure") {
      const input = {
        ...common,
        databaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
      };
      result =
        mode === "resolve"
          ? await resolveUlcLinzProductionHyperdrive(input)
          : await ensureUlcLinzProductionHyperdrive({
              ...input,
              apply: process.env.ULC_LINZ_APPLY_PRODUCTION_HYPERDRIVE === "1",
            });
    } else if (mode === "resolve-security-log" || mode === "ensure-security-log") {
      const input = {
        ...common,
        databaseUrl: process.env.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL,
      };
      result =
        mode === "resolve-security-log"
          ? await resolveUlcLinzProductionSecurityLogHyperdrive(input)
          : await ensureUlcLinzProductionSecurityLogHyperdrive({
              ...input,
              apply:
                process.env.ULC_LINZ_APPLY_PRODUCTION_SECURITY_LOG_HYPERDRIVE === "1",
            });
    }

    if (result === null) {
      throw new Error(
        "Expected command mode resolve, ensure, resolve-security-log or ensure-security-log.",
      );
    }
    process.stdout.write(`${result.id}\n`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC Linz production Hyperdrive operation failed.",
    );
    process.exitCode = 1;
  }
}
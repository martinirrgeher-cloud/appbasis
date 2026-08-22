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

export const ULC_LINZ_M6_PRODUCTION_HYPERDRIVE =
  defineGeneratedPreviewHyperdriveTarget({
    appId: "ulc-linz",
    environment: "production",
    name: "appbasis-ulc-linz-production-db",
    database: "neondb",
  });

export function parseUlcLinzProductionDatabaseUrl(value) {
  const parsed = parseGeneratedPreviewDatabaseUrl(
    value,
    ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
  );
  if (parsed.host !== ULC_LINZ_M6_PRODUCTION_NEON_ORIGIN) {
    throw new Error(
      "ULC_LINZ_PRODUCTION_DATABASE_URL does not select the exact ULC production Neon origin.",
    );
  }
  return parsed;
}

export function resolveUlcLinzProductionHyperdrive(input = {}) {
  parseUlcLinzProductionDatabaseUrl(input.databaseUrl);
  return resolveGeneratedPreviewHyperdrive({
    ...input,
    target: ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
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

export function validateUlcLinzProductionHyperdrive(config, databaseUrl) {
  parseUlcLinzProductionDatabaseUrl(databaseUrl);
  return validateGeneratedPreviewHyperdrive(
    config,
    databaseUrl,
    ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
  );
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = process.argv[2];
    const input = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      databaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    };
    const result =
      mode === "resolve"
        ? await resolveUlcLinzProductionHyperdrive(input)
        : mode === "ensure"
          ? await ensureUlcLinzProductionHyperdrive({
              ...input,
              apply: process.env.ULC_LINZ_APPLY_PRODUCTION_HYPERDRIVE === "1",
            })
          : null;

    if (result === null) {
      throw new Error("Expected command mode resolve or ensure.");
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

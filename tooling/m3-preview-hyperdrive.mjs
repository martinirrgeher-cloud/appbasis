import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  defineGeneratedPreviewHyperdriveTarget,
  parseGeneratedPreviewDatabaseUrl,
  resolveGeneratedPreviewHyperdrive,
  validateGeneratedPreviewHyperdrive,
} from "./generated-preview-hyperdrive.mjs";

export const M3_PREVIEW_HYPERDRIVE = defineGeneratedPreviewHyperdriveTarget({
  appId: "m3-preview",
  environment: "m3-preview",
  name: "appbasis-m3-preview-db",
  database: "appbasis_m3_preview",
});

export function parseM3PreviewDatabaseUrl(value) {
  return parseGeneratedPreviewDatabaseUrl(value, M3_PREVIEW_HYPERDRIVE);
}

export function resolveM3PreviewHyperdrive(input = {}) {
  return resolveGeneratedPreviewHyperdrive({
    ...input,
    target: M3_PREVIEW_HYPERDRIVE,
  });
}

export function validateM3PreviewHyperdrive(config, databaseUrl) {
  return validateGeneratedPreviewHyperdrive(
    config,
    databaseUrl,
    M3_PREVIEW_HYPERDRIVE,
  );
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] !== "resolve") {
      throw new Error("Expected command mode resolve.");
    }
    const result = await resolveM3PreviewHyperdrive({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      databaseUrl: process.env.APPBASIS_DATABASE_URL,
    });
    process.stdout.write(`${result.id}\n`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "M3 preview Hyperdrive resolution failed.",
    );
    process.exitCode = 1;
  }
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  defineGeneratedPreviewHyperdriveTarget,
  ensureGeneratedPreviewHyperdrive,
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

export function ensureM3PreviewHyperdrive(input = {}) {
  return ensureGeneratedPreviewHyperdrive({
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
    const mode = process.argv[2];
    const input = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      databaseUrl: process.env.APPBASIS_DATABASE_URL,
    };
    const result =
      mode === "resolve"
        ? await resolveM3PreviewHyperdrive(input)
        : mode === "ensure"
          ? await ensureM3PreviewHyperdrive({
              ...input,
              apply: process.env.APPBASIS_APPLY_HYPERDRIVE === "1",
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
        : "M3 preview Hyperdrive operation failed.",
    );
    process.exitCode = 1;
  }
}

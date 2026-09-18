import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { defineGeneratedAppPreviewTarget } from "./generated-app-preview-target.mjs";
import {
  defineGeneratedPreviewHyperdriveTarget,
  ensureGeneratedPreviewHyperdrive,
  resolveGeneratedPreviewHyperdrive,
} from "./generated-preview-hyperdrive.mjs";

export function generatedAppPreviewHyperdriveTarget(appId) {
  const target = defineGeneratedAppPreviewTarget({ appId });
  return defineGeneratedPreviewHyperdriveTarget({
    appId: target.appId,
    environment: target.environment,
    name: target.hyperdriveName,
    database: target.database,
  });
}

export function resolveGeneratedAppPreviewHyperdrive({ appId, ...input } = {}) {
  return resolveGeneratedPreviewHyperdrive({
    ...input,
    target: generatedAppPreviewHyperdriveTarget(appId),
  });
}

export function ensureGeneratedAppPreviewHyperdrive({ appId, ...input } = {}) {
  return ensureGeneratedPreviewHyperdrive({
    ...input,
    target: generatedAppPreviewHyperdriveTarget(appId),
  });
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = process.argv[2];
    const appId = process.env.APPBASIS_GENERATED_APP_ID;
    const input = {
      appId,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      databaseUrl: process.env.APPBASIS_DATABASE_URL,
    };
    const result =
      mode === "resolve"
        ? await resolveGeneratedAppPreviewHyperdrive(input)
        : mode === "ensure"
          ? await ensureGeneratedAppPreviewHyperdrive({
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
        : "Generated app preview Hyperdrive operation failed.",
    );
    process.exitCode = 1;
  }
}

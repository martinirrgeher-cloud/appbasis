import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  defineGeneratedPreviewHyperdriveTarget,
  ensureGeneratedPreviewHyperdrive,
  parseGeneratedPreviewDatabaseUrl,
  resolveGeneratedPreviewHyperdrive,
  validateGeneratedPreviewHyperdrive,
} from "./generated-preview-hyperdrive.mjs";

export const GENERATED_TASKS_PREVIEW_HYPERDRIVE =
  defineGeneratedPreviewHyperdriveTarget({
    appId: "tasks-minimal",
    environment: "generated-tasks-preview",
    name: "appbasis-tasks-minimal-preview",
    database: "appbasis_tasks_preview",
  });

export function parseGeneratedTasksPreviewDatabaseUrl(value) {
  return parseGeneratedPreviewDatabaseUrl(
    value,
    GENERATED_TASKS_PREVIEW_HYPERDRIVE,
  );
}

export function resolveGeneratedTasksPreviewHyperdrive(input = {}) {
  return resolveGeneratedPreviewHyperdrive({
    ...input,
    target: GENERATED_TASKS_PREVIEW_HYPERDRIVE,
  });
}

export function ensureGeneratedTasksPreviewHyperdrive(input = {}) {
  return ensureGeneratedPreviewHyperdrive({
    ...input,
    target: GENERATED_TASKS_PREVIEW_HYPERDRIVE,
  });
}

export function validateGeneratedTasksPreviewHyperdrive(config, databaseUrl) {
  return validateGeneratedPreviewHyperdrive(
    config,
    databaseUrl,
    GENERATED_TASKS_PREVIEW_HYPERDRIVE,
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
        ? await resolveGeneratedTasksPreviewHyperdrive(input)
        : mode === "ensure"
          ? await ensureGeneratedTasksPreviewHyperdrive({
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
        : "Generated preview Hyperdrive operation failed.",
    );
    process.exitCode = 1;
  }
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { generatedAppPreviewHyperdriveTarget } from "./generated-app-preview-hyperdrive.mjs";
import {
  defineGeneratedPreviewHyperdriveTarget,
  ensureGeneratedPreviewHyperdrive,
  parseGeneratedPreviewDatabaseUrl,
  resolveGeneratedPreviewHyperdrive,
} from "./generated-preview-hyperdrive.mjs";

export const ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE =
  generatedAppPreviewHyperdriveTarget("ulc-linz");

export const ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE =
  defineGeneratedPreviewHyperdriveTarget({
    appId: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    name: "appbasis-ulc-linz-preview-security-log",
    database: ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.database,
  });

export function validateUlcLinzD4PreviewDatabaseUrls(
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
) {
  const application = parseGeneratedPreviewDatabaseUrl(
    applicationDatabaseUrl,
    ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
  );
  const securityLog = parseGeneratedPreviewDatabaseUrl(
    securityLogDatabaseUrl,
    ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE,
  );

  if (
    application.host !== securityLog.host ||
    application.port !== securityLog.port ||
    application.database !== securityLog.database
  ) {
    throw new Error(
      "ULC D4 application and security-log credentials must select the same dedicated preview database.",
    );
  }
  if (application.user === securityLog.user) {
    throw new Error(
      "ULC D4 application and security-log database roles must be distinct.",
    );
  }

  return Object.freeze({ application, securityLog });
}

export function validateUlcLinzD4PreviewDatabaseCredentials({
  migrationDatabaseUrl,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
} = {}) {
  const migration = parseGeneratedPreviewDatabaseUrl(
    migrationDatabaseUrl,
    ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
  );
  const { application, securityLog } = validateUlcLinzD4PreviewDatabaseUrls(
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  );

  for (const runtime of [application, securityLog]) {
    if (
      migration.host !== runtime.host ||
      migration.port !== runtime.port ||
      migration.database !== runtime.database
    ) {
      throw new Error(
        "ULC D4 migration, application and security-log credentials must select the same dedicated preview database.",
      );
    }
  }
  if (
    new Set([migration.user, application.user, securityLog.user]).size !== 3
  ) {
    throw new Error(
      "ULC D4 migration, application and security-log database roles must be distinct.",
    );
  }

  return Object.freeze({ migration, application, securityLog });
}

export async function resolveUlcLinzD4PreviewHyperdrives({
  accountId,
  apiToken,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  validateUlcLinzD4PreviewDatabaseUrls(
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  );

  const application = await resolveGeneratedPreviewHyperdrive({
    target: ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    accountId,
    apiToken,
    databaseUrl: applicationDatabaseUrl,
    fetchImpl,
  });
  const securityLog = await resolveGeneratedPreviewHyperdrive({
    target: ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE,
    accountId,
    apiToken,
    databaseUrl: securityLogDatabaseUrl,
    fetchImpl,
  });

  if (application.id === securityLog.id) {
    throw new Error("ULC D4 preview Hyperdrive IDs must be distinct.");
  }
  return Object.freeze({ application, securityLog });
}

export async function ensureUlcLinzD4PreviewHyperdrives({
  accountId,
  apiToken,
  applicationDatabaseUrl,
  securityLogDatabaseUrl,
  apply = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  validateUlcLinzD4PreviewDatabaseUrls(
    applicationDatabaseUrl,
    securityLogDatabaseUrl,
  );

  const application = await ensureGeneratedPreviewHyperdrive({
    target: ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    accountId,
    apiToken,
    databaseUrl: applicationDatabaseUrl,
    apply,
    reconcileExisting: true,
    fetchImpl,
  });
  const securityLog = await ensureGeneratedPreviewHyperdrive({
    target: ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE,
    accountId,
    apiToken,
    databaseUrl: securityLogDatabaseUrl,
    apply,
    reconcileExisting: true,
    fetchImpl,
  });

  if (application.id === securityLog.id) {
    throw new Error("ULC D4 preview Hyperdrive IDs must be distinct.");
  }
  return Object.freeze({ application, securityLog });
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
      applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
      securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    };
    const result =
      mode === "resolve"
        ? await resolveUlcLinzD4PreviewHyperdrives(input)
        : mode === "ensure"
          ? await ensureUlcLinzD4PreviewHyperdrives({
              ...input,
              apply: process.env.APPBASIS_APPLY_HYPERDRIVES === "1",
            })
          : null;

    if (result === null) {
      throw new Error("Expected command mode resolve or ensure.");
    }
    process.stdout.write(
      `${JSON.stringify({
        applicationId: result.application.id,
        securityLogId: result.securityLog.id,
      })}\n`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC D4 preview Hyperdrive operation failed.",
    );
    process.exitCode = 1;
  }
}

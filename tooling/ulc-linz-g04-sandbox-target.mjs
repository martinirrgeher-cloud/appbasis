import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  defineGeneratedPreviewHyperdriveTarget,
  parseGeneratedPreviewDatabaseUrl,
  resolveGeneratedPreviewHyperdrive,
  ensureGeneratedPreviewHyperdrive,
} from "./generated-preview-hyperdrive.mjs";
import { renderGeneratedPreviewWranglerConfig } from "./generated-preview-deploy-config.mjs";

export const G046_SANDBOX = Object.freeze({
  projectId: "cool-unit-46141580",
  branchId: "br-falling-hat-b1lmifga",
  sourceBranchId: "br-delicate-surf-b1eu6ikn",
  database: "appbasis_ulc_linz_preview",
  directHost: "ep-empty-frog-b187iuwz.c-5.eu-central-1.aws.neon.tech",
  sourceDirectHost: "ep-green-resonance-b19c78rm.c-5.eu-central-1.aws.neon.tech",
  applicationRole: "appbasis_ulc_g046_application",
  securityRole: "appbasis_ulc_g046_security_log",
  workerName: "appbasis-ulc-linz-g04-sandbox",
  entrypoint: "./worker/preview-g04-sandbox.ts",
});
const TARGETS = Object.freeze({
  application: defineGeneratedPreviewHyperdriveTarget({
    appId: "ulc-linz", environment: "generated-preview-ulc-linz",
    name: "appbasis-ulc-linz-g046-sandbox-application",
    database: G046_SANDBOX.database,
  }),
  securityLog: defineGeneratedPreviewHyperdriveTarget({
    appId: "ulc-linz", environment: "generated-preview-ulc-linz",
    name: "appbasis-ulc-linz-g046-sandbox-security-log",
    database: G046_SANDBOX.database,
  }),
});
export const G046_HYPERDRIVE_TARGETS = TARGETS;

function deny() {
  throw new Error("G-04.6 blocked: sandbox endpoint, role or release settings are invalid.");
}

export function validateG046SandboxOrigins({ applicationDatabaseUrl, securityLogDatabaseUrl } = {}) {
  let application, securityLog, appRaw, securityRaw;
  try {
    application = parseGeneratedPreviewDatabaseUrl(applicationDatabaseUrl, TARGETS.application);
    securityLog = parseGeneratedPreviewDatabaseUrl(securityLogDatabaseUrl, TARGETS.securityLog);
    appRaw = new URL(applicationDatabaseUrl);
    securityRaw = new URL(securityLogDatabaseUrl);
  } catch { deny(); }
  if (application.host !== G046_SANDBOX.directHost ||
      securityLog.host !== G046_SANDBOX.directHost ||
      application.host === G046_SANDBOX.sourceDirectHost ||
      application.user !== G046_SANDBOX.applicationRole ||
      securityLog.user !== G046_SANDBOX.securityRole ||
      application.port !== 5432 || securityLog.port !== 5432 ||
      application.database !== G046_SANDBOX.database ||
      securityLog.database !== G046_SANDBOX.database ||
      appRaw.searchParams.size !== 1 ||
      securityRaw.searchParams.size !== 1 ||
      !["require", "verify-ca", "verify-full"].includes(appRaw.searchParams.get("sslmode")) ||
      !["require", "verify-ca", "verify-full"].includes(securityRaw.searchParams.get("sslmode")) ||
      application.user === securityLog.user ||
      applicationDatabaseUrl === securityLogDatabaseUrl) deny();
  return Object.freeze({
    sandboxProjectId: G046_SANDBOX.projectId,
    sandboxBranchId: G046_SANDBOX.branchId,
    sourceAndSandboxEndpointsDistinct: true,
    database: G046_SANDBOX.database,
    authorizedToMigrateSource: false,
    authorizedToDeploySource: false,
    authorizedToDeploySandbox: false,
  });
}

export function renderG046SandboxConfig({
  applicationHyperdriveId, securityLogHyperdriveId, baseURL, buildSha,
  applicationDatabaseUrl, securityLogDatabaseUrl,
} = {}) {
  validateG046SandboxOrigins({ applicationDatabaseUrl, securityLogDatabaseUrl });
  const base = renderGeneratedPreviewWranglerConfig({
    appId: "ulc-linz",
    hyperdriveId: applicationHyperdriveId,
    securityLogHyperdriveId,
    baseURL, buildSha, entrypoint: G046_SANDBOX.entrypoint,
  });
  let parsed;
  try { parsed = new URL(baseURL); } catch { deny(); }
  if (parsed.origin !== baseURL ||
      !new RegExp("^" + G046_SANDBOX.workerName + "\\.[a-z0-9-]+\\.workers\\.dev$").test(parsed.hostname) ||
      base.name === G046_SANDBOX.workerName ||
      base.hyperdrive[0].id === base.hyperdrive[1]?.id) deny();
  return Object.freeze({
    ...base,
    name: G046_SANDBOX.workerName,
    vars: Object.freeze({
      ...base.vars,
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_RUNTIME_ENVIRONMENT: "generated-preview-ulc-linz",
      APPBASIS_REGISTRATION_CALENDAR_V17: "enabled",
      APPBASIS_G046_SANDBOX_BRANCH_ID: G046_SANDBOX.branchId,
    }),
  });
}

export async function resolveG046SandboxHyperdrives({
  accountId, apiToken, applicationDatabaseUrl, securityLogDatabaseUrl,
  apply = false, fetchImpl = globalThis.fetch,
} = {}) {
  validateG046SandboxOrigins({ applicationDatabaseUrl, securityLogDatabaseUrl });
  const mode = apply === true ? ensureGeneratedPreviewHyperdrive : resolveGeneratedPreviewHyperdrive;
  const [application, securityLog] = await Promise.all([
    mode({ target: TARGETS.application, accountId, apiToken,
      databaseUrl: applicationDatabaseUrl, ...(apply ? { apply: true, reconcileExisting: false } : {}), fetchImpl }),
    mode({ target: TARGETS.securityLog, accountId, apiToken,
      databaseUrl: securityLogDatabaseUrl, ...(apply ? { apply: true, reconcileExisting: false } : {}), fetchImpl }),
  ]);
  if (application.id === securityLog.id) deny();
  return Object.freeze({ applicationId: application.id, securityLogId: securityLog.id });
}

if (typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  const urls = {
    applicationDatabaseUrl: process.env.APPBASIS_G046_APP_DATABASE_URL,
    securityLogDatabaseUrl: process.env.APPBASIS_G046_SECURITY_DATABASE_URL,
  };
  const guard = async () => {
    if (mode === "preflight") {
      process.stdout.write(JSON.stringify(validateG046SandboxOrigins(urls)) + "\n");
    } else if (mode === "resolve" || mode === "provision") {
      if (mode === "provision" && process.env.APPBASIS_G046_PROVIDER_APPROVED !== "1") deny();
      const result = await resolveG046SandboxHyperdrives({
        ...urls, accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        apply: mode === "provision",
      });
      process.stdout.write(JSON.stringify(result) + "\n");
    } else if (mode === "render") {
      const config = renderG046SandboxConfig({
        ...urls,
        applicationHyperdriveId: process.env.APPBASIS_G046_APP_HYPERDRIVE_ID,
        securityLogHyperdriveId: process.env.APPBASIS_G046_SECURITY_HYPERDRIVE_ID,
        baseURL: process.env.APPBASIS_G046_BASE_URL,
        buildSha: process.env.GITHUB_SHA,
      });
      const target = "./apps/ulc-linz/wrangler.g04-sandbox.generated.json";
      const tmp = target + "." + randomUUID() + ".tmp";
      try {
        await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", {
          mode: 0o600, encoding: "utf8", flag: "wx",
        });
        await rename(tmp, target);
      } finally { await rm(tmp, { force: true }); }
      process.stdout.write(JSON.stringify({ workerName: config.name, rendered: true }) + "\n");
    } else deny();
  };
  guard().catch(() => {
    // Never print connection URLs, database passwords, tokens or provider responses.
    console.error("G-04.6 sandbox preflight blocked.");
    process.exitCode = 1;
  });
}

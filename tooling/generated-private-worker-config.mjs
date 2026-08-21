const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const COMPATIBILITY_DATE = "2026-08-21";
const WORKER_NAME_PREFIX = "appbasis-";
const PRODUCTION_WORKER_NAME_SUFFIX = "-production";
const WORKER_NAME_MAX_LENGTH = 63;

export function renderGeneratedPrivateWorkerBootstrapConfig(input) {
  const appId = requiredIdentifier(input?.appId, "appId");
  const workerName = requiredProductionWorkerName(appId);

  return `${JSON.stringify(
    {
      $schema: "./node_modules/wrangler/config-schema.json",
      name: workerName,
      compatibility_date: COMPATIBILITY_DATE,
      compatibility_flags: ["nodejs_compat"],
      main: "./worker/index.ts",
      workers_dev: false,
      preview_urls: false,
      keep_vars: true,
    },
    null,
    2,
  )}\n`;
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must be a lowercase kebab-case identifier.`);
  }
  return value;
}

function requiredProductionWorkerName(appId) {
  const baseWorkerName = `${WORKER_NAME_PREFIX}${appId}`;
  const workerName = `${baseWorkerName}${PRODUCTION_WORKER_NAME_SUFFIX}`;
  if (
    baseWorkerName.endsWith("-") ||
    workerName.length > WORKER_NAME_MAX_LENGTH
  ) {
    throw new Error("Derived Cloudflare production Worker name is invalid.");
  }
  return workerName;
}

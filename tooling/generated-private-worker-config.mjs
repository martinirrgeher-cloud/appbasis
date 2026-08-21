const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const COMPATIBILITY_DATE = "2026-08-21";

export function renderGeneratedPrivateWorkerBootstrapConfig(input) {
  const appId = requiredIdentifier(input?.appId, "appId");

  return `${JSON.stringify(
    {
      $schema: "./node_modules/wrangler/config-schema.json",
      name: `appbasis-${appId}-production`,
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

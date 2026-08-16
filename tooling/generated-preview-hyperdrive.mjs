const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const DIRECT_NEON_HOST_PATTERN = /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/i;
const MAX_API_PAGES = 100;
const PER_PAGE = 100;

export function defineGeneratedPreviewHyperdriveTarget({
  appId,
  environment,
  name,
  database,
} = {}) {
  return Object.freeze({
    appId: requiredIdentifier(appId, "appId"),
    environment: requiredIdentifier(environment, "environment"),
    name: requiredIdentifier(name, "name"),
    database: requiredDatabaseName(database),
  });
}

export function parseGeneratedPreviewDatabaseUrl(value, target) {
  const normalizedTarget = requiredTarget(target);
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("APPBASIS_DATABASE_URL must be a canonical PostgreSQL URL.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APPBASIS_DATABASE_URL must be a canonical PostgreSQL URL.");
  }

  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.username.length === 0 ||
    url.password.length === 0 ||
    url.hash.length > 0
  ) {
    throw new Error("APPBASIS_DATABASE_URL must be a direct authenticated PostgreSQL URL.");
  }

  if (!DIRECT_NEON_HOST_PATTERN.test(url.hostname)) {
    throw new Error(
      "APPBASIS_DATABASE_URL must use a direct Neon database origin.",
    );
  }

  if (/-pooler(?:\.|$)/i.test(url.hostname)) {
    throw new Error(
      "APPBASIS_DATABASE_URL must use the direct Neon origin, not a pooled Neon endpoint.",
    );
  }

  let database;
  let user;
  let password;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error("APPBASIS_DATABASE_URL contains invalid encoded credentials or database name.");
  }

  if (
    database !== normalizedTarget.database ||
    database.includes("/") ||
    user.length === 0 ||
    password.length === 0
  ) {
    throw new Error(
      "APPBASIS_DATABASE_URL does not select the dedicated generated preview database.",
    );
  }

  if (url.searchParams.has("database")) {
    throw new Error("APPBASIS_DATABASE_URL must not override the database through query parameters.");
  }

  const port = url.port === "" ? 5432 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("APPBASIS_DATABASE_URL contains an invalid PostgreSQL port.");
  }

  return Object.freeze({
    scheme: "postgres",
    host: url.hostname.toLowerCase(),
    port,
    database,
    user,
    password,
  });
}

export async function resolveGeneratedPreviewHyperdrive({
  target,
  accountId,
  apiToken,
  databaseUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateDeploymentInputs({
    target,
    accountId,
    apiToken,
    databaseUrl,
    fetchImpl,
  });
  const configs = await listHyperdrives(deployment);
  const matches = configs.filter(
    (config) => config?.name === deployment.target.name,
  );

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "Dedicated generated preview Hyperdrive configuration was not found."
        : "Dedicated generated preview Hyperdrive name is not unique.",
    );
  }

  return validateTargetConfiguration(
    matches[0],
    deployment.origin,
    deployment.target,
  );
}

export async function ensureGeneratedPreviewHyperdrive({
  target,
  accountId,
  apiToken,
  databaseUrl,
  apply = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deployment = validateDeploymentInputs({
    target,
    accountId,
    apiToken,
    databaseUrl,
    fetchImpl,
  });
  const configs = await listHyperdrives(deployment);
  const matches = configs.filter(
    (config) => config?.name === deployment.target.name,
  );

  if (matches.length > 1) {
    throw new Error("Dedicated generated preview Hyperdrive name is not unique.");
  }
  if (matches.length === 1) {
    return validateTargetConfiguration(
      matches[0],
      deployment.origin,
      deployment.target,
    );
  }
  if (apply !== true) {
    throw new Error(
      "Dedicated generated preview Hyperdrive is absent and creation was not explicitly confirmed.",
    );
  }

  const payload = await cloudflareJson(
    deployment.fetchImpl,
    deployment.configsUrl,
    {
      method: "POST",
      headers: cloudflareHeaders(deployment.apiToken, true),
      body: JSON.stringify({
        name: deployment.target.name,
        origin: {
          scheme: deployment.origin.scheme,
          host: deployment.origin.host,
          port: deployment.origin.port,
          database: deployment.origin.database,
          user: deployment.origin.user,
          password: deployment.origin.password,
        },
        caching: { disabled: true },
      }),
    },
    "create",
  );

  if (!isRecord(payload.result)) {
    throw new Error("Cloudflare Hyperdrive creation returned an invalid target.");
  }
  return validateTargetConfiguration(
    payload.result,
    deployment.origin,
    deployment.target,
  );
}

export function validateGeneratedPreviewHyperdrive(config, databaseUrl, target) {
  const normalizedTarget = requiredTarget(target);
  return validateTargetConfiguration(
    config,
    parseGeneratedPreviewDatabaseUrl(databaseUrl, normalizedTarget),
    normalizedTarget,
  );
}

function validateDeploymentInputs({ target, accountId, apiToken, databaseUrl, fetchImpl }) {
  const normalizedTarget = requiredTarget(target);
  if (typeof accountId !== "string" || !ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is invalid.");
  }
  if (
    typeof apiToken !== "string" ||
    apiToken.length === 0 ||
    apiToken.trim() !== apiToken ||
    /\s/u.test(apiToken)
  ) {
    throw new Error("CLOUDFLARE_API_TOKEN is invalid.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetchImpl must be a function.");
  }

  const origin = parseGeneratedPreviewDatabaseUrl(databaseUrl, normalizedTarget);
  const configsUrl = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/hyperdrive/configs`;
  return Object.freeze({
    target: normalizedTarget,
    accountId,
    apiToken,
    origin,
    fetchImpl,
    configsUrl,
  });
}

async function listHyperdrives(deployment) {
  const configs = [];
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const url = new URL(deployment.configsUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PER_PAGE));

    const payload = await cloudflareJson(
      deployment.fetchImpl,
      url.href,
      {
        method: "GET",
        headers: cloudflareHeaders(deployment.apiToken, false),
      },
      "list",
    );
    if (!Array.isArray(payload.result)) {
      throw new Error("Cloudflare Hyperdrive list returned an invalid result.");
    }
    configs.push(...payload.result);

    const totalCount = payload.result_info?.total_count;
    if (Number.isInteger(totalCount) && totalCount >= 0) {
      if (configs.length >= totalCount) return configs;
    } else if (payload.result.length < PER_PAGE) {
      return configs;
    }
  }
  throw new Error("Cloudflare Hyperdrive list exceeded the bounded pagination limit.");
}

function validateTargetConfiguration(config, expectedOrigin, target) {
  if (!isRecord(config) || !isRecord(config.origin)) {
    throw new Error("Dedicated generated preview Hyperdrive configuration is invalid.");
  }

  const id = config.id;
  const origin = config.origin;
  const normalizedScheme = normalizePostgresScheme(origin.scheme);

  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > 256 ||
    /[\s\u0000-\u001f\u007f]/u.test(id) ||
    config.name !== target.name ||
    typeof origin.host !== "string" ||
    origin.host.toLowerCase() !== expectedOrigin.host ||
    Number(origin.port ?? 5432) !== expectedOrigin.port ||
    origin.database !== expectedOrigin.database ||
    origin.user !== expectedOrigin.user ||
    normalizedScheme !== expectedOrigin.scheme ||
    !isRecord(config.caching) ||
    config.caching.disabled !== true
  ) {
    throw new Error(
      "Dedicated generated preview Hyperdrive does not match the database binding contract.",
    );
  }

  return Object.freeze({ id, name: target.name });
}

function normalizePostgresScheme(value) {
  return value === "postgres" || value === "postgresql" ? "postgres" : value;
}

async function cloudflareJson(fetchImpl, url, options, operation) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    throw new Error(`Cloudflare Hyperdrive ${operation} API request failed.`);
  }
  if (!(response instanceof Response)) {
    throw new Error(`Cloudflare Hyperdrive ${operation} API returned an invalid response.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Cloudflare Hyperdrive ${operation} API returned invalid JSON.`);
  }
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(cloudflareRejectionMessage(operation, response, payload));
  }
  return payload;
}

function cloudflareRejectionMessage(operation, response, payload) {
  const diagnostics = [];
  if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) {
    diagnostics.push(`status ${response.status}`);
  }

  const errorCodes = Array.isArray(payload?.errors)
    ? [
        ...new Set(
          payload.errors
            .map((error) => error?.code)
            .filter(
              (code) =>
                Number.isInteger(code) &&
                code >= 0 &&
                code <= 999_999_999,
            ),
        ),
      ].slice(0, 3)
    : [];
  if (errorCodes.length > 0) {
    diagnostics.push(`codes ${errorCodes.join(",")}`);
  }

  const suffix = diagnostics.length > 0 ? ` (${diagnostics.join("; ")})` : "";
  return `Cloudflare Hyperdrive ${operation} rejected the request${suffix}.`;
}

function cloudflareHeaders(apiToken, includeContentType) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiToken}`,
    ...(includeContentType ? { "content-type": "application/json" } : {}),
  };
}

function requiredTarget(value) {
  if (!isRecord(value) || !Object.isFrozen(value)) {
    throw new Error("Generated preview Hyperdrive target is invalid.");
  }
  requiredIdentifier(value.appId, "appId");
  requiredIdentifier(value.environment, "environment");
  requiredIdentifier(value.name, "name");
  requiredDatabaseName(value.database);
  return value;
}

function requiredIdentifier(value, field) {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    throw new Error(`${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return value;
}

function requiredDatabaseName(value) {
  if (
    typeof value !== "string" ||
    value.length > 63 ||
    !DATABASE_NAME_PATTERN.test(value)
  ) {
    throw new Error(`database must match ${DATABASE_NAME_PATTERN.source}.`);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

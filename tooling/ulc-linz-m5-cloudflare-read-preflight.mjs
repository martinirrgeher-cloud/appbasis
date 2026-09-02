import { pathToFileURL } from "node:url";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_CLASSES = Object.freeze([
  "subdomain",
  "custom-domains",
  "deployments",
  "script-inventory",
  "script-settings",
  "version",
]);
const FAILURE_CLASSES = Object.freeze([
  "transport",
  "invalid-response",
  "http-400",
  "http-401",
  "http-403",
  "http-404",
  "http-429",
  "http-4xx",
  "http-5xx",
  "http-other",
  "invalid-json",
  "api-unsuccessful",
  "invalid-shape",
]);

export function buildUlcLinzM5CloudflareReadSurface(accountId, versionId = null) {
  const safeAccountId = requiredOpaque(accountId, "Cloudflare account ID");
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(safeAccountId)}`;
  const domainsUrl = new URL(`${accountPath}/workers/domains`);
  domainsUrl.searchParams.set("service", TARGET_WORKER);
  const requests = [
    { requestClass: "subdomain", url: `${accountPath}/workers/scripts/${TARGET_WORKER}/subdomain` },
    { requestClass: "custom-domains", url: String(domainsUrl) },
    { requestClass: "deployments", url: `${accountPath}/workers/scripts/${TARGET_WORKER}/deployments` },
    { requestClass: "script-inventory", url: `${accountPath}/workers/scripts` },
    { requestClass: "script-settings", url: `${accountPath}/workers/scripts/${TARGET_WORKER}/script-settings` },
  ];
  if (versionId !== null) {
    const safeVersionId = requiredVersionId(versionId);
    requests.push({
      requestClass: "version",
      url: `${accountPath}/workers/scripts/${TARGET_WORKER}/versions/${safeVersionId}`,
    });
  }
  return Object.freeze(requests.map((request) => Object.freeze(request)));
}

export async function runUlcLinzM5CloudflareReadPreflight(
  { accountId, apiToken },
  { fetchImpl = fetch } = {},
) {
  const safeAccountId = requiredOpaque(accountId, "Cloudflare account ID");
  const safeApiToken = requiredCredential(apiToken, "Cloudflare API token");
  const initialRequests = buildUlcLinzM5CloudflareReadSurface(safeAccountId);

  const settled = await Promise.allSettled(
    initialRequests.map(({ requestClass, url }) =>
      cloudflareJson(url, safeApiToken, fetchImpl, requestClass),
    ),
  );
  const failures = [];
  let deploymentsResponse = null;
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const { requestClass } = initialRequests[index];
    if (result.status === "rejected") {
      failures.push(normalizeFailure(result.reason, requestClass));
      continue;
    }
    if (!hasExpectedShape(requestClass, result.value)) {
      failures.push(failure(requestClass, "invalid-shape"));
      continue;
    }
    if (requestClass === "deployments") deploymentsResponse = result.value;
  }

  if (deploymentsResponse !== null) {
    const versionId = currentVersionId(deploymentsResponse);
    if (versionId === null) {
      failures.push(failure("deployments", "invalid-shape"));
    } else {
      try {
        const versionRequest = buildUlcLinzM5CloudflareReadSurface(safeAccountId, versionId).at(-1);
        const version = await cloudflareJson(
          versionRequest.url,
          safeApiToken,
          fetchImpl,
          versionRequest.requestClass,
        );
        if (!hasExpectedShape("version", version)) {
          failures.push(failure("version", "invalid-shape"));
        }
      } catch (error) {
        failures.push(normalizeFailure(error, "version"));
      }
    }
  }

  if (failures.length > 0) {
    failures.sort((left, right) =>
      REQUEST_CLASSES.indexOf(left.requestClass) - REQUEST_CLASSES.indexOf(right.requestClass),
    );
    throw new Error(
      `Cloudflare provider read preflight failed: ${failures
        .map(({ requestClass, failureClass }) => `${requestClass}:${failureClass}`)
        .join(", ")}.`,
    );
  }

  return Object.freeze({ cloudflareReadPreflightVerified: true });
}

function hasExpectedShape(requestClass, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (requestClass === "subdomain") return value.result !== null && typeof value.result === "object";
  if (requestClass === "custom-domains" || requestClass === "script-inventory") return Array.isArray(value.result);
  if (requestClass === "deployments") return Array.isArray(value?.result?.deployments);
  if (requestClass === "script-settings" || requestClass === "version") {
    return value.result !== null && typeof value.result === "object" && !Array.isArray(value.result);
  }
  return false;
}

function currentVersionId(value) {
  const current = value?.result?.deployments?.[0];
  if (!Array.isArray(current?.versions) || current.versions.length !== 1) return null;
  const [version] = current.versions;
  if (version?.percentage !== 100 || typeof version.version_id !== "string") return null;
  return VERSION_ID_PATTERN.test(version.version_id) ? version.version_id : null;
}

async function cloudflareJson(url, apiToken, fetchImpl, requestClass) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(message(requestClass, "transport"));
  }
  if (response === null || typeof response !== "object") {
    throw new Error(message(requestClass, "invalid-response"));
  }
  if (response.ok !== true) {
    throw new Error(message(requestClass, classifyHttpStatus(response.status)));
  }
  if (typeof response.json !== "function") {
    throw new Error(message(requestClass, "invalid-response"));
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(message(requestClass, "invalid-json"));
  }
  if (value?.success !== true) {
    throw new Error(message(requestClass, "api-unsuccessful"));
  }
  return value;
}

function classifyHttpStatus(value) {
  if (value === 400) return "http-400";
  if (value === 401) return "http-401";
  if (value === 403) return "http-403";
  if (value === 404) return "http-404";
  if (value === 429) return "http-429";
  if (Number.isInteger(value) && value >= 400 && value < 500) return "http-4xx";
  if (Number.isInteger(value) && value >= 500 && value < 600) return "http-5xx";
  return "http-other";
}

function normalizeFailure(error, fallbackRequestClass) {
  if (error instanceof Error) {
    const match = /^Cloudflare preflight request failed: ([a-z-]+):([a-z0-9-]+)\.$/.exec(error.message);
    if (
      match &&
      REQUEST_CLASSES.includes(match[1]) &&
      FAILURE_CLASSES.includes(match[2])
    ) {
      return failure(match[1], match[2]);
    }
  }
  return failure(fallbackRequestClass, "invalid-response");
}

function failure(requestClass, failureClass) {
  if (!REQUEST_CLASSES.includes(requestClass) || !FAILURE_CLASSES.includes(failureClass)) {
    throw new Error("Cloudflare preflight failure classification is invalid.");
  }
  return Object.freeze({ requestClass, failureClass });
}

function message(requestClass, failureClass) {
  const value = failure(requestClass, failureClass);
  return `Cloudflare preflight request failed: ${value.requestClass}:${value.failureClass}.`;
}

function requiredOpaque(value, label) {
  if (typeof value !== "string" || !OPAQUE_PATTERN.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredVersionId(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("Cloudflare version ID is invalid.");
  }
  return value;
}

function requiredCredential(value, label) {
  if (typeof value !== "string" || value.length < 8 || value.length > 4096 || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

async function main() {
  const result = await runUlcLinzM5CloudflareReadPreflight({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Cloudflare provider read preflight failed."}\n`);
    process.exitCode = 1;
  });
}

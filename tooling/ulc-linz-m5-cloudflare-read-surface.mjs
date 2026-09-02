const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
export const ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER = "appbasis-ulc-linz-production";
export const ULC_LINZ_M5_CLOUDFLARE_REQUEST_CLASSES = Object.freeze([
  "subdomain",
  "custom-domains",
  "deployments",
  "script-inventory",
  "script-settings",
  "version",
]);

const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildUlcLinzM5CloudflareReadSurface(accountId, versionId = null) {
  const safeAccountId = requiredOpaque(accountId, "Cloudflare account ID");
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(safeAccountId)}`;
  const domainsUrl = new URL(`${accountPath}/workers/domains`);
  domainsUrl.searchParams.set("service", ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER);
  const requests = [
    {
      requestClass: "subdomain",
      url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/subdomain`,
    },
    { requestClass: "custom-domains", url: String(domainsUrl) },
    {
      requestClass: "deployments",
      url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/deployments`,
    },
    { requestClass: "script-inventory", url: `${accountPath}/workers/scripts` },
    {
      requestClass: "script-settings",
      url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/script-settings`,
    },
  ];
  if (versionId !== null) {
    const safeVersionId = requiredVersionId(versionId);
    requests.push({
      requestClass: "version",
      url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/versions/${safeVersionId}`,
    });
  }
  return Object.freeze(requests.map((request) => Object.freeze(request)));
}

function requiredOpaque(value, label) {
  if (typeof value !== "string" || !OPAQUE_PATTERN.test(value) || value !== value.trim()) {
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

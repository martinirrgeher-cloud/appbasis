import { createHash } from "node:crypto";

import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "./ulc-linz-m5-provider-evidence.mjs";

const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const DATARBRICKS_DPA_PDF_MARKER = "Databricks DPA v3 (2023-07-21)";
const DATABRICKS_DPA_PDF_SHA256 = "5b13d95891a87327097ff15445ea645944308a2ecaf27cb3b86c39e9c0e613b0";
const SOURCES = Object.freeze({
  cloudflareDpa: "https://www.cloudflare.com/cloudflare-customer-dpa/",
  cloudflareGdpr: "https://www.cloudflare.com/trust-hub/gdpr/",
  cloudflareSubprocessors:
    "https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/",
  cloudflareHyperdriveTls:
    "https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/",
  neonSchedule: "https://neon.com/platform-terms",
  databricksMcsa: "https://www.databricks.com/legal/mcsa",
  databricksDpa:
    "https://www.databricks.com/sites/default/files/legal/dpa-20230721.pdf",
  databricksSubprocessors:
    "https://www.databricks.com/legal/databricks-subprocessors",
  neonSecurity: "https://neon.com/security",
});

export async function collectUlcLinzM5ProviderLegalEvidence(
  {
    cloudflareAccountBound,
    neonProjectBound,
    observedAt,
    validUntilOrReviewAt,
  },
  { fetchImpl = fetch, sha256Impl = sha256 } = {},
) {
  if (cloudflareAccountBound !== true || neonProjectBound !== true) {
    throw new Error("ULC M5-G authenticated provider resource binding is incomplete.");
  }
  if (typeof fetchImpl !== "function" || typeof sha256Impl !== "function") {
    throw new Error("ULC M5-G legal evidence fetch implementation is invalid.");
  }
  const observed = canonicalTimestamp(observedAt, "observedAt");
  const validUntil = canonicalTimestamp(validUntilOrReviewAt, "validUntilOrReviewAt");
  if (
    validUntil.getTime() <= observed.getTime() ||
    validUntil.getTime() - observed.getTime() > REVIEW_WINDOW_MS
  ) {
    throw new Error("ULC M5-G legal evidence window is invalid.");
  }

  const entries = await Promise.all(
    Object.entries(SOURCES).map(async ([key, url]) => [
      key,
      key === "databricksDpa"
        ? await officialDatabricksDpaPdf(url, fetchImpl, sha256Impl)
        : await officialText(url, fetchImpl),
    ]),
  );
  const text = Object.fromEntries(entries);

  requireAll(text.cloudflareDpa, [
    "Version 6.4",
    "effective April 3, 2026",
    "forms part of the Main Agreement",
  ], "Cloudflare DPA");
  requireAll(text.cloudflareGdpr, [
    "incorporated by reference into our Self-Serve Subscription Agreement",
    "standard DPA",
  ], "Cloudflare GDPR contract baseline");
  requireAll(text.cloudflareSubprocessors, [
    "Last Updated: October 1, 2025",
    "Cloudflare Developer Platform",
    "Google LLC",
    "Oracle America, Inc.",
  ], "Cloudflare subprocessors");
  requireAll(text.cloudflareHyperdriveTls, [
    "Hyperdrive does not support insecure plain text connections",
    "TLS is required",
    "require",
  ], "Cloudflare Hyperdrive TLS");
  requireAll(text.neonSchedule, [
    "Last Updated: August 5, 2026",
    "By accessing the Platform Services, Customer agrees to the terms of this Schedule",
    "then-current Databricks Master Cloud Services Agreement",
    "Grafana Labs",
  ], "Neon Product Specific Schedule");
  requireAll(text.databricksMcsa, [
    "The terms of the DPA are incorporated by reference",
    "PayGo Customer’s continued use",
  ], "Databricks MCSA");
  if (text.databricksDpa !== DATARBRICKS_DPA_PDF_MARKER) {
    throw new Error("ULC M5-G Databricks DPA drifted from the reviewed official baseline.");
  }
  requireAll(text.databricksSubprocessors, [
    "Last Updated: June 9, 2026",
    "Amazon Web Services",
  ], "Databricks subprocessors");
  requireAll(text.neonSecurity, [
    "Neon’s Security & Compliance",
    "Data Processing Agreements",
    "TLS 1.2+",
    "All stored data is encrypted using AES-256",
  ], "Neon security baseline");

  const cloudflareScope = ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES.cloudflare;
  const neonScope = ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES["neon-databricks"];
  const common = { observedAt, validUntilOrReviewAt };

  // Public provider terms prove the applicable contractual baseline only.
  // They do not prove that the authenticated provider account is legally held
  // by the ULC/Verein operator. Account-specific DPA evidence therefore remains
  // absent until an independent operator-to-provider-account binding is supplied.
  return Object.freeze([
    legal("cloudflare", "dpa", SOURCES.cloudflareDpa, "6.4 / 2026-04-03", cloudflareScope, common),
    legal("cloudflare", "security", SOURCES.cloudflareHyperdriveTls, "2026-04-21", cloudflareScope, common),
    legal(
      "cloudflare",
      "subprocessors",
      SOURCES.cloudflareSubprocessors,
      "2025-10-01",
      cloudflareScope,
      common,
      { transferModelConsistentWithAdr022: true },
    ),
    legal("neon-databricks", "terms", SOURCES.neonSchedule, "2026-08-05", neonScope, common),
    legal("neon-databricks", "dpa", SOURCES.databricksDpa, "Databricks DPA v3", neonScope, common),
    legal(
      "neon-databricks",
      "security",
      SOURCES.neonSecurity,
      "current-Neon-security-baseline",
      neonScope,
      common,
    ),
    legal(
      "neon-databricks",
      "subprocessors",
      SOURCES.databricksSubprocessors,
      "2026-06-09 + Neon schedule 2026-08-05",
      neonScope,
      common,
      { transferModelConsistentWithAdr022: true },
    ),
  ]);
}

function legal(
  provider,
  documentType,
  canonicalSource,
  documentVersionOrUpdatedAt,
  serviceScope,
  common,
  {
    accountSpecific = false,
    publicBaseline = true,
    transferModelConsistentWithAdr022 = null,
  } = {},
) {
  return Object.freeze({
    provider,
    documentType,
    canonicalSource,
    documentVersionOrUpdatedAt,
    serviceScope,
    observedAt: common.observedAt,
    validUntilOrReviewAt: common.validUntilOrReviewAt,
    accountSpecific,
    publicBaseline,
    transferModelConsistentWithAdr022,
  });
}

async function officialText(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "text/html, text/plain;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("ULC M5-G official legal evidence request failed.");
  }
  if (!response?.ok || typeof response.text !== "function") {
    throw new Error("ULC M5-G official legal evidence request failed.");
  }
  requireTrustedFinalUrl(response.url || url, url);
  const body = await response.text();
  if (typeof body !== "string" || body.length < 100) {
    throw new Error("ULC M5-G official legal evidence body is invalid.");
  }
  return normalize(body);
}

async function officialDatabricksDpaPdf(url, fetchImpl, sha256Impl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/pdf" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("ULC M5-G official legal evidence request failed.");
  }
  if (!response?.ok || typeof response.arrayBuffer !== "function") {
    throw new Error("ULC M5-G official legal evidence request failed.");
  }
  const finalUrl = requireTrustedFinalUrl(response.url || url, url);
  const expected = new URL(url);
  if (finalUrl.href !== expected.href) {
    throw new Error("ULC M5-G Databricks DPA redirected away from the reviewed versioned asset.");
  }
  const contentType = response.headers?.get?.("content-type")?.split(";", 1)[0]?.trim()?.toLowerCase();
  if (contentType !== "application/pdf") {
    throw new Error("ULC M5-G Databricks DPA is not the reviewed PDF asset.");
  }
  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error("ULC M5-G official legal evidence request failed.");
  }
  if (bytes.byteLength < 10_000 || bytes.byteLength > 5_000_000) {
    throw new Error("ULC M5-G Databricks DPA PDF body is invalid.");
  }
  const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 16))).toString("latin1");
  const trailer = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1");
  if (!header.startsWith("%PDF-") || !trailer.includes("%%EOF")) {
    throw new Error("ULC M5-G Databricks DPA PDF body is invalid.");
  }
  const observedSha256 = sha256Impl(bytes);
  if (!/^[0-9a-f]{64}$/u.test(observedSha256)) {
    throw new Error("ULC M5-G Databricks DPA digest result is invalid.");
  }
  if (observedSha256 !== DATABRICKS_DPA_PDF_SHA256) {
    throw new Error(
      `ULC M5-G Databricks DPA drifted from the reviewed official baseline (observed sha256: ${observedSha256}).`,
    );
  }
  return DATARBRICKS_DPA_PDF_MARKER;
}

function sha256(bytes) {
  return createHash("sha256")
    .update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .digest("hex");
}

function requireTrustedFinalUrl(value, expectedValue) {
  const finalUrl = new URL(value);
  const expected = new URL(expectedValue);
  if (finalUrl.protocol !== "https:" || finalUrl.hostname !== expected.hostname) {
    throw new Error("ULC M5-G official legal evidence redirected outside its trusted host.");
  }
  return finalUrl;
}

function requireAll(text, needles, label) {
  if (typeof text !== "string" || needles.some((needle) => !text.includes(needle))) {
    throw new Error(`ULC M5-G ${label} drifted from the reviewed official baseline.`);
  }
}

function normalize(value) {
  return value
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll(/&nbsp;|&#160;/gu, " ")
    .replaceAll(/&amp;/gu, "&")
    .replaceAll(/&#39;|&apos;/gu, "'")
    .replaceAll(/&quot;/gu, '"')
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string") {
    throw new Error(`ULC M5-G ${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`ULC M5-G ${label} is invalid.`);
  }
  return parsed;
}

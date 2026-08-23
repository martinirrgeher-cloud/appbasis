import assert from "node:assert/strict";
import test from "node:test";

import { collectUlcLinzM5ProviderLegalEvidence } from "./ulc-linz-m5-provider-legal-evidence.mjs";

const OBSERVED_AT = "2026-08-23T22:00:00.000Z";
const VALID_UNTIL = "2026-08-23T22:15:00.000Z";

const SOURCE_TEXT = Object.freeze({
  "www.cloudflare.com/cloudflare-customer-dpa/":
    "Version 6.4, effective April 3, 2026. This DPA forms part of the Main Agreement.",
  "www.cloudflare.com/trust-hub/gdpr/":
    "Our standard DPA is incorporated by reference into our Self-Serve Subscription Agreement.",
  "www.cloudflare.com/gdpr/subprocessors/cloudflare-services/":
    "Last Updated: October 1, 2025 Cloudflare Developer Platform Google LLC Oracle America, Inc.",
  "developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/":
    "Hyperdrive does not support insecure plain text connections. TLS is required. require is the default.",
  "neon.com/platform-terms":
    "Last Updated: August 5, 2026. By accessing the Platform Services, Customer agrees to the terms of this Schedule. This Schedule is subject to the terms of the then-current Databricks Master Cloud Services Agreement. Grafana Labs.",
  "www.databricks.com/legal/mcsa":
    "The terms of the DPA are incorporated by reference. PayGo Customer’s continued use constitutes consent.",
  "www.databricks.com/legal/dpa":
    "DATA PROCESSING ADDENDUM forms an integral part of the Databricks Master Cloud Services Agreement.",
  "www.databricks.com/legal/databricks-subprocessors":
    "Last Updated: June 9, 2026 Amazon Web Services",
  "neon.com/security":
    "Neon’s Security & Compliance. We offer Data Processing Agreements (DPA).",
});

function legalFetch(url) {
  const parsed = new URL(url);
  const key = `${parsed.hostname}${parsed.pathname}`;
  const body = SOURCE_TEXT[key];
  if (body === undefined) throw new Error(`Unexpected legal source: ${key}`);
  return Promise.resolve({
    ok: true,
    url: parsed.href,
    async text() { return `<html><body>${body}</body></html>`; },
  });
}

function collect(overrides = {}, options = {}) {
  return collectUlcLinzM5ProviderLegalEvidence(
    {
      cloudflareAccountBound: true,
      neonProjectBound: true,
      observedAt: OBSERVED_AT,
      validUntilOrReviewAt: VALID_UNTIL,
      ...overrides,
    },
    { fetchImpl: legalFetch, ...options },
  );
}

test("collects exact live public and account-bound legal evidence for both providers", async () => {
  const result = await collect();
  assert.equal(result.length, 9);
  const cloudflareDpa = result.find(
    (entry) => entry.provider === "cloudflare" && entry.documentType === "dpa",
  );
  const cloudflareBinding = result.find(
    (entry) =>
      entry.provider === "cloudflare" &&
      entry.documentType === "dpa-account-binding",
  );
  const neonBinding = result.find(
    (entry) =>
      entry.provider === "neon-databricks" &&
      entry.documentType === "dpa-account-binding",
  );
  assert.equal(cloudflareDpa.documentVersionOrUpdatedAt, "6.4 / 2026-04-03");
  assert.equal(cloudflareDpa.publicBaseline, true);
  assert.equal(cloudflareDpa.accountSpecific, false);
  assert.equal(cloudflareBinding.accountSpecific, true);
  assert.equal(cloudflareBinding.publicBaseline, false);
  assert.equal(neonBinding.accountSpecific, true);
  assert.equal(neonBinding.publicBaseline, false);
  assert.ok(result.every((entry) => entry.observedAt === OBSERVED_AT));
  assert.ok(result.every((entry) => entry.validUntilOrReviewAt === VALID_UNTIL));
});

test("fails closed without both authenticated provider bindings", async () => {
  await assert.rejects(
    () => collect({ cloudflareAccountBound: false }),
    /account binding is incomplete/,
  );
  await assert.rejects(
    () => collect({ neonProjectBound: false }),
    /account binding is incomplete/,
  );
});

test("fails closed on any reviewed official source drift", async () => {
  const fetchImpl = async (url) => {
    const response = await legalFetch(url);
    if (String(url).includes("cloudflare-customer-dpa")) {
      return {
        ...response,
        async text() { return "<html><body>Version 7.0 changed contract</body></html>"; },
      };
    }
    return response;
  };
  await assert.rejects(
    () => collect({}, { fetchImpl }),
    /drifted from the reviewed official baseline/,
  );
});

test("rejects redirects outside each trusted official host", async () => {
  const fetchImpl = async (url) => {
    const response = await legalFetch(url);
    return { ...response, url: "https://example.com/legal", async text() { return response.text(); } };
  };
  await assert.rejects(
    () => collect({}, { fetchImpl }),
    /redirected outside its trusted host/,
  );
});

test("rejects overlong or inverted evidence windows", async () => {
  await assert.rejects(
    () => collect({ validUntilOrReviewAt: "2026-08-25T22:00:00.000Z" }),
    /window is invalid/,
  );
  await assert.rejects(
    () => collect({ validUntilOrReviewAt: "2026-08-23T21:59:59.000Z" }),
    /window is invalid/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { collectUlcLinzM5ProviderLegalEvidence } from "./ulc-linz-m5-provider-legal-evidence.mjs";

const OBSERVED_AT = "2026-08-23T22:00:00.000Z";
const VALID_UNTIL = "2026-08-23T22:15:00.000Z";

const SOURCE_TEXT = Object.freeze({
  "www.cloudflare.com/cloudflare-customer-dpa/":
    "Version 6.4, effective April 3, 2026. This DPA forms part of the Main Agreement and establishes the reviewed data-processing baseline for Cloudflare customer services.",
  "www.cloudflare.com/trust-hub/gdpr/":
    "Our standard DPA is incorporated by reference into our Self-Serve Subscription Agreement and is available to customers as part of the current GDPR contractual framework.",
  "www.cloudflare.com/gdpr/subprocessors/cloudflare-services/":
    "Last Updated: October 1, 2025 Cloudflare Developer Platform Google LLC Oracle America, Inc. This fixture represents the reviewed official service-specific subprocessor baseline.",
  "developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/":
    "Hyperdrive does not support insecure plain text connections. TLS is required. require is the default. This fixture represents the reviewed secure-transport documentation baseline.",
  "neon.com/platform-terms":
    "Last Updated: August 5, 2026. By accessing the Platform Services, Customer agrees to the terms of this Schedule. This Schedule is subject to the terms of the then-current Databricks Master Cloud Services Agreement. Grafana Labs.",
  "www.databricks.com/legal/mcsa":
    "The terms of the DPA are incorporated by reference. PayGo Customer’s continued use constitutes consent. This fixture represents the reviewed current Databricks contractual chain for Neon Platform Services.",
  "www.databricks.com/legal/dpa":
    "DATA PROCESSING ADDENDUM forms an integral part of the Databricks Master Cloud Services Agreement. This fixture represents the reviewed current public DPA baseline.",
  "www.databricks.com/legal/databricks-subprocessors":
    "Last Updated: June 9, 2026 Amazon Web Services. This fixture represents the reviewed current Databricks subprocessor baseline used together with the Neon Product Specific Schedule.",
  "neon.com/security":
    "Neon’s Security & Compliance. We offer Data Processing Agreements (DPA). Neon enforces TLS 1.2+ encryption. All stored data is encrypted using AES-256.",
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

test("collects exact public legal/security baselines but never invents provider-account DPA binding", async () => {
  const result = await collect();
  assert.equal(result.length, 7);
  const cloudflareDpa = result.find(
    (entry) => entry.provider === "cloudflare" && entry.documentType === "dpa",
  );
  const neonDpa = result.find(
    (entry) => entry.provider === "neon-databricks" && entry.documentType === "dpa",
  );
  assert.equal(cloudflareDpa.documentVersionOrUpdatedAt, "6.4 / 2026-04-03");
  assert.equal(cloudflareDpa.publicBaseline, true);
  assert.equal(cloudflareDpa.accountSpecific, false);
  assert.equal(neonDpa.publicBaseline, true);
  assert.equal(neonDpa.accountSpecific, false);
  assert.equal(
    result.some((entry) => entry.documentType === "dpa-account-binding"),
    false,
  );
  assert.equal(result.some((entry) => entry.accountSpecific === true), false);
  assert.ok(result.every((entry) => entry.observedAt === OBSERVED_AT));
  assert.ok(result.every((entry) => entry.validUntilOrReviewAt === VALID_UNTIL));
});

test("requires both authenticated provider resources but does not confuse resource binding with legal operator binding", async () => {
  await assert.rejects(
    () => collect({ cloudflareAccountBound: false }),
    /resource binding is incomplete/,
  );
  await assert.rejects(
    () => collect({ neonProjectBound: false }),
    /resource binding is incomplete/,
  );
  const result = await collect();
  assert.equal(result.some((entry) => entry.documentType === "dpa-account-binding"), false);
});

test("fails closed on any reviewed official source drift", async () => {
  const fetchImpl = async (url) => {
    const response = await legalFetch(url);
    if (String(url).includes("cloudflare-customer-dpa")) {
      return {
        ...response,
        async text() {
          return "<html><body>Version 7.0 changed contract. This deliberately long drift fixture is otherwise structurally valid but omits every reviewed Version 6.4 and April 3, 2026 contract anchor.</body></html>";
        },
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

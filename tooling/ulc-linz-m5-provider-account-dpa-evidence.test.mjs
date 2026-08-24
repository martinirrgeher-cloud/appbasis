import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzM5AccountBoundDpaEvidence,
  parseUlcLinzM5AccountBoundDpaEvidenceJson,
} from "./ulc-linz-m5-provider-account-dpa-evidence.mjs";

const OBSERVED_AT = "2026-08-24T04:00:00.000Z";
const VALID_UNTIL = "2026-08-24T04:15:00.000Z";
const bindings = Object.freeze({
  cloudflareAccountBindingId: "account-1",
  neonProjectBindingId: "project-1",
  observedAt: OBSERVED_AT,
  validUntilOrReviewAt: VALID_UNTIL,
});

function evidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "protected-operator-contract-record",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    cloudflare: {
      resourceBindingId: "account-1",
      documentReference: "urn:appbasis:operator-contract-record:ulc-cloudflare-2026",
      evidenceDigest: `sha256:${"a".repeat(64)}`,
    },
    neon: {
      resourceBindingId: "project-1",
      documentReference: "urn:appbasis:operator-contract-record:ulc-neon-2026",
      evidenceDigest: `sha256:${"b".repeat(64)}`,
    },
  };
}

test("derives only account-specific DPA entries from an exact protected contract record", () => {
  const result = deriveUlcLinzM5AccountBoundDpaEvidence(evidence(), bindings);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map(({ provider, documentType, accountSpecific, publicBaseline }) => ({
      provider,
      documentType,
      accountSpecific,
      publicBaseline,
    })),
    [
      {
        provider: "cloudflare",
        documentType: "dpa-account-binding",
        accountSpecific: true,
        publicBaseline: false,
      },
      {
        provider: "neon-databricks",
        documentType: "dpa-account-binding",
        accountSpecific: true,
        publicBaseline: false,
      },
    ],
  );
  assert.equal(JSON.stringify(result).includes("account-1"), false);
  assert.equal(JSON.stringify(result).includes("project-1"), false);
});

test("fails closed on cross-account or cross-project evidence", () => {
  const cloudflare = evidence();
  cloudflare.cloudflare.resourceBindingId = "other-account";
  assert.throws(
    () => deriveUlcLinzM5AccountBoundDpaEvidence(cloudflare, bindings),
    /Cloudflare account DPA binding is invalid/,
  );

  const neon = evidence();
  neon.neon.resourceBindingId = "other-project";
  assert.throws(
    () => deriveUlcLinzM5AccountBoundDpaEvidence(neon, bindings),
    /Neon account DPA binding is invalid/,
  );
});

test("fails closed on boolean-style, uncorrelated or weak evidence", () => {
  for (const value of [
    true,
    { dpa: true },
    { ...evidence(), evidenceSource: "operator-checkbox" },
    {
      ...evidence(),
      cloudflare: { ...evidence().cloudflare, evidenceDigest: "verified" },
    },
    {
      ...evidence(),
      neon: { ...evidence().neon, documentReference: "https://console.neon.tech/" },
    },
  ]) {
    assert.throws(() => deriveUlcLinzM5AccountBoundDpaEvidence(value, bindings));
  }
});

test("requires the contract record to share the correlated production evidence window", () => {
  const value = evidence();
  value.observedAt = "2026-08-24T03:59:59.000Z";
  assert.throws(
    () => deriveUlcLinzM5AccountBoundDpaEvidence(value, bindings),
    /root binding is invalid/,
  );
});

test("parses only bounded JSON input", () => {
  assert.deepEqual(parseUlcLinzM5AccountBoundDpaEvidenceJson(JSON.stringify(evidence())), evidence());
  assert.throws(() => parseUlcLinzM5AccountBoundDpaEvidenceJson(""));
  assert.throws(() => parseUlcLinzM5AccountBoundDpaEvidenceJson("not-json"));
});

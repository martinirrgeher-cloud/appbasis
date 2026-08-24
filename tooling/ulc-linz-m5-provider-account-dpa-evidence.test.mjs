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

test("derives only account-specific DPA entries from an exact protected contract record and live window", () => {
  const result = deriveUlcLinzM5AccountBoundDpaEvidence(evidence(), bindings);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map(({ provider, documentType, accountSpecific, publicBaseline, observedAt, validUntilOrReviewAt }) => ({
      provider,
      documentType,
      accountSpecific,
      publicBaseline,
      observedAt,
      validUntilOrReviewAt,
    })),
    [
      {
        provider: "cloudflare",
        documentType: "dpa-account-binding",
        accountSpecific: true,
        publicBaseline: false,
        observedAt: OBSERVED_AT,
        validUntilOrReviewAt: VALID_UNTIL,
      },
      {
        provider: "neon-databricks",
        documentType: "dpa-account-binding",
        accountSpecific: true,
        publicBaseline: false,
        observedAt: OBSERVED_AT,
        validUntilOrReviewAt: VALID_UNTIL,
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
    {
      ...evidence(),
      observedAt: OBSERVED_AT,
      validUntilOrReviewAt: VALID_UNTIL,
    },
  ]) {
    assert.throws(() => deriveUlcLinzM5AccountBoundDpaEvidence(value, bindings));
  }
});

test("requires a canonical positive live production evidence window", () => {
  assert.throws(
    () => deriveUlcLinzM5AccountBoundDpaEvidence(evidence(), {
      ...bindings,
      observedAt: "2026-08-24T04:00:00Z",
    }),
    /observedAt is invalid/,
  );
  assert.throws(
    () => deriveUlcLinzM5AccountBoundDpaEvidence(evidence(), {
      ...bindings,
      validUntilOrReviewAt: OBSERVED_AT,
    }),
    /window is invalid/,
  );
});

test("parses only bounded JSON input", () => {
  assert.deepEqual(parseUlcLinzM5AccountBoundDpaEvidenceJson(JSON.stringify(evidence())), evidence());
  assert.throws(() => parseUlcLinzM5AccountBoundDpaEvidenceJson(""));
  assert.throws(() => parseUlcLinzM5AccountBoundDpaEvidenceJson("not-json"));
});

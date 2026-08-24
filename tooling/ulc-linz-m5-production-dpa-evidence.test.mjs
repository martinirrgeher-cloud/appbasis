import assert from "node:assert/strict";
import test from "node:test";

import { completeUlcLinzM5ProductionDpaBundle } from "./ulc-linz-m5-production-dpa-evidence.mjs";

const OBSERVED_AT = "2026-08-24T04:00:00.000Z";
const VALID_UNTIL = "2026-08-24T04:15:00.000Z";

function bundle() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    ownerInputs: {
      providerBoundEvidenceInput: {
        resourceBindingEvidence: {
          application: "ulc-linz",
          environment: "production",
          observedAt: OBSERVED_AT,
          validUntilOrReviewAt: VALID_UNTIL,
          cloudflare: { accountBindingId: "account-1" },
          neon: { projectBindingId: "project-1" },
        },
        complianceEvidence: {
          application: "ulc-linz",
          environment: "production",
          observedAt: OBSERVED_AT,
          validUntilOrReviewAt: VALID_UNTIL,
          legalEvidence: [
            {
              provider: "cloudflare",
              documentType: "dpa",
              canonicalSource: "https://www.cloudflare.com/cloudflare-customer-dpa/",
            },
          ],
        },
      },
    },
  };
}

function accountEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "protected-operator-contract-record",
    cloudflare: {
      resourceBindingId: "account-1",
      documentReference: "urn:appbasis:operator-contract-record:cloudflare",
      evidenceDigest: `sha256:${"a".repeat(64)}`,
    },
    neon: {
      resourceBindingId: "project-1",
      documentReference: "urn:appbasis:operator-contract-record:neon",
      evidenceDigest: `sha256:${"b".repeat(64)}`,
    },
  };
}

test("adds only the two resource-bound account DPA entries after live legal baseline collection", () => {
  const result = completeUlcLinzM5ProductionDpaBundle(bundle(), accountEvidence());
  const legal = result.ownerInputs.providerBoundEvidenceInput.complianceEvidence.legalEvidence;
  assert.equal(legal.length, 3);
  assert.deepEqual(
    legal.slice(1).map((entry) => [entry.provider, entry.documentType]),
    [
      ["cloudflare", "dpa-account-binding"],
      ["neon-databricks", "dpa-account-binding"],
    ],
  );
  assert.deepEqual(
    legal.slice(1).map((entry) => [entry.observedAt, entry.validUntilOrReviewAt]),
    [
      [OBSERVED_AT, VALID_UNTIL],
      [OBSERVED_AT, VALID_UNTIL],
    ],
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("account-1"), true);
  assert.equal(serialized.includes("project-1"), true);
  assert.equal(serialized.includes("protected-operator-contract-record"), false);
});

test("rejects preclaimed DPA account evidence and cross-resource bindings", () => {
  const preclaimed = bundle();
  preclaimed.ownerInputs.providerBoundEvidenceInput.complianceEvidence.legalEvidence.push({
    documentType: "dpa-account-binding",
  });
  assert.throws(
    () => completeUlcLinzM5ProductionDpaBundle(preclaimed, accountEvidence()),
    /already present/,
  );

  const wrong = accountEvidence();
  wrong.cloudflare.resourceBindingId = "other-account";
  assert.throws(
    () => completeUlcLinzM5ProductionDpaBundle(bundle(), wrong),
    /Cloudflare account DPA binding is invalid/,
  );
});

test("requires live provider evidence before DPA completion", () => {
  const missing = bundle();
  missing.ownerInputs.providerBoundEvidenceInput.complianceEvidence.legalEvidence = [];
  assert.throws(
    () => completeUlcLinzM5ProductionDpaBundle(missing, accountEvidence()),
    /requires live provider evidence first/,
  );
});

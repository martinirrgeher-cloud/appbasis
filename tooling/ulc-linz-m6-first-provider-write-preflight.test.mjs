import assert from "node:assert/strict";
import test from "node:test";

import {
  ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT,
  UlcLinzM6FirstProviderWritePreflightError,
  evaluateUlcLinzM6FirstProviderWritePreflight,
} from "./ulc-linz-m6-first-provider-write-preflight.mjs";

const NOW = new Date("2026-08-18T18:45:00.000Z");

function validEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-18T18:44:00.000Z",
    validUntilOrReviewAt: "2026-08-18T18:54:00.000Z",
    source: "provider-api",
    neon: {
      inventoryComplete: true,
      projects: [
        { name: "appbasis-m3-preview", region: "aws-us-east-2" },
        { name: "appbasis-m4-r2-restore", region: "aws-us-east-1" },
        { name: "appbasis-reference-preview", region: "aws-us-east-1" },
      ],
      targetRegionAvailable: true,
      selectedCreateMethodSupportsExplicitRegion: true,
    },
  };
}

test("ULC M6 first provider-write preflight stays blocked on explicit approval even when provider inventory is clean", () => {
  const result = evaluateUlcLinzM6FirstProviderWritePreflight(validEvidence(), {
    now: NOW,
  });

  assert.equal(result.status, "ready-for-explicit-provider-write-approval");
  assert.equal(result.providerInventoryVerified, true);
  assert.equal(result.noExistingProductionResourceCandidate, true);
  assert.equal(result.targetRegionAvailable, true);
  assert.equal(result.selectedCreateMethodSupportsExplicitRegion, true);
  assert.equal(result.explicitRegionSelectionRequired, true);
  assert.equal(result.providerDefaultRegionAllowed, false);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.explicitApprovalRequired, true);
  assert.deepEqual(result.firstProviderWrite, {
    stepId: "neon-production-database",
    provider: "neon",
    projectName: "appbasis-ulc-linz-production",
    region: "aws-eu-central-1",
    explicitRegionSelectionRequired: true,
    providerDefaultRegionAllowed: false,
    existingProductionCandidateAllowed: false,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.firstProviderWrite), true);
});

test("ULC M6 provider-write safety contract pins Frankfurt and forbids default-region fallback", () => {
  const contract = ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT;

  assert.deepEqual(contract.firstProviderWrite, {
    stepId: "neon-production-database",
    provider: "neon",
    projectName: "appbasis-ulc-linz-production",
    region: "aws-eu-central-1",
    explicitRegionSelectionRequired: true,
    providerDefaultRegionAllowed: false,
    existingProductionCandidateAllowed: false,
  });
});

test("ULC M6 provider-write safety contract keeps workers.dev and Preview URLs closed before application code upload", () => {
  const worker =
    ULC_LINZ_M6_PROVIDER_WRITE_SAFETY_CONTRACT.cloudflareWorkerCreation;

  assert.deepEqual(worker, {
    workerName: "appbasis-ulc-linz-production",
    workersDev: false,
    previewUrls: false,
    publicIngress: false,
    ingressStateMustBeAppliedAtInitialCreateOrFirstDeploy: true,
    closedIngressRequiredBeforeApplicationCodeUpload: true,
  });
});

test("ULC M6 provider preflight allows a distinct ULC preview project without treating it as production", () => {
  const evidence = validEvidence();
  evidence.neon.projects.push({
    name: "appbasis-ulc-linz-preview",
    region: "aws-eu-central-1",
  });

  const result = evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
    now: NOW,
  });
  assert.equal(result.noExistingProductionResourceCandidate, true);
});

test("ULC M6 provider preflight fails closed when the exact production project already exists", () => {
  const evidence = validEvidence();
  evidence.neon.projects.push({
    name: "appbasis-ulc-linz-production",
    region: "aws-eu-central-1",
  });

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("EXISTING_PRODUCTION_RESOURCE_CANDIDATE"),
  );
});

test("ULC M6 provider preflight fails closed on an ambiguous existing ULC production candidate", () => {
  const evidence = validEvidence();
  evidence.neon.projects.push({
    name: "legacy-ulc-linz-prod-db",
    region: "aws-eu-central-1",
  });

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("EXISTING_PRODUCTION_RESOURCE_CANDIDATE"),
  );
});

test("ULC M6 provider preflight fails closed when Neon inventory is incomplete", () => {
  const evidence = validEvidence();
  evidence.neon.inventoryComplete = false;

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("NEON_PREFLIGHT_INVALID"),
  );
});

test("ULC M6 provider preflight fails closed when Frankfurt is unavailable", () => {
  const evidence = validEvidence();
  evidence.neon.targetRegionAvailable = false;

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("NEON_PREFLIGHT_INVALID"),
  );
});

test("ULC M6 provider preflight fails closed when the selected create mechanism cannot explicitly select the region", () => {
  const evidence = validEvidence();
  evidence.neon.selectedCreateMethodSupportsExplicitRegion = false;

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("NEON_PREFLIGHT_INVALID"),
  );
});

test("ULC M6 provider preflight rejects stale or overlong evidence windows", () => {
  const stale = validEvidence();
  stale.observedAt = "2026-08-18T18:20:00.000Z";
  stale.validUntilOrReviewAt = "2026-08-18T18:50:00.000Z";

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(stale, {
        now: NOW,
      }),
    errorWithCode("STALE_EVIDENCE"),
  );

  const overlong = validEvidence();
  overlong.validUntilOrReviewAt = "2026-08-18T19:04:00.000Z";
  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(overlong, {
        now: NOW,
      }),
    errorWithCode("STALE_EVIDENCE"),
  );
});

test("ULC M6 provider preflight accepts only authoritative provider API evidence", () => {
  const evidence = validEvidence();
  evidence.source = "operator-assertion";

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("INVALID_EVIDENCE"),
  );
});

test("ULC M6 provider preflight rejects unsafe provider inventory evidence", () => {
  const evidence = validEvidence();
  evidence.neon.projects[0].name = "postgres://example.invalid/secret";

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("UNSAFE_EVIDENCE"),
  );
});

test("ULC M6 provider preflight rejects array prototype manipulation before using provider inventory", () => {
  const evidence = validEvidence();
  Object.setPrototypeOf(evidence.neon.projects, {
    map() {
      throw new Error("must not execute attacker-controlled map");
    },
  });

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("UNSAFE_EVIDENCE"),
  );
});

test("ULC M6 provider preflight rejects extra evidence fields fail-closed", () => {
  const evidence = validEvidence();
  evidence.neon.connection = "opaque-but-unexpected";

  assert.throws(
    () =>
      evaluateUlcLinzM6FirstProviderWritePreflight(evidence, {
        now: NOW,
      }),
    errorWithCode("NEON_PREFLIGHT_INVALID"),
  );
});

function errorWithCode(code) {
  return (error) => {
    assert.equal(
      error instanceof UlcLinzM6FirstProviderWritePreflightError,
      true,
    );
    assert.equal(error.code, code);
    return true;
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzHighPrivacyProductionEvidence,
  deriveUlcLinzHighPrivacyProductionEvidenceFromOwners,
  deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners,
  evaluateUlcLinzHighPrivacyCompliance,
  ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS,
} from "./ulc-linz-m5-high-privacy-evidence.mjs";

const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

function completeEvidence() {
  return Object.fromEntries(
    ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS.map((requirement) => [
      requirement,
      true,
    ]),
  );
}

test("keeps ULC High-Privacy fail-closed until every canonical requirement is evidenced", () => {
  const compliance = evaluateUlcLinzHighPrivacyCompliance(
    VALID_ULC_DEFINITION,
    {},
  );

  assert.deepEqual(compliance, {
    appId: "ulc-linz",
    profileId: "appbasis-high-privacy-v0.1",
    status: "open",
    highPrivacyProfile: false,
    verifiedCount: 0,
    requiredCount: 7,
    requirements: ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS.map((id) => ({
      id,
      status: "open",
    })),
  });
  assert.deepEqual(
    deriveUlcLinzHighPrivacyProductionEvidence(VALID_ULC_DEFINITION, {}),
    {},
  );
});

test("emits app-specific M5-I evidence only when all canonical requirements are explicitly true", () => {
  const evidence = completeEvidence();
  const compliance = evaluateUlcLinzHighPrivacyCompliance(
    VALID_ULC_DEFINITION,
    evidence,
  );

  assert.equal(compliance.status, "verified");
  assert.equal(compliance.highPrivacyProfile, true);
  assert.equal(compliance.verifiedCount, compliance.requiredCount);
  assert.equal(Object.isFrozen(compliance), true);
  assert.equal(Object.isFrozen(compliance.requirements), true);
  assert.equal(
    compliance.requirements.every(
      (requirement) =>
        Object.isFrozen(requirement) && requirement.status === "verified",
    ),
    true,
  );
  assert.deepEqual(
    deriveUlcLinzHighPrivacyProductionEvidence(
      VALID_ULC_DEFINITION,
      evidence,
    ),
    { highPrivacyProfile: true },
  );
});

test("derives current repository-backed High-Privacy requirements from real B/C/D/E owners instead of a requirement fixture", async () => {
  const evidence = await deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners(
    process.cwd(),
    VALID_ULC_DEFINITION,
    {
      auditSecurityLoggingEvidence: { auditSecurityLogging: true },
    },
  );

  assert.deepEqual(evidence, {
    securityPrivacyGate: false,
    backupRestoreBeforeProduction: false,
    accessControl: true,
    privilegeModel: false,
    secretsInNormalAppManifest: true,
    privilegedControlPlanePublicIngress: false,
    operatorUseCaseAssessment: false,
  });
  assert.equal(Object.isFrozen(evidence), true);
  assert.deepEqual(
    await deriveUlcLinzHighPrivacyProductionEvidenceFromOwners(
      process.cwd(),
      VALID_ULC_DEFINITION,
      {
        auditSecurityLoggingEvidence: { auditSecurityLogging: true },
      },
    ),
    {},
  );
});

test("does not accept raw High-Privacy requirement booleans as owner-backed evidence", async () => {
  await assert.rejects(
    () =>
      deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners(
        process.cwd(),
        VALID_ULC_DEFINITION,
        {
          accessControl: true,
          privilegeModel: true,
        },
      ),
    /owner inputs are invalid/,
  );
});

test("keeps M5-I open when any one High-Privacy requirement is false or missing", () => {
  const falseEvidence = completeEvidence();
  falseEvidence.operatorUseCaseAssessment = false;

  const falseCompliance = evaluateUlcLinzHighPrivacyCompliance(
    VALID_ULC_DEFINITION,
    falseEvidence,
  );
  assert.equal(falseCompliance.status, "open");
  assert.equal(falseCompliance.highPrivacyProfile, false);
  assert.equal(falseCompliance.verifiedCount, 6);

  const missingEvidence = completeEvidence();
  delete missingEvidence.privilegedControlPlanePublicIngress;
  const missingCompliance = evaluateUlcLinzHighPrivacyCompliance(
    VALID_ULC_DEFINITION,
    missingEvidence,
  );
  assert.equal(missingCompliance.status, "open");
  assert.equal(missingCompliance.highPrivacyProfile, false);
});

test("rejects evidence for another app before it can contribute to M5-I", () => {
  assert.throws(
    () =>
      evaluateUlcLinzHighPrivacyCompliance(
        {
          ...VALID_ULC_DEFINITION,
          appId: "reference",
          displayName: "Reference",
        },
        completeEvidence(),
      ),
    /requires appId ulc-linz/,
  );
});

test("rejects unknown, accessor, symbol and non-boolean High-Privacy evidence", () => {
  assert.throws(
    () =>
      evaluateUlcLinzHighPrivacyCompliance(VALID_ULC_DEFINITION, {
        ...completeEvidence(),
        unexpected: true,
      }),
    /requirement evidence is invalid/,
  );

  const accessorEvidence = completeEvidence();
  Object.defineProperty(accessorEvidence, "operatorUseCaseAssessment", {
    enumerable: true,
    get() {
      return true;
    },
  });
  assert.throws(
    () =>
      evaluateUlcLinzHighPrivacyCompliance(
        VALID_ULC_DEFINITION,
        accessorEvidence,
      ),
    /requirement evidence is invalid/,
  );

  const symbolEvidence = completeEvidence();
  symbolEvidence[Symbol("extra")] = true;
  assert.throws(
    () =>
      evaluateUlcLinzHighPrivacyCompliance(
        VALID_ULC_DEFINITION,
        symbolEvidence,
      ),
    /requirement evidence is invalid/,
  );

  assert.throws(
    () =>
      evaluateUlcLinzHighPrivacyCompliance(VALID_ULC_DEFINITION, {
        ...completeEvidence(),
        accessControl: "true",
      }),
    /requirement evidence is invalid/,
  );
});

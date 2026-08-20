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
    ULC_LINZ_HIGH_PRIVACY_REQUIREMENTS.map((requirement) => [requirement, true]),
  );
}

test("keeps ULC High-Privacy fail-closed until every canonical requirement is evidenced", () => {
  const compliance = evaluateUlcLinzHighPrivacyCompliance(VALID_ULC_DEFINITION, {});
  assert.equal(compliance.highPrivacyProfile, false);
  assert.equal(compliance.verifiedCount, 0);
  assert.equal(compliance.requiredCount, 7);
  assert.deepEqual(
    deriveUlcLinzHighPrivacyProductionEvidence(VALID_ULC_DEFINITION, {}),
    {},
  );
});

test("emits app-specific M5-I evidence only when all canonical requirements are true", () => {
  const evidence = completeEvidence();
  const compliance = evaluateUlcLinzHighPrivacyCompliance(
    VALID_ULC_DEFINITION,
    evidence,
  );
  assert.equal(compliance.status, "verified");
  assert.equal(compliance.highPrivacyProfile, true);
  assert.equal(compliance.verifiedCount, compliance.requiredCount);
  assert.deepEqual(
    deriveUlcLinzHighPrivacyProductionEvidence(VALID_ULC_DEFINITION, evidence),
    { highPrivacyProfile: true },
  );
});

test("derives stable access, least-privilege, secret and operator requirements from current repository owners", async () => {
  const evidence = await deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners(
    process.cwd(),
    VALID_ULC_DEFINITION,
    {},
  );

  assert.deepEqual(evidence, {
    securityPrivacyGate: false,
    backupRestoreBeforeProduction: false,
    accessControl: true,
    privilegeModel: true,
    secretsInNormalAppManifest: true,
    privilegedControlPlanePublicIngress: false,
    operatorUseCaseAssessment: true,
  });
  assert.deepEqual(
    await deriveUlcLinzHighPrivacyProductionEvidenceFromOwners(
      process.cwd(),
      VALID_ULC_DEFINITION,
      {},
    ),
    {},
  );
});

test("does not accept legacy raw booleans as owner-backed operational evidence", async () => {
  for (const ownerInputs of [
    { auditSecurityLoggingEvidence: { auditSecurityLogging: true } },
    { backupRestoreEvidence: { backupRestoreBeforeProduction: true } },
    { leastPrivilegeEvidence: { leastPrivilege: true } },
    { operatorUseCaseAssessmentEvidence: { operatorUseCaseAssessment: true } },
  ]) {
    await assert.rejects(
      () =>
        deriveUlcLinzHighPrivacyRequirementEvidenceFromOwners(
          process.cwd(),
          VALID_ULC_DEFINITION,
          ownerInputs,
        ),
      /owner inputs are invalid/,
    );
  }
});

test("keeps M5-I open when any one High-Privacy requirement is false or missing", () => {
  const falseEvidence = completeEvidence();
  falseEvidence.operatorUseCaseAssessment = false;
  assert.equal(
    evaluateUlcLinzHighPrivacyCompliance(
      VALID_ULC_DEFINITION,
      falseEvidence,
    ).highPrivacyProfile,
    false,
  );

  const missingEvidence = completeEvidence();
  delete missingEvidence.privilegedControlPlanePublicIngress;
  assert.equal(
    evaluateUlcLinzHighPrivacyCompliance(
      VALID_ULC_DEFINITION,
      missingEvidence,
    ).highPrivacyProfile,
    false,
  );
});

test("rejects evidence for another app and malformed low-level requirement evidence", () => {
  assert.throws(
    () =>
      evaluateUlcLinzHighPrivacyCompliance(
        { ...VALID_ULC_DEFINITION, appId: "reference", displayName: "Reference" },
        completeEvidence(),
      ),
    /requires appId ulc-linz/,
  );

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
    get() { return true; },
  });
  assert.throws(
    () => evaluateUlcLinzHighPrivacyCompliance(VALID_ULC_DEFINITION, accessorEvidence),
    /requirement evidence is invalid/,
  );
});
